# 計測ログ自動アップロード

v1.36.0では、計測終了時にZIPを自動ダウンロードします。
このフォルダの `LogAutoUpload.ps1` をWindows PCで起動しておくと、Downloadsに生成された計測ZIPを検知し、GitHubへ自動保存できます。

## 1. 初回だけ必要な準備

1. Windowsに GitHub CLI (`gh`) をインストールする。
2. PowerShellで以下を1回実行してGitHub認証する。

```powershell
gh auth login
```

3. このリポジトリのGitHubアカウントで認証されていることを確認する。

```powershell
gh auth status
```

## 2. 自動アップロードを開始

PowerShellで `LogAutoUpload.ps1` を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\LogAutoUpload.ps1
```

別の場所にスクリプトを置く場合は、リポジトリを引数で指定できます。

```powershell
powershell -ExecutionPolicy Bypass -File .\LogAutoUpload.ps1 -Repository "shun-1016/JinSanTowerGame" -Branch "develop"
```

このPowerShell画面は、計測を行っている間は起動したままにします。
終了は `Ctrl+C` です。

## 3. 実験時の操作

ゲーム側では従来どおり `?debug=on` を開いて「全ピース自動計測」を実行します。

計測終了時に、例えば次のファイルがDownloadsへ自動保存されます。

`JinSanTowerGame_v1.36.0_run1_diagnostics.zip`

監視スクリプトがこれを検知し、自動的に次へ保存します。

`develop/log/v1.36.0/run1.zip`

Run 2なら `run2.zip`、Run 3なら `run3.zip` です。
同じRun番号を再実行した場合は、GitHub上の同じZIPを更新します。

## 4. 重要な注意

- GitHubの認証情報をゲーム本体へ埋め込んでいません。
- `gh` がPC側で保持する認証を利用するため、Personal Access TokenをJavaScriptへ書く必要はありません。
- ログZIPはGitの作業ツリーへコピーせず、GitHub Contents APIへ直接アップロードします。
- 現在の保存先は `develop/log/<version>/runN.zip` です。
- v1.36.0以降の同じ命名規則のZIPにも対応できるよう、バージョン番号はスクリプト側で自動認識します。
