// explorebot-worker-client.js -- メインスレッドから explorebot-worker.js を呼ぶための薄いプロキシ。
// explorebot-engine.js と同一の関数シグネチャ(isReady/initEngine/suggest)をexportするため、
// src/index.html 側の呼び出しコードはWorker化の有無で書き方を変えなくて済む
// （Surrobotのtreg-worker-client.jsと同じ構図）。
let _worker = null;
let _ready = false;
let _nextId = 1;
const _pending = new Map(); // requestId -> { resolve, reject, onLog?, onStatus? }

function ensureWorker() {
  if (_worker) return _worker;
  _worker = new Worker("./explorebot-worker.js", { type: "module" });
  _worker.onmessage = (ev) => onMessage(ev.data);
  _worker.onerror = (ev) => onWorkerCrash(ev);
  return _worker;
}

function onMessage(msg) {
  const p = _pending.get(msg.requestId);
  if (!p) return; // 既にresolve/reject済みのリクエストからの残留メッセージは無視
  switch (msg.type) {
    case "status":
      p.onStatus?.(msg.text);
      break;
    case "log":
      p.onLog?.(msg.line);
      break;
    case "complete":
      _pending.delete(msg.requestId);
      p.resolve(msg.payload);
      break;
    case "error":
      _pending.delete(msg.requestId);
      p.reject(new Error(msg.message));
      break;
  }
}

// Workerがクラッシュした場合、保留中の全リクエストを失敗させ、次回呼び出し時に
// 新しいWorkerをゼロから生成してやり直せるようにする(自己修復)。
function onWorkerCrash(ev) {
  const message = "計算エンジン(Worker)がクラッシュしました: " + (ev?.message || ev);
  for (const [, p] of _pending) p.reject(new Error(message));
  _pending.clear();
  _worker = null;
  _ready = false;
}

function call(type, extra, cbs = {}) {
  return new Promise((resolve, reject) => {
    const requestId = _nextId++;
    _pending.set(requestId, { resolve, reject, ...cbs });
    try {
      ensureWorker().postMessage({ type, requestId, ...extra });
    } catch (e) {
      _pending.delete(requestId);
      reject(e);
    }
  });
}

export function isReady() {
  return _ready;
}

export async function initEngine({ onStatus, onLog } = {}) {
  if (_ready) return;
  await call("init", {}, { onStatus, onLog });
  _ready = true;
}

export async function suggest(csvText, opts = {}) {
  const { result } = await call("suggest", { csvText, opts });
  return result;
}

export async function simStart(csvText, opts = {}) {
  const { result } = await call("simStart", { csvText, opts });
  return result;
}

export async function simEval(values, grid = 41) {
  const { result } = await call("simEval", { values, grid });
  return result;
}

export async function simSurface(values, xCol, yCol, grid = 28) {
  const { result } = await call("simSurface", { values, xCol, yCol, grid });
  return result;
}

export async function simMakeCsv(values, onlyNew = false) {
  const { result } = await call("simMakeCsv", { values, onlyNew });
  return result;
}

// app.js（対話UI本体）はオンライン版・オフライン版で共有する単一ソースにするため、
// ESモジュールのimport/exportを使わない普通の<script>にしている（オフライン版
// (file://直開き)ではESモジュールのimport/importmap/type=module CORSブロックに
// 阻まれるため -- src/offline-engine.jsの冒頭コメント参照）。このファイルは
// <script type="module" src="./explorebot-worker-client.js">として読み込まれるので、
// export に加えてwindowにも同じ形で公開し、app.jsからは
// `window.ExplorebotEngine || window.ExplorebotEngineOnline` として参照する
// （オフライン版はwindow.ExplorebotEngineを同名で公開するので、app.js側の分岐は
// 「どちらが定義されているか」だけで済む）。
if (typeof window !== "undefined") {
  window.ExplorebotEngineOnline = { isReady, initEngine, suggest, simStart, simEval, simSurface, simMakeCsv };
}
