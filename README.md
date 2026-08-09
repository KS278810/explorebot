# Explorebot（Web版）

<https://ks278810.github.io/explorebot/>

ガウス過程による能動学習・ベイズ最適化ツール **Explorebot** の Web 版です。
CSV を渡すと「次に試すべき点」を提案します。ブラウザ内で完結し（Pyodide /
WebAssembly）、データがどこかへ送信されることはありません。

## このリポジトリについて

**ビルド済みの配布物だけ**を置いています。ソースコードは非公開の開発リポジトリ側に
あり、ここへは公開用のビルド手順を通した成果物が配置されます（Python は `.pyc` の
みの wheel に変換済み）。

- 中身は自動生成なので、**直接編集しないでください**（次の配置で上書きされます）
- 履歴は持ちません。更新のたびに単一のコミットを差し替えます

## オフライン版・CLI

ネットワークもサーバーも不要な単一フォルダ版と、Windows 用 CLI は
[Releases](https://github.com/KS278810/explorebot/releases) から入手できます。

## 問い合わせ

不具合の報告・ご要望は
[Issues](https://github.com/KS278810/explorebot/issues) へお願いします。
