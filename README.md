# JinSan Tower Game

ブラウザゲーム「仁さんタワーゲーム」の開発用READMEです。

## 現在の開発版

**v1.39.8**

- ブランチ: `develop`
- `main`: 安定版
- 開発・物理検証は `develop` で実施
- Matter.js: `0.20.0`
- フロントエンド: HTML / CSS / JavaScript
- バックエンド・DB: なし
- Vercel Preview: `https://jin-san-tower-game.vercel.app/?debug=on`

v1.39.8は、物理パラメータや通常ゲームの挙動を変更せず、**Matter.jsのsubstep直後の状態を直接取得する診断処理へ切り替えるバージョン**です。

## 1. リポジトリ運用

### ブランチ

- `main`: 安定版
- `develop`: 開発・検証用

基本的な運用は、ChatGPTで完全差し替えファイルを作成 → ユーザーが内容を確認 → ユーザーがGitHubへコミット、です。

### `docs/`

`docs/` はGitHub Actionsやログアップロード手順などの運用資料を置く領域です。
物理検証用コード変更では原則として変更しません。

### ログ

自動計測結果はiPhoneショートカットからGitHubの `develop/log/<version>/runN.zip` に保存します。
既存のアップロードワークフローは再作成しません。

---

## 2. 通常ゲーム

ゲーム本体はHTML / CSS / JavaScriptで構成されています。

主なファイル:

```text
index.html
style.css
js/
├─ physics.js
├─ piece.js
├─ renderer.js
├─ input.js
├─ game.js
├─ main.js
└─ physics-stabilization.js
```

画像素材は `assets/` に配置します。

ピースは画像フォルダから連番で自動検出します。現在の計測対象は37ピースですが、今後のピース追加を前提としているため、**37という数を検証ロジックへハードコードしません**。

---

## 3. 物理計測モジュール

現在の計測コードは以下の構成です。

```text
js/
├─ measurement.js
└─ measurement/
   ├─ contact.js
   ├─ config.json
   ├─ observer.js
   ├─ summary.js
   ├─ validation.js
   ├─ export.js
   ├─ version.js
   └─ substep.js
```

### 各ファイルの役割

- `measurement.js`
  - 自動計測全体の開始・終了
  - ピース切り替え
  - 計測状態管理
  - 計測モジュール間の接続
- `measurement/contact.js`
  - 地面接触判定
  - 接触点・接触Part・接触幅・接触中心などの取得
- `measurement/observer.js`
  - フレーム単位の状態観測
  - 着地判定
  - 安定判定
  - Sleep後の地面接触履歴を利用した安定判定
- `measurement/summary.js`
  - ピース単位のsummary生成
  - contact event / contact change / contact loopの集約
- `measurement/validation.js`
  - `validation.csv` の生成
  - ピースごとの計測完了状態を検証
- `measurement/export.js`
  - CSV生成
  - ZIP生成
  - iPhoneでの保存・共有
- `measurement/version.js`
  - 計測バージョンの唯一の定義元
- `measurement/substep.js`
  - v1.39.8で追加したsubstep診断

---

## 4. 自動計測条件

`?debug=on` でゲームモード画面に「物理挙動デバッグ」が表示されます。

「全ピース自動計測」を実行すると、検出されたピースを1つずつ同じ条件で計測します。

- 初期位置・初期角度を統一
- 初速・初期角速度を0に設定
- 各ピース単独で計測
- ピース同士の接触なし
- 自動計測では側壁なし
- 落下から地面接触、安定まで記録
- 現在の計測対象数に依存しない動的検出

### 計測終了条件

現在の値:

- `MIN_POST_LAND_FRAMES = 30`
- `STABLE_REQUIRED_FRAMES = 20`
- `MAX_POST_LAND_FRAMES = 600`
- 線速度安定閾値: `0.01`
- 角速度安定閾値: `0.01`
- Matter.js substep数: `4`

着地後30フレーム以上経過した状態で、地面接触かつSleepまたは低速度状態が20フレーム連続すると `stable_confirmed` とします。

Sleep中はMatter.jsの仕様上、地面とのactive pairが消える場合があるため、直前の地面接触履歴を利用した `SLEEP_AFTER_GROUND_CONTACT` も使用します。

600フレームに到達した場合は安全弁として計測を終了し、安定確認できていなければ `max_post_land_timeout` とします。

