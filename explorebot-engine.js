// explorebot-engine.js -- runs Explorebot's explorebot.api.suggest_csv() inside a
// self-hosted Pyodide runtime. window/document 非依存 (Web Worker からも
// そのまま import できる -- Surrobot の treg-engine.js と同じ設計:
// オーケストレーションはこのファイルだけが知っていて、worker側は中継のみ)。
//
// explorebot/ 本体（コアパッケージ）は無改変で、Pythonソースを一切書き写して
// いない -- 学習済みwheelをそのまま実行するだけ（docs/WEBAPP_PLAN.md 依存
// 関係ポリシー: コアはexe同様numpy/scipyのみ、フロント結線コードは制約なし）。
//
// Pyodide本体とnumpy/scipyは ./vendor/pyodide/ にローカル同梱（Surrobotからの
// フェーズ0取り込み分）。CDN(jsdelivr等)には一切アクセスしない。
const PYODIDE_BASE = "./vendor/pyodide/";
const DEPS = ["numpy", "scipy"];

let _pyodide = null;
let _ready = false;
let _version = null;

export function isReady() {
  return _ready;
}

// Pyodide起動 + numpy/scipyロード + explorebot wheelのインストール（初回のみ重い）。
// wheelは micropip を使わず sys.path に直接差し込む: Surrobotのvendorには
// micropip が同梱されておらず（本体が使っていないため）、CDN取得もこの構成では
// 不要にできる。wheelはただのzipなので、explorebot自身の`explorebot latest`
// コマンドが使う_WheelFinderと同じ発想で import 可能（vendor互換確認
// 2026-08-01で検証済み。docs/WEBAPP_PLAN.md §6リスク表参照）。
export async function initEngine({ onStatus, onLog } = {}) {
  if (_ready) return _version;

  onStatus?.("boot");
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
  _pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });

  onStatus?.("libs");
  await _pyodide.loadPackage(DEPS, { messageCallback: () => {} });

  onStatus?.("wheel");
  const manifestRes = await fetch("./py/manifest.json");
  if (!manifestRes.ok) {
    throw new Error(`wheelマニフェスト取得失敗 (./py/manifest.json, status ${manifestRes.status})`);
  }
  const { wheel } = await manifestRes.json();
  if (!wheel) throw new Error("./py/manifest.json に wheel エントリがありません");
  const wheelRes = await fetch(`./py/${wheel}`);
  if (!wheelRes.ok) throw new Error(`wheel取得失敗 (./py/${wheel}, status ${wheelRes.status})`);
  const wheelBuf = new Uint8Array(await wheelRes.arrayBuffer());
  _pyodide.FS.writeFile("/tmp/explorebot.whl", wheelBuf);
  _pyodide.runPython(`import sys\nif "/tmp/explorebot.whl" not in sys.path:\n    sys.path.insert(0, "/tmp/explorebot.whl")`);

  // 以降の標準出力/標準エラーはログとして中継するだけ（SurrobotのPROGRESS:のような
  // 独自プレフィックスはexplorebot側にまだ無いので今は素通し。将来 quick.py 等が
  // 進捗を印字するようになれば、ここでプレフィックス解析を足す）。
  _pyodide.setStdout({ batched: (s) => { if (s.trim()) onLog?.(s); } });
  _pyodide.setStderr({ batched: (s) => { if (s.trim()) onLog?.("[err] " + s); } });

  onStatus?.("ready");
  _version = _pyodide.runPython("import explorebot; explorebot.__version__");
  _ready = true;
  return _version;
}

export function version() {
  return _version;
}

// テスト専用フック(webapp/scripts/verify_sim_http.mjs)。検証スクリプトは既に
// 自前でPyodideを起動しwheelを差し込んでいるため、重いinitEngine()を通さずに
// エクスポート関数だけを実行できるようにする。アプリ本体からは呼ばれない。
export function __setPyodideForTest(py) {
  _pyodide = py;
  _ready = true;
}

// ---------------------------------------------------------------- 直列化ロック
// **重要(v0.19で修正した実バグ)**: 以下のエクスポート関数はどれも引数を
// `_pyodide.globals.set("_tf_...")` という**インタプリタ内グローバル変数**経由で
// Pythonへ渡している。`runPythonAsync`はawaitで制御を返すため、複数の呼び出しが
// 並行すると「全員がグローバルを書いた後に、全員が最後の値で実行する」という
// 競合が起きる。
//
// 実害: app.jsがコンター3枚を`Promise.all`で同時に要求していたため、3枚とも
// 最後に書かれた(x_col,y_col)で計算され、「軸セレクタを変えても3枚とも同じ図に
// なる」「セレクタの表示と図中のラベルが食い違う」というバグになっていた
// (実機スクリーンショットで発覚)。Web Worker経由(explorebot-worker.js)でも
// onmessageが並行に走るため同じ問題が起きる。
//
// 対策: Pyodideに触る処理全体をこのミューテックスで直列化する。呼び出し側が
// 何個同時に投げても、グローバルの設定→Python実行が原子的に完了する。
// (app.js側でも逐次呼び出しに変えているが、ここで守るのが根本対策 --
//  将来また並行呼び出しを書いても壊れない。)
let _pyChain = Promise.resolve();
function withPyLock(fn) {
  const result = _pyChain.then(fn);
  _pyChain = result.then(() => {}, () => {});   // 失敗しても後続を止めない
  return result;
}

