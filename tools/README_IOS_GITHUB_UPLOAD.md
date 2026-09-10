# iPhone向け 計測ログ → GitHub 半自動アップロード

v1.36.0 は Windows / PowerShell / GitHub CLI を使用しません。
ゲームは計測終了時にZIPを生成し、iPhoneの共有シートへ直接渡せます。

## 推奨フロー

1. `?debug=on` でゲームを開く。
2. 「全ピース自動計測」を実行。
3. 計測完了後、「ZIPを共有（iPhone）」を押す。
4. iOS共有シートから、後述の「GitHubログ保存」ショートカットを選ぶ。
5. ショートカットがZIPを `develop/log/<version>/runN.zip` に保存する。
6. GitHub上のZIPをChatGPT側で取得して解析する。

ZIPを展開する必要はありません。

## GitHub認証について

ゲーム本体にはGitHubトークンを保存しません。
GitHubへの書き込みはiOSショートカット側で行います。

推奨するGitHub認証は、対象リポジトリだけにContents: Read and writeを許可したFine-grained Personal Access Tokenです。
トークンはゲームのJavaScriptへ記載しないでください。

## ショートカットの構成

ショートカット名：`GitHubログ保存`

共有シートから「ファイル」を受け取る設定にします。

概念的には次の処理です。

1. 共有入力をファイルとして受け取る。
2. ファイル名から `v1.36.0` と `run1` を取得する。
3. ファイルをBase64へエンコードする。
4. GitHub Contents APIへPUTする。
5. URL:
   `https://api.github.com/repos/shun-1016/JinSanTowerGame/contents/log/<version>/run<run>.zip`
6. リクエストJSON:
   - `message`: `Upload measurement log <version> run<run>`
   - `content`: Base64化したZIP
   - `branch`: `develop`

### 初回設定時の注意

同じRun番号を上書きしたい場合、GitHub Contents APIでは既存ファイルのSHAが必要です。
最初の検証ではRun番号を重複させず `run1`, `run2`, `run3` と順番に保存する運用を推奨します。
上書き対応が必要になったら、GETで既存ファイルのSHAを取得してPUTへ渡す処理を追加できます。

## 重要

- GitHub Pages上のゲームからGitHubへ直接トークンを送る方式にはしません。
- ZIPはGitHub上でも展開せず、そのまま保存します。
- Gitの作業ツリーをiPhone上で操作する必要はありません。
- PCは不要です。
