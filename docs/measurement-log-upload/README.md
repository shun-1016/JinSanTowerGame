# 物理計測ログ GitHub アップロード運用

このドキュメントは、仁さんタワーゲームの物理計測ログを iPhone のショートカットから GitHub の `develop` ブランチへ保存するための運用仕様です。

アプリ本体の仕様・開発内容はリポジトリ直下の `README.md` で管理し、本ドキュメントでは計測ログの保存・アップロード・自動展開・解析用ログの管理方法を管理します。

## 1. 保存先

計測ログは以下のディレクトリ構成で保存します。

```text
log/
└── <バージョン>/
    ├── run1.zip
    ├── run1/
    │   ├── metadata.csv
    │   └── ...
    ├── run2.zip
    ├── run2/
    │   ├── metadata.csv
    │   └── ...
    └── ...
```

ZIPは計測時点の原本として保持し、GitHub ActionsによってZIP内部のCSVを展開して解析に使用します。

GitHub API のZIP保存先は次の形式です。

```text
https://api.github.com/repos/shun-1016/JinSanTowerGame/contents/log/<バージョン>/<Run番号>.zip
```

ブランチは `develop` を使用します。

## 2. 入力ファイルの命名規則

ショートカットは計測ZIPのファイル名から、バージョンとRun番号を自動取得します。

推奨形式：

```text
JinSanTowerGame_<バージョン>_<Run番号>_diagnostics.zip
```

例：

```text
JinSanTowerGame_v1.36.0_run1_diagnostics.zip
JinSanTowerGame_v1.36.0_run2_diagnostics.zip
JinSanTowerGame_v1.37.0_run1_diagnostics.zip
```

ファイル名を `_` で分割し、以下の位置を使用します。

| インデックス | 値 | 用途 |
|------|------|------|
| 1 | JinSanTowerGame | 固定のゲーム名 |
| 2 | v1.36.0 | バージョン |
| 3 | run1 | Run番号 |
| 4 | diagnostics.zip | 補助情報 |

したがって、バージョンやRun番号をショートカットへ直接入力する必要はありません。

## 3. iPhoneショートカットの処理

現在のショートカットは、概ね以下の処理を行います。

```text
共有シートからZIPを受け取る
    ↓
ファイル名を取得
    ↓
「_」で分割
    ↓
インデックス2 → バージョン
インデックス3 → Run番号
    ↓
ZIPをBase64エンコード
    └ 行区切り：なし
    ↓
GitHub API用のJSON辞書を作成
    ├ message → Upload measurement log <バージョン> <Run番号>
    ├ content → Base64エンコード結果
    └ branch  → develop
    ↓
保存先URLを動的生成
    ↓
GitHub Contents APIへPUT
    ↓
GitHubへZIP保存
    ↓
GitHub Actionsが自動実行
    ↓
ZIPを展開
```

### GitHub APIリクエスト

HTTPメソッド：

```text
PUT
```

URL：

```text
https://api.github.com/repos/shun-1016/JinSanTowerGame/contents/log/<バージョン>/<Run番号>.zip
```

本文：

```json
{
  "message": "Upload measurement log <バージョン> <Run番号>",
  "content": "<Base64エンコードされたZIP>",
  "branch": "develop"
}
```

Content-Type：

```text
application/json
```

Base64の行区切りは**「なし」**にします。

## 4. 通常のアップロード手順

1. ゲームのデバッグ計測を実行する。
2. 計測結果のZIPをiPhoneへ保存する。
3. ZIPを共有シートからログ保存ショートカットへ渡す。
4. ショートカットがファイル名からバージョンとRun番号を取得する。
5. GitHubへZIPを自動アップロードする。
6. GitHub Actionsが自動的にZIPを展開する。
7. 展開されたCSVがGitHubへコミットされる。
8. 必要に応じてGitHub上の展開済みCSVをChatGPTから取得して解析する。

成功時には、GitHub APIレスポンス内の `path` が例えば次のようになります。

```text
log/v1.36.0/run7.zip
```

## 5. GitHub Actionsによる自動展開

ZIPのアップロード後、以下のWorkflowが自動実行されます。

```text
.github/workflows/extract-measurement-logs.yml
```

通常のZIPアップロードでは、今回のGit pushで追加されたZIPを特定し、そのZIPだけを処理します。

処理の流れ：

```text
ZIPのpush
    ↓
今回追加されたZIPを特定
    ↓
ZIPの保存先からバージョンフォルダを取得
    ↓
ZIPをそのバージョンフォルダへ展開
    ↓
ZIP内部のフォルダ構造を維持
    ↓
展開されたCSVをGitへcommit
```

