# JinSanTowerGame v17.5

## 今回の修正
- Matter.jsの読み込みを `lib/matter.min.js` 依存からCDN読み込みへ変更
- Matter.js → 物理層 → Piece → Renderer → Input → Game → Main の読み込み順を整理
- 起動時に21枚の画像をプリロードしてから初期ピースを生成
- 初期ピースはMatter Worldへ追加後にStatic待機
- 落下時はStatic解除＋Sleep解除
- 落下したピースを即座に固定済み配列へ移し、次ピースを即座に生成
- iPhone SEを含むスマホ幅向けヘッダーを調整
- ヘッダーにバージョン情報 `v17.5` を表示

## 既存資産
`assets/01.png` ～ `assets/21.png` は既存リポジトリのものをそのまま使用します。

## 物理形状
v17.5ではまずMatter.jsの落下・衝突・回転を確実に動作させることを優先し、画像は矩形Colliderを使用しています。
