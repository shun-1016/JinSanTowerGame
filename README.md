# JinSan Tower Game

## v23.5
v23.5はv23.4.1をベースに、**物理パラメータ・ピース形状生成・通常ゲームの挙動を変更せず**、物理挙動デバッグの自動計測出力方式を整理したバージョンです。

### v23.5 デバッグ計測
`?debug=on` でゲームモード選択画面に「物理挙動デバッグ」が表示されます。

- 「全ピース自動計測」1ボタンで、検出された全ピースを順番に計測
- 画像フォルダ内の連番ピースを自動検出し、ピース追加時も対象数を自動増加
- 全ピースを同じ初期位置・初期角度・初速0で計測
- 落下開始から接地を検出
- 接地後60フレームまで継続記録
- 位置、速度、角速度、角度、Sleep状態、接地状態をフレーム単位で記録
- 質量、慣性、重心ズレ、従来の底面幅、縦横比、物理パーツ数、三角形数、領域数、輪郭頂点数も記録
- 最下端から1/2/4/8px以内の物理頂点幅を記録
- 実際の地面接触点の幅、接触点数、接触パーツ数、接触中心のズレを記録
- 計測完了後、**ピースごとのCSVを1つのZIPにまとめて自動出力**
- ZIP内は `01.csv`, `02.csv` ... のようにピース単位で分割
- 画面上には計測後の「計測ZIPを保存」リンクも表示

### 出力ファイル
ZIPファイル名は `JinSanTowerGame_v23.5_physics_logs_YYYYMMDDHHMMSS.zip` の形式です。
ZIP内の各CSVはUTF-8 BOM付きで、Excel等で開いた際に日本語を含む環境でも扱いやすい形式です。

### 通常ゲーム
v23.5では、物理パラメータ、ピース形状生成、通常モード、エンドレスモード、ゲームオーバー判定などの既存挙動を変更していません。

## v23.5 修正内容
- v23.4.1の計測グループUIを廃止。
- 「全ピース自動計測」1ボタンに統一し、モーダルの肥大化を解消。
- 計測対象を全ピースへ変更。
- 計測データをピース番号ごとのCSVへ分割。
- 外部ライブラリを追加せず、ゲーム内のデバッグロジックだけでZIPを生成。
- ZIP 1ファイルとして自動ダウンロードし、必要に応じて画面から再保存可能。
- 物理計測項目、Matter.js 0.20.0の接触点取得ロジック、物理パラメータは変更なし。

## v1.37.8

- `contact_events.csv` のイベントレベル Solver / Correction / Total 集計ロジックを修正。
- イベント開始値は最初の接触substepの **Engine.update + 補正後** の状態であるため、そのSTART substepの角速度変化をイベント集計から除外し、イベント開始状態から終了状態までのsubstepだけを累積する方式に変更。
- これにより `total_delta_angular_velocity` は `end_angular_velocity - start_angular_velocity` と一致することを期待する。
- `decomposition_residual` と `decomposition_consistent` を追加し、イベント集計の整合性を機械的に確認できるようにした。
- `solver + correction = total` の関係も維持する。
- Matter.jsの物理パラメータ、狭接触角速度補正の式・条件、接触判定・イベント分類ロジックは変更しない。
- 診断ロジックのみの修正。

## v1.37.6

- v1.37.5で `contact_changes` に記録される solver / correction / total の分解値を、`contact_events` のイベント集計値にも正しく反映。
- `contact_events.csv` の3列は、各イベント中の全接触substepにおける `solverDeltaAngular` / `correctionDeltaAngular` / `totalDeltaAngular` の累積値を出力。
- `total_delta_angular_velocity` は `solver_delta_angular_velocity + correction_delta_angular_velocity` と一致することを確認できる診断値。
- Matter.js の物理パラメータ、narrow-contact correction の計算式・適用条件、接触判定・イベント分類は変更しない。
- 診断のみの修正。`docs/` は変更しない。

## v1.37.5

### 目的
v1.37.4で追加したsolver/correction角速度分離診断について、`contact_changes.csv` のchange-point行にも同じ分解値を記録できるようにします。あわせて `contact_events.csv` では接触イベント全体について各substepのsolver/correction/total角速度変化を積算して記録します。

### 追加・修正した診断
- `contact_changes_*.csv` の各change-pointに以下を記録
  - `solver_delta_angular_velocity`：そのsubstepのMatter.jsソルバによる角速度変化
  - `correction_delta_angular_velocity`：そのsubstepの既存の狭接触角速度補正による角速度変化
  - `total_delta_angular_velocity`：そのsubstepの更新前から補正後までの角速度変化
- `contact_events_*.csv` では接触イベント中の各substepについて上記3値を積算し、イベント全体の分解値として記録
- `total = solver + correction` の関係を維持する診断値として出力

### 物理挙動
- Matter.jsの物理パラメータは変更しません。
- 狭接触角速度補正の計算式・適用条件は変更しません。
- 接触判定、イベント分類、change-point抽出条件は変更しません。
- 計測・診断情報のみ変更します。
- `docs/` は変更しません。

## v1.37.4

### 目的
v1.37.3までのログでは、接触時の角速度変化について「Matter.jsのソルバによる変化」と「ゲーム側の狭接触角速度補正による変化」を直接分離できませんでした。v1.37.4では**物理挙動を変更せず、診断情報のみ追加**します。

### 追加した角速度診断
各Physics substepで以下を記録します。
- `pre_angular_velocity`：Matter.js更新前の角速度
- `solver_angular_velocity`：`Engine.update()`直後の角速度
- `solver_delta_angular_velocity`：ソルバによる角速度変化
- `correction_delta_angular_velocity`：狭接触補正による角速度変化
- `total_delta_angular_velocity`：更新前から最終状態までの角速度変化

これにより、接触時の角速度変化を「Matter.jsソルバ」「既存の狭接触補正」「合計」に分離して確認できます。

### 物理挙動
- Matter.jsの物理パラメータは変更しません。
- 狭接触角速度補正の計算式・適用条件も変更しません。
- 計測・診断情報のみ追加します。
- `docs/` は変更しません。

## v1.37.3

### ファイル配置
- `index.html`：ルート
- `README.md`：ルート
- `js/measurement.js`
- `js/measurement-contact.js`
- `js/measurement-config.json`
- `js/physics.js`

`docs/` はデバッグログのアップロード手順やGitHub Actions関連のREADMEを配置する運用のため、v1.37.3では変更しません。

### リファクタリング
- 接触診断処理を `measurement-contact.js` に分離
- 計測項目を `measurement-config.json` に辞書化
- 接触点X/Y、COM相対座標、接触法線、トルクproxy、接触点数、Collision Part等を整理
- 狭接触時角速度補正本体は維持
- `?narrowCorrection=on/off` のURL切替は削除

`measurement-contact.js` は `measurement.js` より先に読み込みます。
