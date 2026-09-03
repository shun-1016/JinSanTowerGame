# JinSanTowerGame v18.0

v17.10をベースに、画像ごとの物理形状をゲーム起動時に自動生成するMatter.js版です。

## v18.0の変更
- `assets/01.png`～`21.png`を読み込み時に自動解析。
- PNGのアルファ値から表示領域を抽出し、横方向の帯状領域を自動生成。
- 複数の凸形状をMatter.jsのcompound bodyとして1つのピースに統合。
- 透明部分を物理判定から除外するため、従来の矩形判定より画像の外形に近い接触になります。
- 画像ごとのJSONや条件分岐による個別設定は不要です。
- 解析結果はキャッシュし、同じ画像を何度も解析しません。
- Matter.js 0.20.0の`Bodies.fromVertices`を使用。各帯は凸四角形なので、poly-decomp追加なしで動作します。
- 複雑な形状でもモバイル端末で重くなりすぎないよう物理パーツ数に上限を設定しています。

## 更新方法
今回の変更対象は以下です。

- `js/piece.js`
- `js/physics.js`
- `js/renderer.js`
- `js/game.js`
- `js/input.js`
- `README.md`

既存の`assets/01.png`～`21.png`、`js/main.js`、`index.html`、`style.css`はそのまま使用できます。