// csvText: 観測データCSV文字列。opts: explorebot.api.suggest_csv と同じオプション
// 辞書（bounds/goal/propose/return_csv等）。戻り値は統一JSONペイロード
// (phase/observed/x_next/predicted_*/proposals?/csv?) -- exe(append --json)・
// API(POST /suggest)と完全に同一スキーマ（v0.9.14で確立した「APIが単一の真実」）。
export async function suggest(csvText, opts = {}) {
  if (!_ready) throw new Error("エンジン未初期化 (initEngineが先に必要)");
  return withPyLock(async () => {
    _pyodide.globals.set("_tf_csv_text", csvText);
    _pyodide.globals.set("_tf_opts_json", JSON.stringify(opts));
    const resultJson = await _pyodide.runPythonAsync(`
import json as _tf_json
from explorebot.api import suggest_csv as _tf_suggest_csv
_tf_json.dumps(_tf_suggest_csv(_tf_csv_text, _tf_json.loads(_tf_opts_json)))
`);
    return JSON.parse(resultJson);
  });
}

// --- シミュレータセッション (docs/WEBAPP_SIM_PLAN.md, v0.11) ---------------
// simStart: 1回だけの重いGP学習。学習済みモデルはPyodideインタープリタ内
// (explorebot.api._SIM)に常駐する。戻り値は統一ペイロード + payload.sim
// (slider_spec / y_hist / initial_values / model_ready)。
export async function simStart(csvText, opts = {}) {
  if (!_ready) throw new Error("エンジン未初期化 (initEngineが先に必要)");
  return withPyLock(async () => {
    _pyodide.globals.set("_tf_csv_text", csvText);
    _pyodide.globals.set("_tf_opts_json", JSON.stringify(opts));
    const resultJson = await _pyodide.runPythonAsync(`
import json as _tf_json
from explorebot.api import sim_start as _tf_sim_start
_tf_json.dumps(_tf_sim_start(_tf_csv_text, _tf_json.loads(_tf_opts_json)))
`);
    return JSON.parse(resultJson);
  });
}

// simEval: スライダー操作のたびに呼ぶ軽い予測(常駐モデルへのバッチpredict1回)。
// values: {列名: 数値} 全x列分。戻り値 {point:{mean,std},
// slices:{列名:{grid[],mean[],std[]}}}。
export async function simEval(values, grid = 41) {
  if (!_ready) throw new Error("エンジン未初期化 (initEngineが先に必要)");
  return withPyLock(async () => {
    _pyodide.globals.set("_tf_values_json", JSON.stringify(values));
    _pyodide.globals.set("_tf_grid", grid);
    const resultJson = await _pyodide.runPythonAsync(`
import json as _tf_json
from explorebot.api import sim_eval as _tf_sim_eval
_tf_json.dumps(_tf_sim_eval(_tf_json.loads(_tf_values_json), grid=int(_tf_grid)))
`);
    return JSON.parse(resultJson);
  });
}

// simSurface: 選んだ2変数(x_col,y_col)についてグリッド上で常駐GPを1回バッチ
// predictし、他の変数はvaluesの現在値に固定した「コンター」データを返す
// (v0.14 画面再設計)。戻り値 {x_col,y_col,xs[],ys[],mean[grid][grid]}。
export async function simSurface(values, xCol, yCol, grid = 28) {
  if (!_ready) throw new Error("エンジン未初期化 (initEngineが先に必要)");
  return withPyLock(async () => {
    _pyodide.globals.set("_tf_values_json", JSON.stringify(values));
    _pyodide.globals.set("_tf_x_col", xCol);
    _pyodide.globals.set("_tf_y_col", yCol);
    _pyodide.globals.set("_tf_grid", grid);
    const resultJson = await _pyodide.runPythonAsync(`
import json as _tf_json
from explorebot.api import sim_surface as _tf_sim_surface
_tf_json.dumps(_tf_sim_surface(_tf_json.loads(_tf_values_json), _tf_x_col, _tf_y_col, grid=int(_tf_grid)))
`);
    return JSON.parse(resultJson);
  });
}

// simMakeCsv: 現在のスライダー座標(y空欄)を元CSVに追記した更新CSV文字列を返す。
// 追記行の書式(sig-figs丸め・id採番)はexeのappendと同一実装。
// onlyNew=true なら「ヘッダー＋新しい候補行だけ」のCSVを返す（観測データを
// 丸ごと含めない。webappのダウンロードボタン用、v0.25）。
export async function simMakeCsv(values, onlyNew = false) {
  if (!_ready) throw new Error("エンジン未初期化 (initEngineが先に必要)");
  return withPyLock(async () => {
    _pyodide.globals.set("_tf_values_json", JSON.stringify(values));
    _pyodide.globals.set("_tf_only_new", !!onlyNew);
    return await _pyodide.runPythonAsync(`
import json as _tf_json
from explorebot.api import sim_make_csv as _tf_sim_make_csv
_tf_sim_make_csv(_tf_json.loads(_tf_values_json), only_new=bool(_tf_only_new))
`);
  });
}
