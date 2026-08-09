// explorebot-worker.js -- explorebot-engine.js を Web Worker 上で動かすための薄い中継スクリプト。
// Pyodideの計算(CPUバウンド)をメインスレッドから分離し、UI(ロボアニメーション・
// ドロップゾーン操作等)がブロックされないようにする。オーケストレーションロジックは
// 一切持たず、explorebot-engine.js(window/document依存ゼロ)をそのままimportして
// postMessageで中継するだけ（Surrobotのtreg-worker.jsと同じ構図）。
import * as engine from "./explorebot-engine.js";

self.onmessage = async (ev) => {
  const { type, requestId } = ev.data;
  try {
    if (type === "init") {
      const ver = await engine.initEngine({
        onStatus: (text) => self.postMessage({ type: "status", requestId, text }),
        onLog: (line) => self.postMessage({ type: "log", requestId, line }),
      });
      self.postMessage({ type: "complete", requestId, payload: { version: ver } });
    } else if (type === "suggest") {
      const { csvText, opts } = ev.data;
      const result = await engine.suggest(csvText, opts);
      self.postMessage({ type: "complete", requestId, payload: { result } });
    } else if (type === "simStart") {
      const { csvText, opts } = ev.data;
      const result = await engine.simStart(csvText, opts);
      self.postMessage({ type: "complete", requestId, payload: { result } });
    } else if (type === "simEval") {
      const { values, grid } = ev.data;
      const result = await engine.simEval(values, grid);
      self.postMessage({ type: "complete", requestId, payload: { result } });
    } else if (type === "simSurface") {
      const { values, xCol, yCol, grid } = ev.data;
      const result = await engine.simSurface(values, xCol, yCol, grid);
      self.postMessage({ type: "complete", requestId, payload: { result } });
    } else if (type === "simMakeCsv") {
      const { values, onlyNew } = ev.data;
      const result = await engine.simMakeCsv(values, onlyNew);
      self.postMessage({ type: "complete", requestId, payload: { result } });
    } else {
      self.postMessage({ type: "error", requestId, message: `未知のリクエスト種別: ${type}` });
    }
  } catch (e) {
    self.postMessage({ type: "error", requestId, message: String(e?.message || e) });
  }
};
