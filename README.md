# JinSan Tower Game

## v1.40.0

`develop` の物理検証用バージョンです。v1.39.6を基準に、接触・Solver安定性をまとめて検証します。

### 今回変更する物理パラメータ

- `subSteps`: 4 → 8
- `positionIterations`: 12 → 16
- `velocityIterations`: 8 → 12
- `pieceFriction`: 0.35 → 0.25
- `pieceFrictionStatic`: 0.45 → 0.35

### 維持する主な値

- `narrowContactThresholdPx`: 12
- `pieceFrictionAir`: 0.015
- `pieceRestitution`: 0
- `pieceDensity`: 0.002
- `gravityScale`: 0.001
- `groundFriction`: 0.85
- narrow-contact correction の式・閾値
- 安定判定条件

### 実験目的

これまで、同じピースでもrunによって接触Part/support/接触幅と角速度変化が異なるケースが確認されています。v1.40.0では、physics substepを細かくし、Solver反復回数を増やし、接触時の摩擦を弱めることで、再接触・角速度増幅・短時間接触がまとめて減少するかを確認します。

### ログ診断

v1.39.7〜v1.39.9で追加したsubstep診断処理は実測で`substeps.csv`がヘッダーのみとなったため、v1.40.0では採用していません。通常のv1.39.6計測系へ戻しています。

ピース数に依存したハードコードは行いません。