これらは計測終了条件であり、Matter.jsの物理パラメータそのものではありません。

---

## 5. 現在の物理パラメータ

v1.39.8でも以下を変更していません。

```text
subSteps                     4
positionIterations          12
velocityIterations           8
constraintIterations         2
gravityX                     0
gravityY                     1
gravityScale                 0.001

groundFriction               0.85
groundFrictionStatic          1
groundRestitution             0
pieceFriction                 0.35
pieceFrictionStatic           0.45
pieceFrictionAir              0.015
pieceRestitution              0
pieceDensity                  0.002
pieceSleepThreshold          60
pieceSlop                     0.10

narrowContactThresholdPx     12
contactOffsetThresholdPx     3
groundEdgeTolerancePx         2.5
maxLandingAngularCorrection  0.70
minCollisionDeltaAngular     0.02
contactOffsetScalePx        12
```

特に `narrowContactThresholdPx` はv1.39.5で8pxから12pxへ変更し、v1.39.6でも12pxを維持しています。

v1.39.8ではこの値を変更しません。

---

## 6. 物理形状とCompound Body

ピース画像の透過領域から衝突形状を生成します。

- 画像の不透明領域を解析
- 領域を三角形分割
- 凸形状を組み合わせてCompound Bodyを生成
- 現在の `COMPOUND_MODE` は `intermediate`
- 透明領域を埋めるような衝突形状は作らない方針

1つのピースが複数のMatter.js Collision Partを持つことがあります。

そのため、同じピースでも接触時に

- 接触Part数
- 接触点数
- support数
- 接触幅
- 接触中心位置

などの接触マニホールドが変わる可能性があります。

---

## 7. 既存の接触・角速度診断

現在の計測ZIPには主に以下が含まれます。

- `metadata.csv`
- `validation.csv`
- `summary_*.csv`
- `contact_events_*.csv`
- `contact_changes_*.csv`
- `contact_loops_*.csv`
- `frames_*.csv`
- `substeps.csv`（v1.39.8）

### `contact_events`

連続した地面接触区間を1イベントとして記録します。

Matter.js Solverによる角速度変化と、既存のnarrow-contact correctionによる角速度変化を分離します。

```text
solver_delta_angular_velocity
correction_delta_angular_velocity
total_delta_angular_velocity
```

### `contact_loops`


```text
contact
→ separation
→ free flight
→ re-contact
```

という再接触をイベント単位で抽出します。

主な分類:

- `ANGULAR_RECONTACT_LOOP`
- `MIXED_RECONTACT_LOOP`
- `LINEAR_RECONTACT_LOOP`
- `RECONTACT`

`ANGULAR_RECONTACT_LOOP` は「暴れること」を直接意味する分類ではありません。接触イベント間で角速度が維持され、前イベントに一定以上の角速度変化があった場合の分類です。

---

## 8. これまでに確認できた物理的な傾向

### v1.39.4 run1

- 37/37: `stable_confirmed`
- 37/37: `row_count_ok`
- 37/37: `landing_present`
- 37/37: stable confirmation 20 frames
- timeout: 0
- raw rows: 5543
- contact events: 75
- contact loops: 38
- `ANGULAR_RECONTACT_LOOP`: 14
- `MIXED_RECONTACT_LOOP`: 15
- `RECONTACT`: 9

14件のAngular loopの多くは次の接触幅が8px未満で、現在のnarrow-contact thresholdとの相関が確認されました。ただし、これだけではnarrow-contact correctionが原因とは確定できません。

### v1.39.6 run1

`narrowContactThresholdPx` を8pxから12pxへ変更した結果、短時間接触イベントと大きな角速度変化が減少しました。

v1.39.4 run1との比較:

| 指標 | v1.39.4 | v1.39.6 |
|---|---:|---:|
| short contact events（4 substeps以下） | 34 | 25 |
| 最大短時間event `|Δω| > 0.15` のピース数 | 19 | 10 |
| 最大短時間event `|Δω| > 0.20` のピース数 | 13 | 8 |
| 最大短時間event `|Δω| > 0.25` のピース数 | 6 | 3 |
| contact loops | 38 | 27 |

ただし、Piece 25など、12pxの閾値だけでは説明できないケースも残っています。

---

## 9. 「同じピースなのにrunごとに暴れる」問題

現在の重要な調査対象です。

同じ条件で計測しても、同じピースがrunによって大きく回転する場合と、ほとんど回転しない場合があります。

