// app.js -- Explorebot Web のUI本体（v0.20 実機フィードバック一式。
// docs/WEBAPP_SIM_PLAN.md）。
//
// オンライン版・オフライン版で完全共有する単一ソース（ESモジュール不使用、
// 理由はオフライン版のfile://直開き。エンジンは window.ExplorebotEngine ||
// window.ExplorebotEngineOnline のどちらか定義済みの方）。
//
// v0.20の主な変更点（実機フィードバック）:
//   - zoom上限を1.25→2.4・余白24→16pxにして大画面で画面いっぱいに拡大
//     （縦横比とpx値はSurrobotのまま＝作りの相対関係は不変）
//   - コンター配色をviridis→**magma**へ。viridisは緑と青を含むため、
//     同色の候補マーカー(緑/青)が背景に紛れて目立たなかった
//   - コンター3枚の軸割当を貪欲法に作り直し。v0.19は変数5個のとき3枚目が
//     1枚目と同じ組に戻る欠陥があった（未使用列を優先し、組の重複はゼロ）
//   - 吹き出しに問いかけ「どんな追加点を探す？」を復活させボタンへ導線
//   - ボタン文言から★/◆記号を削除、「最適解を探したい」→「最適解を探す」
//     （対になる「精度をあげたい」も「精度をあげる」へ揃えた）
//   - 「選んだ候補をDL」を吹き出しの外・ロボの下へ移動（確定操作を分離）
//
// v0.19の主な変更点:
//   - **コンター3枚が同じ図になる実バグを修正**: エンジンがPyodideの
//     グローバル変数経由で引数を渡しており、Promise.allの並行呼び出しで
//     全員が最後の軸で計算されていた。両エンジンをミューテックスで直列化。
//   - キャンバスを1100x720(Surrobotと同一)にしてpx値が同じ実寸になるよう
//     修正。レイアウトも「左に全高のキャラクター列＋右にダッシュボード」へ。
//   - 等高線(marching squares)を追加、ドロップ文言を1行に簡素化。
//
// v0.18の主な変更点（実機フィードバック）:
//   - 吹き出しの3ボタン・ロボ画像を拡大（「アイコン、ボタンが小さい」）
//   - PCP候補の線・点、コンター候補マーカーの色を候補ごとに固定
//     (optimize=緑, accuracy=青。ボタンの色と揃えたので★=/◆=の説明文は
//     不要になり削除)
//   - コンター候補マーカーを★/◆から単純な●(塗り丸)へ変更。旧シアン/
//     ゴールドはコンター背景(特に左側シアン域)と被って見えない可視性
//     バグがあった
//   - simフェーズの吹き出し説明文("下のボタンで候補を選ぶと...")を撤去
//   - 「候補をDL」を「選んだ候補をDL」に変更
//   - PCP候補ポリラインの各軸頂点にカーソルを合わせると値を表示(title)
//   - コンターパネルを正方形化(`aspect-ratio:1/1`)
//   - PCPラップに残っていた前フェーズのcenter-note("GPを学習しています…"
//     等)が新しいSVGの下に消えずに重なって表示され続けるバグを修正
//     (ensurePcpSvg()で毎回.center-note/.drop-zoneを掃除するようにした)
//
// v0.17の主な変更点（実機フィードバック）:
//   - ヘッダー各部(ロゴ/言語トグル/歯車)のpx値をSurrobotへ厳密一致
//   - PCPのタイトル文字が軸ラベルと重なるバグ修正（タイトル要素ごと削除）
//   - status-barのengineBadge("explorebot / WASM")・resetBtn("別のCSVを
//     読み込む")を削除（画面全体D&Dで既に不要な導線だったため）
//   - **PCPレバードラッグを完全廃止**: 「レバーが動かない、この機能は
//     消してよい」とのフィードバックで自由探索そのものを廃止。代わりに
//     吹き出し内の3ボタン「最適解を探したい／精度をあげたい」(トグル、
//     複数選択可)「候補をDL」で操作する。トグルで選んだ候補(★=optimize/
//     ◆=accuracy)の設計をPCPに緑の実線＋青の点（線自体が明滅・発光）で
//     表示する。コンターパネルの★◆マーカーも同じ選択状態と連動して表示
//     /非表示を切り替える。「候補をDL」は選択中の候補(1つでも2つでも)を
//     sim_make_csv(v0.17でリスト入力対応に拡張)でCSVに追記しダウンロード。
//   - ライブなドラッグ再評価(evalNow/scheduleEval/lastEval)は不要になった
//     ため削除（候補の位置・予測値はpayload.proposalsに既にある既知の値で、
//     都度シミュレータへ問い合わせる必要がない）。
//   - コンターの配色をアプリ自身のアクセントカラー(シアン→ブルー→ゴールド)
//     の3段階グラデーションに刷新（旧シアン→暖色2色ブレンドは中間帯が
//     濁って見えていた）
//   - コンター3枚の軸割当を「変数が足りる限り3枚が互いに軸を共有しない
//     完全排他な組」を優先する方式に変更
//
// 画面構成:
//   左: マスコット＋吹き出し（ステータス文言＋3ボタン）。
//   右上: コンターパネル×3（各X/Y軸をセレクタで選択可）。選んだ2変数の
//   グリッド上で常駐GPを1回バッチpredictした値(`sim_surface`)を色で塗る
//   ヒートマップ/コンター表示。点として描くのは選択中の★最適候補・◆精度
//   向上候補のみ（観測データやSobol'点の散布はしない）。
//   下段: 全幅・薄いパラレルコーディネートプロット。ドラッグ操作は無く、
//   選択中の候補の設計を緑の線＋青の点で表示するのみの静的表示。
//   背景に敷く折れ線はSobol'低食い違い列で常駐GPをサンプリングした「場」の
//   みで、学習データそのものの折れ線は描かない（学習データではなくモデル
//   サンプリングを見せるという方針）。外挿警告（amber表示）は一切行わない。
//   CSVドロップは画面全体（document）どこでも受け付ける。ドラッグ中は
//   #globalDropOverlayを全面に表示して視覚的に伝える。
//
// 描画は「静的レイヤー」（軸・ラベル・Sobol場 -- sim開始時とリサイズ/
// 軸切替時だけ再構築）と「動的レイヤー」（選択中候補の線/点 -- 候補の
// 選択が変わるたびに再構築）に分離。コンターパネルはgrid×grid回の
// バッチpredictが必要な重い処理なので、候補選択の切替時にのみ再計算する。
(function () {
  "use strict";

  const tf = window.ExplorebotEngine || window.ExplorebotEngineOnline;
  if (!tf) {
    document.body.innerHTML =
      '<pre style="color:#ef5c5c;padding:2rem">計算エンジンが見つかりません ' +
      "(explorebot-worker-client.js / offline-engine.js が読み込まれていません)</pre>";
    return;
  }

  const Y_KEY = "__y__";
  const MIN_AXIS_GAP = 110;   // PCP軸間の最小間隔(px)。これを下回ると横スクロール
  const APP_VERSION = "0.29.0";
  const N_CONTOURS = 3;
  const SURFACE_GRID = 28;        // コンター1枚あたりgrid×gridの予測点数
  const N_ISO_LEVELS = 7;         // 等高線の本数(色ドメインを等分)

  // Surrobot Web版と**完全に同一**の boxed+zoom 方式（Surrobot
  // frontend/index.html の fitBoxedZoom() をそのまま移植）。
  //
  // **v0.19で判明した「サイズが合わない」の真因**: v0.13以降、ロゴ44px・
  // 言語トグル34px・歯車34pxとSurrobotと同じ絶対px値を指定していたのに
  // 実機では一回り小さく見えていた。原因はCSSではなく**論理キャンバスの
  // 分母**で、Explorebotだけ1500x950を使っていた(Surrobotは1100x720)。
  // 同じウィンドウなら zoom = w/1500 は w/1100 の約73%にしかならず、
  // 同じpx値でも物理サイズが27%小さくなる。キャンバス・クランプ値ともに
  // Surrobotへ揃えることで、同じpx指定が同じ実寸で表示される。
  // v0.20:「画面全体に対してツールのウインドウが小さい」への対応で、上限
  // クランプをSurrobotの1.25から2.4へ引き上げ、余白も24→16pxに縮めた。
  // 縦横比(1100:720)と内部のpx値は据え置きなので、Surrobotとの
  // 「相対的な作り」は保ったまま、大きなディスプレイでは画面いっぱいまで
  // 拡大される(Surrobotは1.25で頭打ちになり余白が残る)。
  const CANVAS_W = 1100, CANVAS_H = 720;   // 縦横比・内部px値はSurrobotと同一
  function fitBoxedZoom() {
    const margin = 16;
    const z = Math.min((window.innerWidth - margin) / CANVAS_W, (window.innerHeight - margin) / CANVAS_H);
    document.body.style.setProperty("--app-zoom", Math.max(0.4, Math.min(2.4, z)).toFixed(3));
  }

  // ------------------------------------------------------------------ i18n
  const I18N = {
    ja: {
      dropHint: "CSVをドロップ",
      goalMin: "▼ 最小化", goalMax: "▲ 最大化",
      goalTitle: "クリックで最小化/最大化を切り替え（切替時は再学習します）",
      // v0.22:「GP」「Sobol'」などの専門用語は初心者に伝わらないので画面から
      // 排除する（内部の実装名やコメントはそのまま）。
      statusIdle: "CSVを読み込むと、予測モデルを学習して探索を始めます。",
      statusComputing: "モデルを学習しています…",
      statusInitial: "観測が{n}点だけなので、まず空間を埋める初期点を提案します。測ってCSVに追記→再読込してください。",
      statusError: "エラー: {msg}",
      statusPrompt: "どんな追加点を探す？",
      btnOptimize: "最適解を探す",
      btnAccuracy: "精度をあげる",
      btnDownload: "選んだ候補をDL",
      btnTrySample: "サンプルで試す",
      yAxisLabel: "y", readErr: "ファイルを読めませんでした",
      candidateLineTitle: "選択中の候補の設計",
      optimizeMarkerTitle: "最適候補（クリックで選択/解除）",
      accuracyMarkerTitle: "精度向上候補（クリックで選択/解除）",
      sobolTitle: "予測モデルが描く応答の広がり（実測データではありません）。色は応答の良さ",
      filterHiTitle: "上限（ドラッグで絞り込み）",
      filterLoTitle: "下限（ドラッグで絞り込み）",
      filterResetTitle: "軸名をダブルクリックでこの軸の絞り込みを解除",
      contourTitle: "この2つの変数を動かしたときの応答の予測（実測データではありません）。他の変数は推奨点の値で固定",
      contourNote: "変数が2つ以上必要です",
      contourNoteNoPair: "他の図と重複しない変数の組がありません",
      sbLabel_idle: "待機中", sbLabel_computing: "学習中", sbLabel_initial: "初期点提案",
      sbLabel_sim: "シミュレータ稼働中", sbLabel_error: "エラー",
      // Surrobotの「ライセンス・連絡先」パネルと同じ3行構成・同じ言い回し
      // （`作者:` / `連絡先:` / `ライセンス: <b>X</b>（注記）— 説明。`）。
      // v0.22: バージョン行など独自の追記は撤去し、必要最小限に揃えた。
      // ライセンス名だけはExplorebot自身のもの -- 本製品はCC BY-NC 4.0では
      // なく proprietary(全権利留保)なので、そこを写すと誤表示になる。
      aboutTitle: "ライセンス・連絡先",
      aboutBody:
        "作者: Kohei Shintani, Ph.D.<br>" +
        "連絡先: <a href=\"mailto:mailad4me@gmail.com\">mailad4me@gmail.com</a><br>" +
        "ライセンス: <b>All Rights Reserved</b>（無断使用禁止）— 使用・複製・改変・再配布には" +
        "著作権者の事前の許可が必要です。ご利用をご希望の場合はご相談ください。",
      footerCredit: "© Kohei Shintani, Ph.D. · All Rights Reserved",
    },
    en: {
      dropHint: "DROP CSV",
      goalMin: "▼ minimize", goalMax: "▲ maximize",
      goalTitle: "Click to toggle minimize/maximize (re-fits the model)",
      statusIdle: "Load a CSV to train a model and start exploring.",
      statusComputing: "Training the model…",
      statusInitial: "Only {n} observed points -- proposing a space-filling initial point. Measure it, append, reload.",
      statusError: "Error: {msg}",
      statusPrompt: "What kind of point should we add?",
      btnOptimize: "Find the optimum",
      btnAccuracy: "Improve accuracy",
      btnDownload: "Download selected candidate(s)",
      btnTrySample: "Try with sample data",
      yAxisLabel: "y", readErr: "could not read the file",
      candidateLineTitle: "Selected candidate's design",
      optimizeMarkerTitle: "Best candidate (click to select/deselect)",
      accuracyMarkerTitle: "Accuracy-improving candidate (click to select/deselect)",
      sobolTitle: "The spread of responses the model predicts (not measured data). Colour = how good the response is",
      filterHiTitle: "Upper bound (drag to narrow)",
      filterLoTitle: "Lower bound (drag to narrow)",
      filterResetTitle: "double-click the axis name to clear this axis' filter",
      contourTitle: "Predicted response as these two variables vary (not measured data). The other variables are held at the recommended point",
      contourNote: "needs 2+ variables",
      contourNoteNoPair: "no variable pair left that another panel isn't already showing",
      sbLabel_idle: "idle", sbLabel_computing: "fitting", sbLabel_initial: "initial point",
      sbLabel_sim: "simulator live", sbLabel_error: "error",
      aboutTitle: "License & Contact",
      aboutBody:
        "Author: Kohei Shintani, Ph.D.<br>" +
        "Contact: <a href=\"mailto:mailad4me@gmail.com\">mailad4me@gmail.com</a><br>" +
        "License: <b>All Rights Reserved</b> (proprietary) — use, copying, modification and " +
        "redistribution require prior permission from the copyright holder. Please get in touch " +
        "if you would like to use it.",
      footerCredit: "© Kohei Shintani, Ph.D. · All Rights Reserved",
    },
    // v0.24: 中国語(簡体字)対応。Surrobotと同じ`zh`キーで揃える。
    // 専門用語を避ける方針(v0.22)もそのまま適用し、「GP」「Sobol'」は使わず
    // 「预测模型」「响应的分布」と表現する。
    zh: {
      dropHint: "拖入 CSV",
      goalMin: "▼ 最小化", goalMax: "▲ 最大化",
      goalTitle: "点击切换最小化/最大化（切换后会重新训练）",
      statusIdle: "拖入 CSV 后会训练预测模型并开始探索。",
      statusComputing: "正在训练模型…",
      statusInitial: "目前只有 {n} 个观测点，先推荐一个填充空间的初始点。请测量后追加到 CSV 并重新载入。",
      statusError: "错误：{msg}",
      statusPrompt: "想找什么样的追加点？",
      btnOptimize: "寻找最优解",
      btnAccuracy: "提高精度",
      btnDownload: "下载所选候选点",
      btnTrySample: "试用示例数据",
      yAxisLabel: "y", readErr: "无法读取该文件",
      candidateLineTitle: "所选候选点的设计",
      optimizeMarkerTitle: "最优候选点（点击选择/取消）",
      accuracyMarkerTitle: "提高精度的候选点（点击选择/取消）",
      sobolTitle: "模型预测的响应分布（并非实测数据）。颜色表示响应的好坏",
      filterHiTitle: "上限（拖动以筛选）",
      filterLoTitle: "下限（拖动以筛选）",
      filterResetTitle: "双击轴名可解除该轴的筛选",
      contourTitle: "改变这两个变量时的响应预测（并非实测数据）。其他变量固定在推荐点的取值",
      contourNote: "需要 2 个以上的变量",
      contourNoteNoPair: "没有其他图未使用的变量组合了",
      sbLabel_idle: "待机中", sbLabel_computing: "训练中", sbLabel_initial: "推荐初始点",
      sbLabel_sim: "模拟器运行中", sbLabel_error: "错误",
      aboutTitle: "许可与联系方式",
      aboutBody:
        "作者：Kohei Shintani, Ph.D.<br>" +
        "联系方式：<a href=\"mailto:mailad4me@gmail.com\">mailad4me@gmail.com</a><br>" +
        "许可：<b>All Rights Reserved</b>（保留所有权利）— 使用、复制、修改及再分发均需事先取得" +
        "著作权人的许可。如需使用请与作者联系。",
      footerCredit: "© Kohei Shintani, Ph.D. · All Rights Reserved",
    },
  };

  // ------------------------------------------------------------ 言語の選択
  // Surrobotと同じ仕組みを移植する（`SUPPORTED_LANGS`／localStorageへの
  // 永続化／未訳キーの多段フォールバック）。
  const SUPPORTED_LANGS = ["ja", "en", "zh"];
  const LANG_STORAGE_KEY = "explorebot_lang";
  // Surrobotは「公開ツールなので初回は英語」という方針で
  // detectDefaultLang()が常に'en'を返す。Explorebotはこれまで日本語表示で
  // 使われてきたので、勝手に英語化して驚かせないよう既定は'ja'のままに
  // している（英語既定に揃えたい場合はここを "en" に変えるだけでよい）。
  function detectDefaultLang() { return "ja"; }
  function getInitialLang() {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (SUPPORTED_LANGS.includes(saved)) return saved;
    } catch (e) { /* file://直開き等でlocalStorageが使えない場合は既定へ */ }
    return detectDefaultLang();
  }
  function persistLang(lang) {
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
  }

  // ------------------------------------------------------------------ state
  const STATE = {
    lang: getInitialLang(), goal: "min", stage: "idle",
    filename: null, csvText: null,
    payload: null, sim: null,
    values: {},
    engineReady: false, errorMsg: "",
    ctAxes: [null, null, null].map(() => ({ x: null, y: null })),
    contourColorDomain: { lo: 0, hi: 1 },
    // v0.17: レバードラッグ廃止に伴う新操作系。selectedは吹き出しの2トグル
    // ボタン(optimize/accuracy)の選択状態。v0.22以降、これはPCPの候補線と
    // コンター上のマーカーの表示/非表示にしか影響しない（コンターの断面は
    // 推奨点で固定し、ボタンでは動かさない）。
    selected: { optimize: false, accuracy: false },
    colorDomainLocked: false,   // コンターの色スケールを確定済みか
    surfaces: [null, null, null],   // last sim_surface() result per contour panel
    // v0.21: PCPの軸フィルタ(ブラッシング)。{列名: {lo, hi}}。表示の絞り込み
    // 専用で、モデルにも候補にも影響しない。
    filters: {},
    sobolDomain: { lo: 0, hi: 1 },  // PCP背景線の着色に使うyの範囲
  };

  // ------------------------------------------------------------------- DOM
  const el = (id) => document.getElementById(id);
  const dom = {
    fileBadge: el("fileBadge"), goalBadge: el("goalBadge"),
    langBtns: Array.prototype.slice.call(document.querySelectorAll(".lang-toggle-btn")),
    settingsBtn: el("settingsBtn"),
    aboutOverlay: el("aboutOverlay"), aboutCloseBtn: el("aboutCloseBtn"),
    aboutTitle: el("aboutTitle"), aboutBody: el("aboutBody"),
    sbDot: el("sbDot"), sbLabel: el("sbLabel"), sbCredit: el("sbCredit"),
    pcpWrap: el("pcpWrap"), pcpScroll: el("pcpScroll"),
    roboImg: el("roboImg"), statusText: el("statusText"),
    btnOptimize: el("btnOptimize"), btnAccuracy: el("btnAccuracy"), btnDownload: el("btnDownload"),
    btnTrySample: el("btnTrySample"),
    fileInput: el("fileInput"),
    globalDropOverlay: el("globalDropOverlay"), globalDropHint: el("globalDropHint"),
    ct: [
      { x: el("ct0x"), y: el("ct0y"), body: el("ct0body"), canvas: el("ct0canvas"), svg: el("ct0svg") },
      { x: el("ct1x"), y: el("ct1y"), body: el("ct1body"), canvas: el("ct1canvas"), svg: el("ct1svg") },
      { x: el("ct2x"), y: el("ct2y"), body: el("ct2body"), canvas: el("ct2canvas"), svg: el("ct2svg") },
    ],
  };

  // 未訳キーは「選択言語 → 日本語 → キー名そのもの」の3段フォールバック
  // （Surrobotと同じ方針。画面が壊れず、未翻訳分だけ日本語で出る）。
  // `??` を使うのが重要: `||` だと意図的な空文字("")を欠損扱いして日本語に
  // 巻き戻してしまう（simフェーズの吹き出しなど空文字を使う箇所がある）。
  function t(key, vars) {
    const dict = I18N[STATE.lang] || I18N.ja;
    let s = dict[key] ?? I18N.ja[key] ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  }
  function fmt(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    return String(Number(Number(v).toPrecision(digits || 4)));
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function titleEl(text) {
    const n = document.createElementNS(SVGNS, "title");
    n.textContent = text;
    return n;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // ------------------------------------------------------- PCPの折れ線→曲線
  // v0.23: 直線の折れ線をやめ、隣り合う軸を3次ベジエでつなぐ（curved PCP）。
  // 制御点を「始点と同じ高さ」「終点と同じ高さ」に置くことで、**各軸との
  // 交点で接線が水平（勾配0）**になる。
  //
  // これは見た目の好みだけの話ではなく、curved PCPの文献で示されている
  // 読みやすさの要件そのもの: 軸上で導関数を0にしないと、データ点が無い
  // 場所に偽の極大・極小が生まれて値を読み間違える。加えて両側の接線が
  // ともに水平なので軸をまたいでC1連続になり、線を目で追いやすくなる
  // （Graham & Kennedy, "Using Curves to Enhance Parallel Coordinate
  //  Visualisations" 系の知見）。
  function pcpCurve(pts) {
    if (!pts.length) return "";
    let d = "M " + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (let i = 1; i < pts.length; i++) {
      const x0 = pts[i - 1][0], y0 = pts[i - 1][1];
      const x1 = pts[i][0], y1 = pts[i][1];
      const h = (x1 - x0) * 0.5;   // 制御点は中間まで水平に伸ばす
      d += " C " + (x0 + h).toFixed(1) + " " + y0.toFixed(1) +
           " " + (x1 - h).toFixed(1) + " " + y1.toFixed(1) +
           " " + x1.toFixed(1) + " " + y1.toFixed(1);
    }
    return d;
  }

  // ------------------------------------------------------------ 色スケール
  // 良い方向(goal次第)=シアン、悪い方向=ゴールド、中間=ブルー。
  // v0.16の単純シアン→暖色2色ブレンドは中間帯のRGB線形補間がくすんだ
  // 灰褐色に見えて「ださい」とのフィードバックがあったため、v0.17では
  // アプリ自身のアクセントカラー3色(--cyan/--blue/--gold、いずれも
  // CSS変数と同じ値)を使った3段階グラデーションに変更した。コンター
  // パネル専用（PCPは「色は不要、選択候補の線/点だけ目立たせる」方針の
  // ためSobol'場は無彩色のまま）。
  //
  // ドメインは「今表示している3枚のコンターのmean値」だけから計算する
  // （Sobol'場や観測データを混ぜるとそちらの極端な外挿値にドメインが
  // 引っ張られ、実際に描くコンターの値幅が相対的に潰れて見た目が
  // ほぼ単色になるバグがあった -- 実機フィードバックで発見・修正、v0.16）。
  // v0.19: 自前の2〜3色ブレンドは中間帯が濁って「ださい」と繰り返し指摘された
  // ため、知覚的に均等で科学可視化の標準であるviridis(暗紫→青→緑→黄)へ変更。
  // 明度が単調に増えるので、白い等高線・緑/青のマーカーを重ねてもどの帯でも
  // コントラストが保たれる(旧配色はシアン域でマーカーが保護色になっていた)。
  // goodness=1(良い)を最も明るい黄、0(悪い)を暗紫に割り当てる。
  // v0.20: viridis(暗紫→青→緑→黄)は帯の中に緑と青を含むため、候補マーカー
  // (緑=optimize/青=accuracy、ボタンと同色)が背景に紛れて目立たなくなって
  // いた。同じく知覚的に均等で明度も単調な**magma**(黒→紫→赤→橙→淡黄)へ
  // 変更する。緑・青を一切含まない色相なので、マーカーと等高線が常に浮く。
  const MAGMA = [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
    [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ];
  function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function magma(t) {
    const u = clamp01(t) * (MAGMA.length - 1);
    const i = Math.min(Math.floor(u), MAGMA.length - 2);
    return lerp3(MAGMA[i], MAGMA[i + 1], u - i);
  }
  // v0.23: PCP背景線用。彩度をグレー側へ寄せて「文脈(context)」として引く。
  // PCPの定石は「文脈線はグレー、選択したものだけ対比色で強調」で、背景を
  // フルの彩度で塗ると選択線が埋もれる（実機でもそう指摘された）。
  // ただし「線は応答で色をつけて」という要望は残したいので、色相は保った
  // まま灰色へ一定量ブレンドし、強さだけ落とす。
  const CONTEXT_GRAY = [140, 158, 180];
  function desaturate(rgb, k) { return lerp3(rgb, CONTEXT_GRAY, k); }
  function rgbCss(rgb) {
    return "rgb(" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]) + ")";
  }
  // yを「良さ(goal依存)」0..1に正規化する。等高線のレベル計算とも共有する。
  function goodness(y, domain) {
    const { lo, hi } = domain || STATE.contourColorDomain;
    const span = Math.max(hi - lo, 1e-12);
    return clamp01(STATE.goal === "max" ? (y - lo) / span : 1 - (y - lo) / span);
  }
  function colorRgb(y, domain) {
    return magma(goodness(y, domain));
  }
  // ------------------------------------------------------------- 等高線
  // v0.19: 「等高線もかいて」への対応。marching squares で mean グリッドから
  // 指定レベルの等値線セグメントを取り出す。戻り値は (col,row) の小数座標対の
  // 配列で、描画側で画素座標へ写す（xs/ysはlinspaceなので線形写像でよい）。
  // 16通りのうち塗り分けが1通りに決まらない鞍点(5と10)だけ2本引く。
  function isoSegments(M, level) {
    const segs = [];
    const rows = M.length, cols = M[0].length;
    const at = (va, vb) => (level - va) / ((vb - va) || 1e-12);
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const bl = M[r][c], br = M[r][c + 1], tr = M[r + 1][c + 1], tl = M[r + 1][c];
        let idx = 0;
        if (bl > level) idx |= 1;
        if (br > level) idx |= 2;
        if (tr > level) idx |= 4;
        if (tl > level) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        const eB = [c + at(bl, br), r];          // 下辺の交点
        const eR = [c + 1, r + at(br, tr)];      // 右辺
        const eT = [c + at(tl, tr), r + 1];      // 上辺
        const eL = [c, r + at(bl, tl)];          // 左辺
        switch (idx) {
          case 1: case 14: segs.push([eL, eB]); break;
          case 2: case 13: segs.push([eB, eR]); break;
          case 3: case 12: segs.push([eL, eR]); break;
          case 4: case 11: segs.push([eR, eT]); break;
          case 6: case 9:  segs.push([eB, eT]); break;
          case 7: case 8:  segs.push([eT, eL]); break;
          case 5:  segs.push([eL, eB]); segs.push([eT, eR]); break;   // 鞍点
          case 10: segs.push([eB, eR]); segs.push([eT, eL]); break;   // 鞍点
        }
      }
    }
    return segs;
  }

  // v0.22: 色ドメインは**一度決めたら固定**する。以前は面を計算し直すたびに
  // 取り直していたため、操作のたびに同じ値が違う色になり「勝手に色が変わる」
  // 原因になっていた。軸を変えたときだけ、新しい面が今のスケールに収まって
  // いなければ広げる方向にのみ更新する（縮めない＝色が戻らない）。
  function computeContourColorDomain(force) {
    const ys = [];
    for (const surf of STATE.surfaces) {
      if (!surf) continue;
      for (const row of surf.mean) for (const v of row) ys.push(v);
    }
    if (!ys.length) return;
    const lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (force || !STATE.colorDomainLocked) {
      STATE.contourColorDomain = { lo, hi };
      STATE.colorDomainLocked = true;
    } else {
      // 広げる方向のみ（既存の色の意味を壊さない）
      STATE.contourColorDomain = {
        lo: Math.min(STATE.contourColorDomain.lo, lo),
        hi: Math.max(STATE.contourColorDomain.hi, hi),
      };
    }
  }

  // ------------------------------------------------------- engine bootstrap
  // v0.17: エンジン起動状況を表示するstatus-barバッジ("explorebot / WASM")は
  // 「不要」とのフィードバックで削除した。起動そのものはこれまで通り行う。
  async function bootEngine() {
    try {
      await tf.initEngine({ onStatus: () => {}, onLog: () => {} });
      STATE.engineReady = true;
    } catch (e) {
      STATE.stage = "error";
      STATE.errorMsg = String((e && e.message) || e);
      renderAll();
    }
  }
  function waitForEngine() {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        if (STATE.engineReady) return resolve();
        if (STATE.stage === "error") return reject(new Error(STATE.errorMsg));
        if (Date.now() - t0 > 180000) return reject(new Error("engine timeout"));
        setTimeout(poll, 150);
      })();
    });
  }

  // ------------------------------------------------------------- CSV入力系
  function wireDropZone(zone) {
    zone.addEventListener("click", () => dom.fileInput.click());
    zone.addEventListener("dragover", (ev) => { ev.preventDefault(); zone.classList.add("hover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("hover"));
    zone.addEventListener("drop", (ev) => {
      ev.preventDefault(); zone.classList.remove("hover");
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) readAndRun(f);
    });
  }
  // CSVドロップは画面全体(document)のどこでも受け付ける（v0.15、「画面全体の
  // どこでもよいことにしたい」への対応）。dragenter/dragleaveは子要素へ出入り
  // するたびに発火する(バブリングするので入れ子要素数だけ余分にenter/leave
  // が来る)ため、深さカウンタで管理して0に戻った時だけオーバーレイを隠す。
  let _dragDepth = 0;
  document.addEventListener("dragenter", (ev) => {
    ev.preventDefault();
    _dragDepth++;
    dom.globalDropOverlay.classList.add("show");
  });
  document.addEventListener("dragover", (ev) => ev.preventDefault());
  document.addEventListener("dragleave", () => {
    _dragDepth = Math.max(0, _dragDepth - 1);
    if (_dragDepth === 0) dom.globalDropOverlay.classList.remove("show");
  });
  document.addEventListener("drop", (ev) => {
    ev.preventDefault();
    _dragDepth = 0;
    dom.globalDropOverlay.classList.remove("show");
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) readAndRun(f);
  });
  dom.fileInput.addEventListener("change", () => {
    const f = dom.fileInput.files && dom.fileInput.files[0];
    if (f) readAndRun(f);
    dom.fileInput.value = "";
  });
  function readAndRun(file) {
    const reader = new FileReader();
    reader.onload = () => runSim(String(reader.result), file.name);
    reader.onerror = () => showError(t("readErr"));
    reader.readAsText(file);
  }

  // v0.21: 「サンプルで試す」。オフライン版はtf.getSampleCsv()でビルド時に
  // 埋め込まれたCSVを同期取得、オンライン版は./assets/sample.csvをfetchする
  // (offline-engine.jsのgetSampleCsvコメント通りの分岐)。
  async function trySample() {
    try {
      const csvText = tf.getSampleCsv
        ? tf.getSampleCsv()
        : await (await fetch("./assets/sample.csv")).text();
      runSim(csvText, "sample.csv");
    } catch (e) {
      showError(t("readErr"));
    }
  }

  // ------------------------------------------------------------- sim起動系
  async function runSim(csvText, filename) {
    STATE.csvText = csvText;
    STATE.filename = filename || "data.csv";
    STATE.stage = "computing";
    STATE.payload = null; STATE.sim = null;
    STATE.selected = { optimize: false, accuracy: false };
    STATE.colorDomainLocked = false;   // 新しいデータでは色スケールを取り直す
    STATE.surfaces = [null, null, null];
    STATE.filters = {};   // 軸フィルタは新しいデータごとにリセット
    renderAll();
    try {
      if (!STATE.engineReady) await waitForEngine();
      const payload = await tf.simStart(csvText, { goal: STATE.goal });
      STATE.payload = payload;
      STATE.sim = payload.sim;
      STATE.values = Object.assign({}, payload.sim.initial_values);
      // PCP背景線の着色ドメイン(Sobol'のy範囲)。コンター側とは別に持つ
      // -- 混ぜると片方の外れ値でもう片方の色幅が潰れる(v0.16の教訓)。
      if (payload.sim.sobol && payload.sim.sobol.y.length) {
        const ys = payload.sim.sobol.y;
        STATE.sobolDomain = { lo: Math.min.apply(null, ys), hi: Math.max.apply(null, ys) };
      } else {
        STATE.sobolDomain = { lo: 0, hi: 1 };
      }
      initContourAxes();
      if (payload.sim.model_ready) {
        STATE.stage = "sim";
        renderAll();
        buildStaticLayers();
        await refreshSurfacesNow();
      } else {
        STATE.stage = "initial";
        renderAll();
        buildStaticLayers();
      }
    } catch (e) {
      showError(String((e && e.message) || e));
    }
  }

  function showError(msg) {
    STATE.stage = "error";
    STATE.errorMsg = msg;
    renderAll();
  }

  // 3枚のコンターへ既定の(x,y)軸を割り当てる。
  //
  // v0.20: 「できるだけ異なる変数を選んで」への対応で、貪欲法に作り直した。
  // v0.19までは「まず排他な組を取り、余ったパネルは全組み合わせの先頭へ
  // フォールバック」という2段構えだったため、変数5個だと3枚目が1枚目と
  // 完全に同じ組(先頭ペア)に戻ってしまっていた（実機で発覚）。
  //
  // 新方式: 各列の使用回数を数え、「まだ使われていない列を優先」しつつ
  // 未使用の組から選ぶ。変数6個以上なら3枚とも軸を1つも共有せず、5個でも
  // (A,B)/(C,D)/(A,E) のように全ての列を登場させたうえで組の重複はゼロに
  // なる。組が尽きた場合(変数2個など、数学的に3通り無い)のみnullを返す。
  function defaultContourAxisPairs(cols) {
    const assign = [];
    const usage = new Map(cols.map((c) => [c, 0]));
    const taken = new Set();
    for (let i = 0; i < N_CONTOURS; i++) {
      let best = null, bestScore = Infinity;
      for (let a = 0; a < cols.length; a++) {
        for (let b = a + 1; b < cols.length; b++) {
          const key = JSON.stringify([cols[a], cols[b]]);
          if (taken.has(key)) continue;
          const score = usage.get(cols[a]) + usage.get(cols[b]);
          if (score < bestScore) { bestScore = score; best = [cols[a], cols[b]]; }
        }
      }
      if (!best) { assign.push(null); continue; }
      assign.push(best);
      taken.add(JSON.stringify(best));
      usage.set(best[0], usage.get(best[0]) + 1);
      usage.set(best[1], usage.get(best[1]) + 1);
    }
    return assign;
  }

  function initContourAxes() {
    const cols = STATE.sim.slider_spec.map((s) => s.col);
    const d = cols.length;
    const assign = defaultContourAxisPairs(cols);
    for (let i = 0; i < N_CONTOURS; i++) {
      if (assign[i]) {
        const [x, y] = assign[i];
        STATE.ctAxes[i] = { x, y };
      } else {
        STATE.ctAxes[i] = { x: null, y: null };
      }
      for (const axis of ["x", "y"]) {
        const sel = dom.ct[i][axis];
        sel.innerHTML = "";
        for (const c of cols) {
          const o = document.createElement("option");
          o.value = c; o.textContent = c;
          sel.appendChild(o);
        }
        sel.disabled = d < 2;
        if (d >= 2) sel.value = STATE.ctAxes[i][axis];
      }
    }
  }

  function buildStaticLayers() {
    renderPCPStatic();
    renderPCPDynamic();
  }
  function renderLinkedNow() {
    if (STATE.stage !== "sim" && STATE.stage !== "initial") return;
    renderPCPDynamic();
  }

  // ------------------------------------------------------- 予測(常駐モデル)呼出
  // v0.17: レバードラッグ廃止に伴い、STATE.valuesが連続的に動くことは無く
  // なった(候補トグルの切替時にだけ離散的に変わる)ため、都度simEvalに
  // 問い合わせるライブ予測ループ(evalNow/scheduleEval)は不要になった --
  // 候補の位置・予測値はpayload.proposalsに既にある既知の値をそのまま使う。
  //
  // v0.28: デバウンス用の scheduleSurfaceRefresh()/_surfaceTimer も削除した。
  // v0.22でコンターの断面を推奨点に固定し、候補トグルでは再計算しなくなった
  // 時点で呼び出し元がゼロになっていた(定数SURFACE_DEBOUNCE_MSも同時に死んで
  // いた)。今コンターを再計算するのは「学習直後」と「軸セレクタ変更」と
  // 「リサイズ」だけで、いずれも連射されないので refreshSurfacesNow() の
  // 直接呼び出しで足りる(下記の in-flight ガードが多重実行を防ぐ)。
  let _surfaceInFlight = false;
  let _surfaceQueued = false;
  async function refreshSurfacesNow() {
    if (STATE.stage !== "sim") return;
    if (STATE.sim.slider_spec.length < 2) return;
    if (_surfaceInFlight) { _surfaceQueued = true; return; }
    _surfaceInFlight = true;
    try {
      const values = Object.assign({}, STATE.values);
      // **逐次呼び出し(v0.19)**: 以前はPromise.allで3枚同時に投げていたが、
      // エンジンがPyodideのグローバル変数経由で引数を渡しているため、並行
      // 呼び出しだと3枚とも最後の(x_col,y_col)で計算されてしまい「軸を変えても
      // 3枚とも同じ図になる」バグになっていた(実機で発覚)。エンジン層に
      // ミューテックスを入れて根本対策済みだが、ここも意図を明示するために
      // 逐次にしておく(直列化されるので並行にしても速くならない)。
      const results = [];
      for (const ax of STATE.ctAxes) {
        if (!ax.x || !ax.y || ax.x === ax.y) { results.push(null); continue; }
        results.push(await tf.simSurface(values, ax.x, ax.y, SURFACE_GRID));
      }
      for (let i = 0; i < N_CONTOURS; i++) STATE.surfaces[i] = results[i];
      computeContourColorDomain();
      for (let i = 0; i < N_CONTOURS; i++) renderContour(i);
    } catch (e) {
      showError(String((e && e.message) || e));
    } finally {
      _surfaceInFlight = false;
      if (_surfaceQueued) { _surfaceQueued = false; refreshSurfacesNow(); }
    }
  }

  // v0.22:【修正】候補ボタンを押すと2Dマップの色が変わってしまう問題。
  //
  // v0.17〜v0.21は、候補をONにすると`STATE.values`（=コンターで「他の変数を
  // 固定する値」）をその候補の座標へ移していた。コンターは他変数を固定した
  // "断面"なので、固定値が動けば断面が変わり地図の模様が変わる。さらに色
  // ドメインを毎回「今表示中の3枚のmean」から取り直していたため、**同じ値が
  // 違う色になる**という二重の分かりにくさがあった。
  //
  // 対策: 断面は学習直後の推奨点で固定し、候補トグルでは動かさない。
  // ボタンで変わるのは「PCPの候補線」と「コンター上の候補マーカーの表示/
  // 非表示」だけになり、地図そのものは静止する。色ドメインも学習時に一度
  // 決めたら以後動かさない(computeContourColorDomainの呼び出し箇所を参照)。
  function toggleCandidate(kind) {
    if (STATE.stage !== "sim" && STATE.stage !== "initial") return;
    STATE.selected[kind] = !STATE.selected[kind];
    renderBubbleButtons();
    renderLinkedNow();      // PCP動的レイヤー(選択候補の線/点)だけ再描画
    renderAllContours();    // 候補マーカーの表示/非表示のみ反映（再計算しない）
  }
  function downloadSelectedCandidates() {
    const props = STATE.payload && STATE.payload.proposals;
    if (!props) return;
    const kinds = ["optimize", "accuracy"].filter((k) => STATE.selected[k]);
    if (!kinds.length) return;
    // v0.25: 第2引数 onlyNew=true。以前は元データ全体に候補行を足したCSVを
    // 出していたが、「候補点の情報だけをのせる」との指示によりヘッダー＋
    // 候補行のみにする（id は元ファイルの続き番号なので、そのまま元CSVの
    // 末尾に貼り付けられる）。
    Promise.resolve(tf.simMakeCsv(kinds.map((k) => props[k].x), true)).then((csvText) => {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (STATE.filename ? STATE.filename.replace(/\.csv$/i, "") : "explorebot") + "_candidates.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }).catch((e) => showError(String((e && e.message) || e)));
  }
  function renderBubbleButtons() {
    dom.btnOptimize.textContent = t("btnOptimize");
    dom.btnAccuracy.textContent = t("btnAccuracy");
    dom.btnDownload.textContent = t("btnDownload");
    dom.btnTrySample.textContent = t("btnTrySample");
    dom.btnOptimize.classList.toggle("active", !!STATE.selected.optimize);
    dom.btnAccuracy.classList.toggle("active", !!STATE.selected.accuracy);
    const canAct = STATE.stage === "sim" || STATE.stage === "initial";
    dom.btnOptimize.disabled = !canAct;
    dom.btnAccuracy.disabled = !canAct;
    dom.btnDownload.disabled = !canAct || !(STATE.selected.optimize || STATE.selected.accuracy);
    // v0.21: サンプルは「まだ何も読み込んでいない(idle)」時こそ主な使い所
    // なので、他の3ボタンと違いcanAct(sim/initialのみ)には縛られない。
    // 実行中の二重起動だけ防ぐ。
    dom.btnTrySample.disabled = STATE.stage === "computing";
  }

  // ------------------------------------------------------------------ PCP
  const PCP = {
    svg: null, gStatic: null, gDynamic: null, gFilter: null, geom: null,
    sobolPaths: [],      // 背景Sobol'線の要素(フィルタ時にopacityだけ差し替える)
    sobolColIdx: [],     // 軸ごとのsobol.cols内インデックス(毎回indexOfしない)
    dragFilter: null,    // {col, edge:"lo"|"hi"} ドラッグ中のフィルタつまみ
  };

  // 画面座標(clientY) → PCPのviewBox座標へ変換する。
  //
  // **重要**: `.app-frame`にCSS `zoom`が掛かっているため、
  // getBoundingClientRect()が返すのは「zoom適用後」の実表示サイズで、
  // viewBoxの論理サイズ(geom.H)とは一致しない。v0.14〜v0.16のレバーは
  //   localY = ev.clientY - rect.top;  u = 1 - (localY - pad.t)/(H-pad.t-pad.b)
  // と、zoom適用後のpx値をviewBox座標のpad.t/Hと直接引き算していたため、
  // zoom倍率の分だけ座標がずれ、clamp01で端に張り付いて「つまみが動かない」
  // 状態になっていた（v0.16でpointer-eventsを直しても直らなかった真因）。
  // 高さの"比率"で変換すればzoomにもスクロールにも依存しない。
  function clientYToViewBox(clientY) {
    const rect = PCP.svg.getBoundingClientRect();
    if (!rect.height) return 0;
    return ((clientY - rect.top) / rect.height) * PCP.geom.H;
  }

  function pcpAxes() {
    const spec = STATE.sim.slider_spec;
    const axes = spec.map((s) => ({ key: s.col, label: s.col, lo: s.lo, hi: s.hi, spec: s, isY: false }));
    let yLo = Infinity, yHi = -Infinity;
    for (const y of STATE.sim.points.y) { yLo = Math.min(yLo, y); yHi = Math.max(yHi, y); }
    if (STATE.sim.sobol) for (const y of STATE.sim.sobol.y) { yLo = Math.min(yLo, y); yHi = Math.max(yHi, y); }
    const props = STATE.payload && STATE.payload.proposals;
    if (props) for (const k of ["optimize", "accuracy"]) {
      yLo = Math.min(yLo, props[k].predicted_y - props[k].predicted_std);
      yHi = Math.max(yHi, props[k].predicted_y + props[k].predicted_std);
    }
    if (!isFinite(yLo)) { yLo = 0; yHi = 1; }
    const pad = (yHi - yLo || 1) * 0.06;
    axes.push({ key: Y_KEY, label: t("yAxisLabel"), lo: yLo - pad, hi: yHi + pad, isY: true });
    return axes;
  }

  function ensurePcpSvg() {
    // v0.18: renderCenterNote()/renderDropZone()が直接dom.pcpWrapへ追加する
    // .center-note/.drop-zone(「GPを学習しています…」等)は、このensurePcpSvg
    // 自身では取り除いていなかった(pcpScroll内のsvgしか掃除していなかった
    // ため)。computing→simの遷移時にこれが残り続け、新しいPCPのsvgの下に
    // 古いテキストが重なって見える実機バグがあったので、ここで必ず掃除する。
    dom.pcpWrap.querySelectorAll(".center-note, .drop-zone").forEach((n) => n.remove());
    if (PCP.svg && PCP.svg.parentNode === dom.pcpScroll) return;
    dom.pcpScroll.querySelectorAll("svg").forEach((n) => n.remove());
    PCP.svg = svgEl("svg", { preserveAspectRatio: "none" });
    PCP.gStatic = svgEl("g", {}, PCP.svg);
    PCP.gDynamic = svgEl("g", {}, PCP.svg);
    // フィルタつまみは最前面（候補線より上）。こうしないと候補線がつまみを
    // 覆ってクリックを奪う -- v0.16のレバーで踏んだのと同じ罠を避ける。
    PCP.gFilter = svgEl("g", {}, PCP.svg);
    // ツールチップは全ての上。自身はクリックを拾わない。
    PCP.gTip = svgEl("g", { "pointer-events": "none" }, PCP.svg);
    dom.pcpScroll.appendChild(PCP.svg);
    wirePcpFilterDrag();
  }

  // ---------------------------------------------- 頂点ホバーのツールチップ
  // v0.21: v0.18ではSVGネイティブの<title>を付けていたが、これはOSの
  // ツールチップなので「カーソルを止めて1〜2秒待つ」まで出ない。実機で
  // 「値が分からない」と再指摘されたため、即座に出る自前ラベルを描く方式に
  // 変更した（<title>も併置してあるので、待てばOS側の表示も出る）。
  function showPcpTip(x, y, text) {
    if (!PCP.gTip || !PCP.geom) return;
    PCP.gTip.innerHTML = "";
    const padX = 7, h = 19;
    const w = Math.max(34, text.length * 6.7 + padX * 2);
    let tx = x + 12, ty = y - h - 9;
    if (tx + w > PCP.geom.W - 2) tx = x - 12 - w;   // 右端で見切れないよう左へ
    if (ty < 2) ty = y + 11;                         // 上端なら下側へ
    svgEl("rect", { x: tx, y: ty, width: w, height: h, rx: 4, class: "pcp-tip-box" }, PCP.gTip);
    const el = svgEl("text", {
      x: tx + padX, y: ty + h - 6, class: "pcp-tip-text",
      "font-family": "IBM Plex Mono, monospace", "font-size": "11.5",
    }, PCP.gTip);
    el.textContent = text;
  }
  function hidePcpTip() { if (PCP.gTip) PCP.gTip.innerHTML = ""; }

  function computePcpGeom() {
    const axes = pcpAxes();
    const n = axes.length;
    const pad = { l: 46, r: 40, t: 34, b: 22 };
    const availW = dom.pcpScroll.clientWidth || 400;
    const H = dom.pcpScroll.clientHeight || 240;
    const naturalGap = n > 1 ? (availW - pad.l - pad.r) / (n - 1) : 0;
    const axisGap = Math.max(MIN_AXIS_GAP, naturalGap);
    const W = pad.l + pad.r + (n - 1) * axisGap;
    const AX = (i) => pad.l + i * axisGap;
    const AY = (ax, v) => pad.t + (1 - (v - ax.lo) / Math.max(ax.hi - ax.lo, 1e-12)) * (H - pad.t - pad.b);
    return { axes, n, pad, W, H, axisGap, AX, AY };
  }

  function renderPCPStatic() {
    if (!STATE.sim) return;
    ensurePcpSvg();
    const g = computePcpGeom();
    PCP.geom = g;
    PCP.svg.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
    PCP.svg.style.width = g.W + "px";
    PCP.svg.style.height = "100%";
    const svg = PCP.gStatic;
    svg.innerHTML = "";
    const { axes, pad, H, AX, AY } = g;

    // Sobol'場（背景の折れ線。学習データではなく、GP予測をサンプリングした
    // もの -- 実測データの折れ線はここに一切描かない）。
    // v0.21:「PCPの線は応答で色をつけて」への対応で、各線を**その行の応答y**
    // でmagma着色する（v0.16で一度無彩色にしたが、今回は逆の指示）。色は
    // コンターと同じgoodness→magmaの規約なので、「明るいほど良い」が画面
    // 全体で一貫する。ただし暗端は背景(#0b0f1a)に沈んで線が消えるため、
    // magmaの t を 0.18〜1.0 にリマップして最低限の明度を確保する。
    PCP.sobolPaths = [];
    if (STATE.sim.sobol) {
      const sob = STATE.sim.sobol;
      PCP.sobolColIdx = axes.map((ax) => (ax.isY ? -1 : sob.cols.indexOf(ax.key)));
      const dom0 = STATE.sobolDomain;
      for (let r = 0; r < sob.y.length; r++) {
        const pts = axes.map((ax, i) => {
          const ci = PCP.sobolColIdx[i];
          const v = ci < 0 ? sob.y[r] : sob.X[r][ci];
          return [AX(i), AY(ax, v)];
        });
        const col = desaturate(magma(0.18 + 0.82 * goodness(sob.y[r], dom0)), 0.5);
        const p = svgEl("path", {
          d: pcpCurve(pts), fill: "none", "stroke-width": 1, stroke: rgbCss(col),
        }, svg);
        p.appendChild(titleEl(t("sobolTitle")));
        PCP.sobolPaths.push(p);
      }
    }

    // 軸線＋ラベル（v0.17: ドラッグ用ヒットレクトは廃止。外挿の考慮は一切
    // しない=amberノッチ等は描かない）。v0.21: ラベルはダブルクリックで
    // その軸のフィルタを全域に戻す。
    axes.forEach((ax, i) => {
      const x = AX(i);
      svgEl("line", {
        x1: x, y1: pad.t, x2: x, y2: H - pad.b,
        stroke: "rgba(170,195,220,0.28)", "stroke-width": 1.2, class: "pcp-axis-line",
      }, svg);
      const lb = svgEl("text", {
        x: x, y: pad.t - 14, "text-anchor": "middle",
        fill: ax.isY ? "#3fc4ec" : "rgba(150,175,205,0.95)",
        "font-size": "13", "font-family": "IBM Plex Mono, monospace",
        "font-weight": ax.isY ? "700" : "600",
        style: "cursor:pointer",
      }, svg);
      lb.textContent = ax.label.length > 12 ? ax.label.slice(0, 11) + "…" : ax.label;
      lb.appendChild(titleEl(ax.label + " — " + t("filterResetTitle")));
      lb.addEventListener("dblclick", () => {
        STATE.filters[ax.key] = { lo: ax.lo, hi: ax.hi };
        renderPCPFilter();
        applySobolFilter();
      });
    });

    ensureFilters(axes);
    renderPCPFilter();
    applySobolFilter();
  }

  // ------------------------------------------------- 軸フィルタ(ブラッシング)
  // v0.21:「それぞれの軸に上下限を横▽で設定して、それをスライドさせると
  // 解を絞り込める」への対応。各軸の上下に横向きの三角つまみを置き、範囲外を
  // 通るSobol'線を極薄にして畳み込む（＝条件を満たす解だけが色付きで残る）。
  // 候補線・コンターには影響しない（あくまで「場」の絞り込み表示）。
  function ensureFilters(axes) {
    for (const ax of axes) {
      const f = STATE.filters[ax.key];
      // 軸の範囲が変わった(再学習等)場合は作り直す
      if (!f || f.lo < ax.lo - 1e-9 || f.hi > ax.hi + 1e-9) {
        STATE.filters[ax.key] = { lo: ax.lo, hi: ax.hi };
      }
    }
  }
  function filterIsFull(ax) {
    const f = STATE.filters[ax.key];
    if (!f) return true;
    const span = Math.max(ax.hi - ax.lo, 1e-12);
    return (f.lo - ax.lo) / span < 1e-6 && (ax.hi - f.hi) / span < 1e-6;
  }
  function sobolRowPasses(r) {
    const sob = STATE.sim.sobol;
    const axes = PCP.geom.axes;
    for (let i = 0; i < axes.length; i++) {
      const f = STATE.filters[axes[i].key];
      if (!f) continue;
      const ci = PCP.sobolColIdx[i];
      const v = ci < 0 ? sob.y[r] : sob.X[r][ci];
      if (v < f.lo || v > f.hi) return false;
    }
    return true;
  }
  function applySobolFilter() {
    if (!STATE.sim || !STATE.sim.sobol || !PCP.geom) return;
    const anyFilter = PCP.geom.axes.some((ax) => !filterIsFull(ax));
    let kept = 0;
    for (let r = 0; r < PCP.sobolPaths.length; r++) {
      const pass = !anyFilter || sobolRowPasses(r);
      if (pass) kept++;
      // v0.22:「PCPの色が強すぎて候補の色が目立たない」との指摘により、
      // 背景の場は大幅に淡くする（候補線は太さ3＋発光なので、背景が薄い
      // ほど相対的に際立つ）。範囲外は消さずに極薄で残す（何を畳み込んだか
      // が見えるほうが操作しやすい）。
      PCP.sobolPaths[r].setAttribute("opacity", pass ? (anyFilter ? "0.42" : "0.2") : "0.035");
    }
    PCP.keptCount = kept;
    // v0.25: 「該当 29 / 120 本」の表示は不要との指摘により撤去。絞り込みの
    // 効き具合は線の濃淡そのもので分かるため、文字は出さない。
  }

  const FILTER_HANDLE = "M 4 -6 L 4 6 L -4 0 Z";   // 左向きの三角（頂点が軸を指す）
  function renderPCPFilter() {
    if (!STATE.sim || !PCP.geom) return;
    const g = PCP.gFilter;
    g.innerHTML = "";
    const { axes, AX, AY } = PCP.geom;
    axes.forEach((ax, i) => {
      const f = STATE.filters[ax.key];
      if (!f) return;
      const x = AX(i);
      const yHi = AY(ax, f.hi), yLo = AY(ax, f.lo);
      // 選択されている区間を軸上に太線で示す
      svgEl("line", { x1: x, y1: yHi, x2: x, y2: yLo, class: "pcp-filter-range" }, g);
      for (const edge of ["hi", "lo"]) {
        const y = edge === "hi" ? yHi : yLo;
        const h = svgEl("path", {
          d: FILTER_HANDLE, transform: "translate(" + (x + 9).toFixed(1) + " " + y.toFixed(1) + ")",
          class: "pcp-filter-handle" + (filterIsFull(ax) ? "" : " active"),
          "data-fcol": ax.key, "data-fedge": edge,
        }, g);
        h.appendChild(titleEl(
          (edge === "hi" ? t("filterHiTitle") : t("filterLoTitle")) +
          ": " + fmt(edge === "hi" ? f.hi : f.lo)));
      }
    });
  }

  // つまみのドラッグ。pointerdownはつまみで受けるが、capture/move/upは**svg**に
  // 張る。つまみ自身はドラッグ中に描き直されて消えるため、つまみにキャプチャ
  // すると途中でイベントが途切れる（v0.14〜v0.16のレバーが抱えていたもう一つの
  // 弱点）。svgは作り直されないので安定して追従できる。
  function wirePcpFilterDrag() {
    const svg = PCP.svg;
    svg.addEventListener("pointerdown", (ev) => {
      const target = ev.target && ev.target.closest ? ev.target.closest("[data-fcol]") : null;
      if (!target) return;
      ev.preventDefault();
      PCP.dragFilter = {
        col: target.getAttribute("data-fcol"),
        edge: target.getAttribute("data-fedge"),
      };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      const onMove = (mv) => applyFilterDrag(mv);
      const onUp = (uv) => {
        PCP.dragFilter = null;
        svg.removeEventListener("pointermove", onMove);
        svg.removeEventListener("pointerup", onUp);
        svg.removeEventListener("pointercancel", onUp);
        try { svg.releasePointerCapture(uv.pointerId); } catch (e) {}
      };
      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerup", onUp);
      svg.addEventListener("pointercancel", onUp);
      applyFilterDrag(ev);
    });
  }
  function applyFilterDrag(ev) {
    const d = PCP.dragFilter;
    if (!d || !PCP.geom) return;
    const ax = PCP.geom.axes.find((a) => a.key === d.col);
    const f = STATE.filters[d.col];
    if (!ax || !f) return;
    const { pad, H } = PCP.geom;
    const vbY = clientYToViewBox(ev.clientY);       // ←zoom非依存の変換
    const u = clamp01(1 - (vbY - pad.t) / Math.max(H - pad.t - pad.b, 1e-9));
    const v = ax.lo + u * (ax.hi - ax.lo);
    const minGap = (ax.hi - ax.lo) * 0.02;          // 上下限が交差しないように
    if (d.edge === "hi") f.hi = Math.max(v, f.lo + minGap);
    else f.lo = Math.min(v, f.hi - minGap);
    renderPCPFilter();
    applySobolFilter();
  }

  // 候補ごとの色(v0.18: ボタンの色と揃えた -- optimize=緑(★ボタン)、
  // accuracy=青(◆ボタン)。これによりPCP/コンターとも「★=optimize/
  // ◆=accuracy」という文言説明が無くても色だけで対応が分かるようにした。
  // 旧v0.17まではコンターのマーカーだけシアン/ゴールドのままで、コンター
  // 背景のグラデーション(特に左側のシアン域)と被って見えない可視性バグが
  // あったため、PCP側と同じ緑/青に統一した。
  const PROP_COLOR = { optimize: "#2fd68e", accuracy: "#4f7fe0" };
  const PROP_MARKER_R = { optimize: 8, accuracy: 8 };
  const PROP_HALO_R = { optimize: 16, accuracy: 16 };

  // v0.17: 選択中(STATE.selected)の候補だけをPCPに描く。旧来の★◆破線・
  // クリックでジャンプはPCP上では廃止し、選択操作は吹き出しの2トグル
  // ボタンに一本化した。v0.18: 各軸頂点にカーソルを合わせると値が見える
  // よう<title>を追加。
  function renderPCPDynamic() {
    if (!STATE.sim || !PCP.geom) return;
    const { axes, AX, AY } = PCP.geom;
    const g = PCP.gDynamic;
    g.innerHTML = "";
    hidePcpTip();   // 再描画で当たり判定が作り直されるので、残留ラベルを消す
    const props = STATE.payload && STATE.payload.proposals;
    if (!props) return;
    for (const kind of ["optimize", "accuracy"]) {
      if (!STATE.selected[kind]) continue;
      drawCandidateLine(g, axes, AX, AY, props[kind], kind);
    }
  }
  function drawCandidateLine(g, axes, AX, AY, prop, kind) {
    const vertices = [];
    axes.forEach((ax, i) => {
      const v = ax.isY ? prop.predicted_y : prop.x[ax.key];
      vertices.push([AX(i), AY(ax, v), ax, v]);
    });
    const d = pcpCurve(vertices);
    const line = svgEl("path", { d: d, fill: "none", class: "pcp-candidate-line " + kind }, g);
    line.appendChild(titleEl(t("candidateLineTitle")));
    vertices.forEach(([x, y, ax, v]) => {
      const pt = svgEl("circle", { cx: x, cy: y, r: 5.5, class: "pcp-candidate-point " + kind }, g);
      // v0.22:「数字だけでよい」との指摘によりラベルは値のみ（どの軸かは
      // 点の位置で分かるため、軸名は冗長だった）。
      const label = fmt(v);
      pt.appendChild(titleEl(ax.label + " = " + label));   // OS側の表示だけ軸名も残す
      // 点そのものより広い透明の当たり判定を重ね、カーソルが乗った瞬間に
      // 自前ラベルを出す（待たされずに値が読めるようにするのが目的）。
      const hit = svgEl("circle", {
        cx: x, cy: y, r: 12, fill: "rgba(0,0,0,0.001)", style: "cursor:help",
      }, g);
      hit.addEventListener("mouseenter", () => showPcpTip(x, y, label));
      hit.addEventListener("mouseleave", hidePcpTip);
    });
  }

  // -------------------------------------------------------------- コンター×3
  function ensureContourCanvas(i) {
    const card = dom.ct[i];
    const rect = card.body.getBoundingClientRect();
    const w = Math.max(Math.round(rect.width), 20), h = Math.max(Math.round(rect.height), 20);
    if (card.canvas.width !== w || card.canvas.height !== h) {
      card.canvas.width = w; card.canvas.height = h;
    }
    return { w, h };
  }

  function renderContour(i) {
    const card = dom.ct[i];
    const surf = STATE.surfaces[i];
    card.svg.innerHTML = "";
    card.body.querySelectorAll(".contour-note").forEach((n) => n.remove());
    const noPair = !STATE.ctAxes[i] || !STATE.ctAxes[i].x || !STATE.ctAxes[i].y;
    if (!STATE.sim || STATE.sim.slider_spec.length < 2 || noPair) {
      // v0.20: 軸割当は「他の図と組が重複しないこと」を優先するので、変数が
      // 2個しかない(＝組が1通りしかない)場合は2枚目以降に割り当てる組が無い。
      // 無理に同じ組を重複表示せず、理由を出して空にする。
      const note = document.createElement("div");
      note.className = "contour-note";
      note.textContent = STATE.sim && STATE.sim.slider_spec.length >= 2
        ? t("contourNoteNoPair") : t("contourNote");
      card.body.appendChild(note);
      const ctx0 = card.canvas.getContext("2d");
      ctx0.clearRect(0, 0, card.canvas.width, card.canvas.height);
      return;
    }
    if (!surf) return;
    const { w, h } = ensureContourCanvas(i);
    const grid = surf.mean.length;

    // 小さいgrid×gridのオフスクリーンcanvasに1セル1pxで描き、表示用canvasへ
    // 拡大描画(imageSmoothingEnabled)することで、なめらかなコンター風の
    // ブレンドになる(SVGで数百セルのrectを積むより軽い)。
    const off = document.createElement("canvas");
    off.width = grid; off.height = grid;
    const octx = off.getContext("2d");
    const img = octx.createImageData(grid, grid);
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const [r, g, b] = colorRgb(surf.mean[row][col]);
        const idx = (row * grid + col) * 4;
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    const ctx = card.canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, w, h);
    // surf.mean[row][col]はys[row]・xs[col]に対応し、rowが増えるとy値も増える
    // (=画面下方向に向かって値が増える)ため、y方向を反転して描画する。
    ctx.save();
    ctx.translate(0, h);
    ctx.scale(1, -1);
    ctx.drawImage(off, 0, 0, w, h);
    ctx.restore();

    // 軸ラベル・枠・候補マーカーはSVGオーバーレイに描く
    const svg = card.svg;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    const pad = { l: 0, r: 0, t: 0, b: 0 };
    const X = (v) => ((v - surf.xs[0]) / Math.max(surf.xs[surf.xs.length - 1] - surf.xs[0], 1e-12)) * w;
    const Y = (v) => h - ((v - surf.ys[0]) / Math.max(surf.ys[surf.ys.length - 1] - surf.ys[0], 1e-12)) * h;
    // 等高線(v0.19)。レベルは3枚共通の色ドメインを等分するので、パネル間で
    // 「何本目の線が同じ値か」が揃う。xs/ysはlinspaceなのでグリッド座標→画素
    // は線形写像でよい(col/(grid-1)*w、rowは上下反転)。
    if (grid >= 2) {
      const { lo, hi } = STATE.contourColorDomain;
      const gx = (c) => (c / (grid - 1)) * w;
      const gy = (r) => h - (r / (grid - 1)) * h;
      let d = "";
      for (let k = 1; k <= N_ISO_LEVELS; k++) {
        const level = lo + ((hi - lo) * k) / (N_ISO_LEVELS + 1);
        for (const [a, b] of isoSegments(surf.mean, level)) {
          d += "M" + gx(a[0]).toFixed(1) + " " + gy(a[1]).toFixed(1) +
               "L" + gx(b[0]).toFixed(1) + " " + gy(b[1]).toFixed(1) + " ";
        }
      }
      if (d) {
        svgEl("path", {
          d: d, fill: "none", stroke: "rgba(255,255,255,0.38)", "stroke-width": 1,
          "shape-rendering": "geometricPrecision", "pointer-events": "none",
        }, svg);
      }
    }
    svgEl("rect", { x: 0.5, y: 0.5, width: w - 1, height: h - 1, fill: "none", stroke: "rgba(255,255,255,0.14)", "stroke-width": 1 }, svg);
    const lx = svgEl("text", { x: 4, y: h - 4, fill: "rgba(255,255,255,0.75)", "font-size": "10.5", "font-family": "IBM Plex Mono, monospace" }, svg);
    lx.textContent = surf.x_col;
    const ly = svgEl("text", { x: 4, y: 12, fill: "rgba(255,255,255,0.75)", "font-size": "10.5", "font-family": "IBM Plex Mono, monospace" }, svg);
    ly.textContent = surf.y_col;
    const hint = svgEl("rect", { x: 0, y: 0, width: w, height: h, fill: "rgba(0,0,0,0.001)" }, svg);
    hint.appendChild(titleEl(t("contourTitle")));

    // v0.17: マーカーは吹き出しのトグルで選択中の候補だけ表示する（常時
    // 両方表示は廃止。「候補を選ぶ」操作系をPCP/コンター間で統一）。
    // v0.18: 形状を★/◆から単純な塗り丸(●)に変更し、色もPCP側と同じ
    // 緑(optimize)/青(accuracy)へ統一（旧シアン/ゴールドはコンター背景の
    // グラデーションと被って見えづらかった）。クリックでの選択/解除は
    // そのままトグル関数に委譲する。
    const props = STATE.payload && STATE.payload.proposals;
    if (props) {
      for (const kind of ["optimize", "accuracy"]) {
        if (!STATE.selected[kind]) continue;
        const prop = props[kind];
        const px = prop.x[surf.x_col], py = prop.x[surf.y_col];
        if (px === undefined || py === undefined) continue;
        const color = PROP_COLOR[kind];
        const halo = svgEl("circle", {
          cx: X(px), cy: Y(py), r: PROP_HALO_R[kind], fill: color, class: "proposal-halo " + kind,
        }, svg);
        const mk = svgEl("circle", {
          cx: X(px), cy: Y(py), r: PROP_MARKER_R[kind], fill: color,
          stroke: "#eef3fa", "stroke-width": 1.6, class: "proposal-marker " + kind,
        }, svg);
        mk.appendChild(titleEl(kind === "optimize" ? t("optimizeMarkerTitle") : t("accuracyMarkerTitle")));
        mk.addEventListener("click", () => toggleCandidate(kind));
      }
    }
  }

  function renderAllContours() {
    for (let i = 0; i < N_CONTOURS; i++) renderContour(i);
  }

  // ------------------------------------------------------------- 状態別描画
  // ロボの吹き出し(#statusText)がステータス説明を担う。予測Yカードは廃止した
  // ため（v0.15、「このスペースをロボ+吹き出しに使いたい」）、初期フェーズの
  // 次の初期点座標はここに統合して表示する。
  // v0.18: simフェーズの説明文("下のボタンで候補を選ぶと...現在のベスト:")は
  // 「全て不要」とのフィードバックで削除した -- ボタン自体が色(緑/青)で
  // ★=optimize/◆=accuracyを示すので、テキストでの説明は不要という判断。
  function renderStatus() {
    const st = dom.statusText;
    st.className = "";
    if (STATE.stage === "error") {
      st.classList.add("error"); st.textContent = t("statusError", { msg: STATE.errorMsg });
      dom.roboImg.src = "./assets/robo2_ok.gif";
    } else if (STATE.stage === "computing") {
      st.textContent = t("statusComputing"); dom.roboImg.src = "./assets/robo2_training.gif";
    } else if (STATE.stage === "initial") {
      let msg = t("statusInitial", { n: STATE.payload ? STATE.payload.observed : "?" });
      if (STATE.payload && STATE.payload.x_next) {
        const xs = Object.entries(STATE.payload.x_next).map(([k, v]) => k + "=" + fmt(v)).join(", ");
        msg += "\n" + xs;
      }
      st.textContent = msg;
      dom.roboImg.src = "./assets/robo2_ok.gif";
    } else if (STATE.stage === "sim") {
      // v0.20:「ロボはボタンを示す前に『どんな追加点を探す？』と最初に
      // 入れたい」への対応。v0.18で説明文を全部消したが、問いかけを1行だけ
      // 置いてボタンへ導く形にする。
      st.textContent = t("statusPrompt");
      dom.roboImg.src = "./assets/robo2_completed.gif";
    } else {
      st.textContent = t("statusIdle"); dom.roboImg.src = "./assets/robo2_ok.gif";
    }
  }

  function renderHeader() {
    dom.globalDropHint.textContent = t("dropHint");
    dom.fileBadge.textContent = STATE.filename || "-";
    dom.goalBadge.textContent = STATE.goal === "max" ? t("goalMax") : t("goalMin");
    dom.goalBadge.title = t("goalTitle");
    for (const b of dom.langBtns) b.classList.toggle("active", b.dataset.lang === STATE.lang);
    dom.sbCredit.textContent = t("footerCredit");   // Surrobotのui.footerCreditと同じ単一文字列
    renderBubbleButtons();
    renderStatusBar();
  }

  // ステータスバー（Surrobotの.status-bar/.sb-dot/.sb-labelパターンを移植）。
  function renderStatusBar() {
    const dot = dom.sbDot, label = dom.sbLabel;
    dot.classList.remove("active", "warn", "error");
    if (STATE.stage === "error") { dot.classList.add("error"); label.classList.remove("active"); }
    else if (STATE.stage === "computing") { dot.classList.add("warn"); label.classList.remove("active"); }
    else if (STATE.stage === "sim") { dot.classList.add("active"); label.classList.add("active"); }
    else { label.classList.remove("active"); if (STATE.stage === "initial") dot.classList.add("warn"); }
    label.textContent = t("sbLabel_" + STATE.stage);
  }

  function openAbout() {
    dom.aboutTitle.textContent = t("aboutTitle");
    dom.aboutBody.innerHTML = t("aboutBody");
    dom.aboutOverlay.style.display = "flex";
  }
  function closeAbout() { dom.aboutOverlay.style.display = "none"; }

  function renderDropZone() {
    dom.pcpScroll.querySelectorAll("svg").forEach((n) => n.remove());
    dom.pcpWrap.querySelectorAll(".drop-zone, .center-note").forEach((n) => n.remove());
    PCP.svg = null;
    // v0.19: 「CSVをドロップ だけにして」との指示により、列構成の説明文と
    // サンプルCSVボタンは撤去し、見出し1行だけにした。
    const z = document.createElement("div");
    z.className = "drop-zone";
    z.innerHTML = '<div class="drop-zone-hint">' + escapeHtml(t("dropHint")) + "</div>";
    dom.pcpWrap.appendChild(z);
    wireDropZone(z);
  }
  function renderCenterNote(text) {
    dom.pcpScroll.querySelectorAll("svg").forEach((n) => n.remove());
    dom.pcpWrap.querySelectorAll(".drop-zone, .center-note").forEach((n) => n.remove());
    PCP.svg = null;
    const n = document.createElement("div");
    n.className = "center-note drop-zone";
    n.style.cursor = "default";
    n.innerHTML = '<div class="drop-zone-sub">' + escapeHtml(text) + "</div>";
    dom.pcpWrap.appendChild(n);
  }
  function clearContours() {
    for (let i = 0; i < N_CONTOURS; i++) {
      dom.ct[i].svg.innerHTML = "";
      const ctx = dom.ct[i].canvas.getContext("2d");
      ctx.clearRect(0, 0, dom.ct[i].canvas.width, dom.ct[i].canvas.height);
      dom.ct[i].body.querySelectorAll(".contour-note").forEach((n) => n.remove());
    }
  }

  function renderAll() {
    renderHeader();
    renderStatus();
    if (STATE.stage === "idle") { clearContours(); renderDropZone(); }
    else if (STATE.stage === "computing") { clearContours(); renderCenterNote(t("statusComputing")); }
    else if (STATE.stage === "error") { renderCenterNote(t("statusError", { msg: STATE.errorMsg })); }
  }

  // ------------------------------------------------------------------ 配線
  dom.goalBadge.addEventListener("click", () => {
    STATE.goal = STATE.goal === "min" ? "max" : "min";
    renderHeader();
    if (STATE.csvText && (STATE.stage === "sim" || STATE.stage === "initial" || STATE.stage === "error")) {
      runSim(STATE.csvText, STATE.filename);
    }
  });
  for (const b of dom.langBtns) {
    b.addEventListener("click", () => {
      const lang = b.dataset.lang;
      if (lang === STATE.lang || !SUPPORTED_LANGS.includes(lang)) return;
      STATE.lang = lang;
      persistLang(lang);   // 次回起動時も同じ言語で開く(Surrobotと同じ挙動)
      document.documentElement.lang = STATE.lang;
      renderAll();
      if (dom.aboutOverlay.style.display !== "none") openAbout();
      if (STATE.stage === "sim" || STATE.stage === "initial") { buildStaticLayers(); renderAllContours(); }
    });
  }
  dom.btnOptimize.addEventListener("click", () => toggleCandidate("optimize"));
  dom.btnAccuracy.addEventListener("click", () => toggleCandidate("accuracy"));
  dom.btnDownload.addEventListener("click", downloadSelectedCandidates);
  dom.btnTrySample.addEventListener("click", trySample);
  dom.settingsBtn.addEventListener("click", openAbout);
  dom.sbCredit.addEventListener("click", openAbout);
  dom.aboutCloseBtn.addEventListener("click", closeAbout);
  dom.aboutOverlay.addEventListener("click", (ev) => { if (ev.target === dom.aboutOverlay) closeAbout(); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && dom.aboutOverlay.style.display !== "none") closeAbout();
  });
  // X/Yに同じ列を選ぶと sim_surface が "x_col and y_col must differ" で
  // 弾かれ、そのパネルだけ空のまま何も描かれなくなる。ユーザーが誤って
  // 同じ列を選んでも壊れず操作を続けられるよう、選ばれた側と衝突する方を
  // 自動的に入れ替える(実機フィードバック「軸はかぶらないように」を、
  // パネル単体の入力レベルでも徹底する)。
  for (let i = 0; i < N_CONTOURS; i++) {
    dom.ct[i].x.addEventListener("change", () => {
      const newX = dom.ct[i].x.value;
      if (newX === STATE.ctAxes[i].y) {
        STATE.ctAxes[i].y = STATE.ctAxes[i].x;
        dom.ct[i].y.value = STATE.ctAxes[i].y;
      }
      STATE.ctAxes[i].x = newX; STATE.surfaces[i] = null; refreshSurfacesNow();
    });
    dom.ct[i].y.addEventListener("change", () => {
      const newY = dom.ct[i].y.value;
      if (newY === STATE.ctAxes[i].x) {
        STATE.ctAxes[i].x = STATE.ctAxes[i].y;
        dom.ct[i].x.value = STATE.ctAxes[i].x;
      }
      STATE.ctAxes[i].y = newY; STATE.surfaces[i] = null; refreshSurfacesNow();
    });
  }
  let _resizeTimer = null;
  window.addEventListener("resize", () => {
    // zoom再計算を先に行い、PCP/コンターのジオメトリ計算(clientWidth/Height)が
    // 変倍後のサイズを読むようにする(SurrobotのfitBoxedZoom呼び出し順を踏襲)。
    fitBoxedZoom();
    if (STATE.stage !== "sim" && STATE.stage !== "initial") return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => { buildStaticLayers(); renderAllContours(); }, 80);
  });

  // ------------------------------------------------------------------ 起動
  // localStorageに前回の言語が残っていればHTMLのlang属性もそれに合わせる
  // （index.htmlは lang="ja" 固定で書かれているため）。
  document.documentElement.lang = STATE.lang;
  fitBoxedZoom();
  renderAll();
  bootEngine();
})();
