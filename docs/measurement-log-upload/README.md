# 物理計測ログ GitHub アップロード運用

このドキュメントは、仁さんタワーゲームの物理計測ログを iPhone のショートカットから GitHub の `develop` ブランチへ保存するための運用仕様です。

アプリ本体の仕様・開発内容はリポジトリ直下の `README.md` で管理し、本ドキュメントでは計測ログの保存・アップロード手順だけを管理します。

## 1\. 保存先

計測ログは以下のディレクトリ構成で保存します。

```text
log/
└── <バージョン>/
    ├── run1.zip
    ├── run2.zip
    ├── run3.zip
    └── ...
```

例：

```text
log/v1.36.0/run1.zip
log/v1.36.0/run2.zip
log/v1.36.0/run3.zip
```

GitHub API の保存先は次の形式です。

```text
https://api.github.com/repos/shun-1016/JinSanTowerGame/contents/log/<バージョン>/<Run番号>.zip
```

ブランチは `develop` を使用します。

## 2\. 入力ファイルの命名規則

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

|インデックス|値              |用途     |
|------|---------------|-------|
|1     |JinSanTowerGame|固定のゲーム名|
|2     |v1.36.0        |バージョン  |
|3     |run1           |Run番号  |
|4     |diagnostics.zip|補助情報   |

したがって、バージョンやRun番号をショートカットへ直接入力する必要はありません。

## 3\. iPhoneショートカットの処理

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
GitHubへ保存
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

Content\-Type：

```text
application/json
```

Base64の行区切りは\*\*「なし」\*\*にします。

## 4\. 通常のアップロード手順

1. ゲームのデバッグ計測を実行する。
2. 計測結果のZIPをiPhoneへ保存する。
3. ZIPを共有シートから「GitHubログ保存」ショートカットへ渡す。
4. ショートカットがファイル名からバージョンとRun番号を取得する。
5. GitHubへ自動アップロードする。
6. 最後にGitHub APIのレスポンスを確認する。

成功時には、レスポンス内の `path` が例えば次のようになります。

```text
log/v1.36.0/run3.zip
```

## 5\. コミットメッセージ

コミットメッセージは次の形式に統一します。

```text
Upload measurement log <バージョン> <Run番号>
```

例：

```text
Upload measurement log v1.36.0 run3
```

バージョンとRun番号は入力ファイル名から自動取得します。

## 6\. Run番号について

Run番号はショートカットが自動採番するのではなく、入力ZIPのファイル名に含まれるRun番号をそのまま使用します。

そのため、次の計測を行う際はファイル名のRun番号を適切に設定してください。

例：

```text
JinSanTowerGame_v1.36.0_run4_diagnostics.zip
```

とすれば、自動的に

```text
log/v1.36.0/run4.zip
```

へ保存されます。

## 7\. バージョンが変わった場合

ゲームのバージョンが変わっても、ショートカット自体のURLを変更する必要はありません。

例えば、

```text
JinSanTowerGame_v1.37.0_run1_diagnostics.zip
```

を入力すると、

```text
log/v1.37.0/run1.zip
```

へ保存されます。

## 8\. ピース追加との関係

このアップロード方式は、現在のピース数には依存しません。

計測対象のピースが追加・削除されても、アップロード処理側ではピース数をハードコードしません。

アップロード単位はあくまで「1回の計測で生成されたZIPファイル」です。

## 9\. 認証情報について

GitHub APIへのPUTにはPersonal Access Tokenを使用します。

ショートカット内のAuthorizationヘッダーに設定するトークンは、以下のように扱います。

- リポジトリへコミットしない
- README等へ記載しない
- チャットやスクリーンショットに表示しない
- 不要になったトークンはGitHub側で失効させる
- トークンの期限切れ・権限変更時はショートカット側のAuthorization設定を更新する

トークンそのものはこのドキュメントでは管理しません。

## 10\. 現在の検証済みログ

v1\.36\.0では、以下のアップロードに成功しています。

```text
log/v1.36.0/run1.zip
log/v1.36.0/run2.zip
log/v1.36.0/run3.zip
```

この3件で、ファイル名からバージョン・Run番号を取得し、GitHubの保存先を自動生成する方式が正常に動作することを確認済みです。

## 11\. 変更時の注意

ショートカットの仕様を変更した場合は、このREADMEも同時に更新してください。

特に以下を変更した場合は更新対象です。

- 入力ファイルの命名規則
- バージョン・Run番号の抽出方法
- GitHub保存先
- ブランチ
- APIリクエスト形式
- Base64エンコード設定
- 認証方式
