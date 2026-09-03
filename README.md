# JinSan Tower Game

スマートフォン向けのローカル物理積み上げゲームです。Canvas + Matter.js 0.20.0 を使用しています。

## v20.2

v20.2は、**12.pngで三角形分割に失敗して矩形へフォールバックする問題を調査する診断版**です。

物理形状の生成ロジック自体はv19から変更していません。三角形分割が失敗した場合に、原因を確認できる診断情報を追加しています。

デバッグモードでは以下を確認できます。

- 輪郭頂点数
- 三角形分割前後の頂点数
- 輪郭面積・向き
- 自己交差の有無
- 三角形分割の成否
- 三角形分割失敗理由
- 失敗時点で残っていた頂点数
- 物理三角形数・物理頂点数
- Fallbackの有無
- Matter.js Body / COM / Image Offset
- 回転角度
- 最初のMatterパーツとBody COMの相対位置

### 12.pngの調査

12.pngをデバッグモードで表示し、特に以下を確認します。

```text
簡略化後
自己交差
三角形化
理由
失敗時残頂点
Fallback
```

これにより、画像輪郭そのものの問題なのか、輪郭の簡略化なのか、Ear Clippingの失敗なのかを切り分けます。

## 通常モード / デバッグモード

v19以降、URLパラメータで切り替えられます。

### 通常モード

URLパラメータを付けずにアクセスします。

```text
https://shun-1016.github.io/JinSanTowerGame/
```

デバッグ表示はありません。

### デバッグモード

`?debug=on` を付けます。

```text
https://shun-1016.github.io/JinSanTowerGame/?debug=on
```

01.png〜21.pngを通常順番で使用し、デバッグ情報を表示します。

### 特定画像を固定してデバッグ

`debug=on` と `piece=番号` を組み合わせます。

例：12.pngを固定

```text
https://shun-1016.github.io/JinSanTowerGame/?debug=on&piece=12
```

例：04.pngを固定

```text
https://shun-1016.github.io/JinSanTowerGame/?debug=on&piece=04
```

`piece` は01〜21を指定できます。

## デバッグ表示

- 青線：画像のアルファ輪郭
- 赤線：Matter.jsの実際の物理形状
- 緑点：Matter.jsの頂点
- 黄点：Matter.jsの各パーツ位置
- 紫点：Compound BodyのCOM
- 白十字：画像中心
- シアン枠：期待される画像中心

## 技術構成

- HTML / CSS / JavaScript
- Canvas
- Matter.js 0.20.0
- 外部サーバー・DBなし
- GitHub Pagesで公開可能

## 主要ファイル

```text
index.html
style.css
js/
  main.js
  game.js
  input.js
  piece.js
  physics.js
  renderer.js
```

## 画像素材

```text
assets/01.png
assets/02.png
...
assets/21.png
```

画像のアルファ情報から輪郭を抽出し、その輪郭をMatter.js用の三角形メッシュへ変換します。