例えば、

```text
log/v1.36.0/run7.zip
```

のZIP内部が、

```text
run7/
├── metadata.csv
└── ...
```

の場合、展開後は、

```text
log/v1.36.0/run7/
├── metadata.csv
└── ...
```

となります。

### 重要：二重フォルダを作らない

ZIP内部にすでにRun番号のフォルダが存在するため、Workflow側でさらにRun番号のフォルダを作成しません。

正：

```text
log/v1.36.0/run7/
├── metadata.csv
└── ...
```

誤：

```text
log/v1.36.0/run7/run7/
├── metadata.csv
└── ...
```

バージョン番号やRun番号はWorkflowにハードコードしません。

## 6. ChatGPTによるログ解析

解析時は、ZIPをChatGPTへ直接アップロードするのではなく、GitHub Actionsによって展開されたCSVを使用します。

例：

```text
log/v1.36.0/run7/metadata.csv
```

ChatGPTからGitHub上の展開済みCSVを直接取得して解析できます。

複数Runを比較する場合は、各RunのCSVを取得します。

例：

```text
log/v1.36.0/run1/
log/v1.36.0/run2/
log/v1.36.0/run3/
log/v1.36.0/run7/
```

この方式により、複数回の物理検証結果を比較・集計できます。

ZIPは原本としてGitHubに保持し、展開済みCSVを解析用データとして扱います。

## 7. コミットメッセージ

ZIPアップロード時のコミットメッセージは次の形式に統一します。

```text
Upload measurement log <バージョン> <Run番号>
```

例：

```text
Upload measurement log v1.36.0 run7
```

GitHub Actionsによる展開時のコミットメッセージは、

```text
Extract measurement log ZIP
```

とします。

## 8. Run番号について

Run番号はショートカットが自動採番するのではなく、入力ZIPのファイル名に含まれるRun番号をそのまま使用します。

そのため、次の計測を行う際はファイル名のRun番号を適切に設定してください。

## 9. バージョンが変わった場合

ゲームのバージョンが変わっても、ショートカット自体のURLを変更する必要はありません。

例えば、

```text
JinSanTowerGame_v1.37.0_run1_diagnostics.zip
```

を入力すると、

```text
log/v1.37.0/run1.zip
```

へ保存され、GitHub Actionsによって対応するCSVが展開されます。

## 10. ピース追加との関係

このログアップロード・展開方式は、現在のピース数には依存しません。

計測対象のピースが追加・削除されても、アップロード処理やGitHub Actions側でピース数をハードコードしません。

アップロード単位はあくまで「1回の計測で生成されたZIPファイル」です。

## 11. 認証情報について

GitHub APIへのPUTにはPersonal Access Tokenを使用します。

ショートカット内のAuthorizationヘッダーに設定するトークンは、以下のように扱います。

- リポジトリへコミットしない
- README等へ記載しない
- チャットやスクリーンショットに表示しない
- 不要になったトークンはGitHub側で失効させる
- トークンの期限切れ・権限変更時はショートカット側のAuthorization設定を更新する

トークンそのものはこのドキュメントでは管理しません。

## 12. 現在の検証済みログ

v1.36.0では、以下のZIPアップロードと自動展開を確認済みです。

```text
log/v1.36.0/run1.zip
log/v1.36.0/run2.zip
log/v1.36.0/run3.zip
log/v1.36.0/run4.zip
log/v1.36.0/run5.zip
log/v1.36.0/run6.zip
log/v1.36.0/run7.zip
```

`run6` では、修正後の展開処理によって正しい階層構造になることを確認しています。

`run7` では、本番版Workflowによって「今回追加されたZIPだけを特定して展開する」処理が正常に動作し、以下の構造になっています。

```text
log/v1.36.0/run7.zip
log/v1.36.0/run7/
├── metadata.csv
└── ...
```

また、以下のCSVをGitHubからChatGPTが直接取得できることも確認済みです。

```text
log/v1.36.0/run7/metadata.csv
```

## 13. 変更時の注意

ショートカットまたはGitHub Actionsの仕様を変更した場合は、このREADMEも同時に更新してください。

特に以下を変更した場合は更新対象です。

- 入力ファイルの命名規則
- バージョン・Run番号の抽出方法
- GitHub保存先
- ブランチ
- APIリクエスト形式
- Base64エンコード設定
- 認証方式
- ZIP展開方式
- ChatGPTからのログ取得・解析方法
