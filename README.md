# JinSanTowerGame v17

Matter.js移行用の新しいフォルダ構成です。

## 構成

- `index.html` : HTML / 読み込み順
- `style.css` : UI / Canvasレイアウト
- `js/main.js` : 起動・ゲームループ
- `js/game.js` : ゲームルール
- `js/physics.js` : Matter.js物理処理
- `js/piece.js` : ピース定義
- `js/renderer.js` : Canvas描画
- `js/input.js` : 入力処理
- Matter.js 0.20.0 : jsDelivr CDNから読み込み（GitHub Pagesでそのまま動作）
- `assets/01.png` ～ `21.png` : 既存の加工済み画像

## 注意

v17では既存の `assets` フォルダはそのまま利用します。
このZIPには画像素材は含めていません。

Matter.js本体は `lib/matter.min.js` に配置しています。