Piece 25についてv1.39.4 run2 / run3を比較した結果、最初の接触substep付近で接触マニホールド自体が異なることが確認されています。

一例:

- run2のsubstep 238
  - contact width: 約1px
  - contact Part: 1
  - support/contact geometryが非常に狭い
- run3のsubstep 238
  - contact width: 約16px
  - contact Part: 3
  - support: 約16px

そのため、現時点では

```text
微小な事前状態の差
    ↓
衝突時の接触マニホールドの違い
    ↓
Matter.js Solverへの入力の違い
    ↓
角速度の違い
    ↓
再接触・回転のカスケード
```

という仮説が、単純に「Solverが同じ入力に対してランダムに違う結果を出している」という仮説より整合的です。

ただし、v1.39.7では必要なsubstepデータを取得できなかったため、まだ確定ではありません。

---

## 10. v1.39.7の問題

v1.39.7では `substeps.csv` を追加しましたが、実際のrun1ではヘッダーのみでデータ行が0件でした。

一方、通常の計測は正常でした。

- 37/37 `stable_confirmed`
- 37/37 `row_count_ok`
- 37/37 `landing_present`
- timeout 0

したがって、問題は通常の計測ではなく、substep診断の取得方法に限定されます。

---

## 11. v1.39.8の目的

v1.39.8ではsubstep診断の取得方法を変更します。

### v1.39.7

```text
measurement/substep.js
    ↓
Matter.Engine.update を外側からラップ
    ↓
各substepを取得しようとする
```

### v1.39.8

```text
Physics.step()
    ↓
Engine.update()
    ↓
既存のSolver処理
    ↓
既存のnarrow-contact correction
    ↓
substep diagnostic hook
    ↓
measurement/substep.js
```

つまり、実際の`Physics.step()`内で各substepが処理された直後に、診断用データだけを外へ渡します。

### 取得するデータ

最初の地面接触を基準に前後12substepを保存します。

- position X/Y
- angle
- velocity X/Y
- angular velocity
- Solver直後の同値
- correction後の同値
- Solver角速度変化
- correction角速度変化
- ground pair数
- contact数
- support数
- contact Part数
- contact Part ID
- contact width
- contact center offset
- collision normal
- collision depth
- collision separation

このデータによって、特に最初の接触前後について

```text
substep 236
substep 237
substep 238
substep 239
```

などをrun間で直接比較できるようにします。

### 物理挙動への影響

v1.39.8では、診断フックの追加以外に以下を変更しません。

- gravity
- friction
- restitution
- density
- Solver iteration
- substep数
- sleep threshold
- narrow-contact threshold
- narrow-contact correction式
- 接触判定式
- 安定判定条件

診断フック内部で例外が発生した場合も、物理計算を停止させず警告として処理します。

---

## 12. v1.39.8で確認したいこと

最優先は、同じピースのrun間差が**接触前から存在するのか、接触検出時に初めて発生するのか**を切り分けることです。

### A. 接触前から差がある場合

```text
236以前から x/y/angle/vx/vy/omega が異なる
```

場合は、フレーム時間・subDtなど、接触前の状態生成側を調べます。

### B. 接触前まではほぼ同じ場合

```text
236～237までほぼ同じ
238でcontact Part/support/widthが異なる
```

場合は、Matter.jsのnarrow-phase / compound-bodyの接触マニホールド生成を重点的に調べます。

この切り分けができるまでは、Solverやfrictionなどの物理パラメータを追加で変更しません。

---

## 13. ZIP出力

計測完了後、画面下部からZIPを保存できます。

ファイル名:

```text
JinSanTowerGame_v1.39.8_runN_diagnostics.zip
```

iPhoneでは「ZIPを共有（iPhone）」も使用できます。

既存のショートカットでGitHubへ保存する場合は、従来どおり

```text
log/v1.39.8/runN.zip
```

へ保存します。

---

## 14. 開発上の注意

- 物理原因を調査中のため、診断バージョンでは物理パラメータを同時に変更しない。
- 1バージョンにつき変更目的を限定する。
- ピース数37をハードコードしない。
- `docs/` の既存ログアップロード手順を再作成しない。
- コード変更はパッチではなく完全差し替えファイルで管理する。
- バージョン番号は `js/measurement/version.js` を唯一の定義元とする。
- ZIP生成処理は既存の`measurement/export.js`を利用する。

