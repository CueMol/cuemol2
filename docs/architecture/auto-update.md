# アプリの自動更新 (署名なし、macOS)

tritium (CueMol3) が GitHub Releases から新しい版を見つけ、自分で取得・置換して再起動する仕組み。
コード署名なし (ad-hoc 署名) で動く。現状は **macOS arm64 の packaged ビルドだけ**が対象で、
Windows / Linux は計画のみ ([`../plans/261011-tritium-auto-update-plan.md`](../plans/261011-tritium-auto-update-plan.md))。

## 1. electron-updater を使わない理由

- **mac**: Squirrel.Mac は更新後の app の署名が今の app の designated requirement を満たすか検証する。
  ad-hoc 署名の requirement は build ごとの cdhash なので、毎回失敗する。
- **バージョン**: electron-builder に渡しているのは semver 部分 (`2.3.21`) だけ。build 番号だけを
  上げたリリース (`.544` -> `.545`) を更新として検出できない。

代わりに、main process が GitHub Releases API を見て、自前で取得・照合・置換する。

## 2. 構成

| 場所 | 役割 |
|---|---|
| `tritium/updater/` (`@cuemol/updater`) | Electron に依存しない本体。TS source のまま main の bundle に入る (react-gui の devDependency なので electron-vite が inline する)。Vitest は既定の node 環境 |
| `src/main/updater/index.ts` | Electron との接続。controller の生成、IPC、起動時の確認、終了時のヘルパー起動、結果の受け取り |
| `src/renderer/features/update/` | 通知 (`UpdateBridge`)、確認 dialog、展開の modal 進捗、Settings の行 (`UpdateCheckRow`) |
| `src/renderer/shell/notifications/` | VS Code 風の通知 (toast / center / status bar の bell)。更新以外にも使える汎用の機構 |

`@cuemol/updater` の中身:
- `version.ts`: 4 桁バージョンの parse / compare。build 番号だけ違う版も新しいと判定する
- `release.ts`: releases API の取得と、asset 名による選択 (mac: `^CueMol3-.*-macOS-arm64-Installer\.dmg$`)。
  asset が無い、または `digest` が無ければ「更新なし」
- `download.ts`: Node の `http` / `https` で取得し (リダイレクトを追う)、SHA-256 を API の `digest` と照合する
- `controller.ts`: 状態遷移 (§3)。OS 固有の処理は `Installer` interface
- `handoff.ts`: 旧 app・ヘルパー・新 app の間で受け渡すファイル
- `mac/installerMac.ts`、`mac/swapScript.ts`: DMG の展開とヘルパー sh

## 3. 状態遷移

`idle -> checking -> available -> downloading -> downloaded -> installing -> readyToRestart -> (終了)`、
どこからでも `error`。main は状態が変わるたびに全体を `IPC.UPDATE_STATUS` で push する
(型は `shared/types/update.ts`、`@cuemol/updater` の `UpdateStatus` と同じ形で、main で代入して tsc が照合する)。

invoke channel: `update:get-status` / `check` / `download` / `cancel` / `install` (staging への展開) /
`restart` (`quitApp(false)` で保存確認を通して終了) / `open-release` (main が知っている `html_url` だけを開く) /
`dismiss-result`。

## 4. 取得と置換 (macOS)

- **取得**: Node で書いたファイルには `com.apple.quarantine` が付かないので、Gatekeeper の判定対象にならない。
  Chromium のダウンロード経路 (`session.downloadURL`) は quarantine を付けるので使わない。
  `fetch` は使わない: 書き込みの backpressure で stream が止まっている間にサーバーが接続を閉じると、
  undici 内部の `assert(!this.paused)` が main の uncaught exception になった。
- **展開** (`installing`、app はまだ動いている): `hdiutil attach -nobrowse -readonly` -> `ditto` で
  `userData/updater/staging/CueMol3.app` へコピー (コピー先のサイズを poll して進捗にする) ->
  `codesign --verify --deep --strict` -> detach。
- **置換**: 終了直前 ('will-quit') に、ヘルパー sh を `userData/updater/swap.sh` に書き出して detached で起動する
  (bundle 内に置くと置換中に自分が動く)。`ELECTRON_RUN_AS_NODE` は env から外す。
  staging・backup は userData にあり、`/Applications` と同じ Data ボリュームなので `mv` は rename になる。
- **in-place 更新できない場合**: app の親ディレクトリに書けない (標準ユーザー) とき、App Translocation 下のとき。
  Update を出さず、Release Page だけを出す (`canInstall: false`)。

## 5. 起動確認とロールバック

Squirrel.Mac や Sparkle は置換の失敗では戻すが、置換後の起動までは見ない。ad-hoc 署名で native lib を
同梱する構成では起動の失敗が一番起こりうるので、起動確認を足している。

ヘルパーの手順 (`mac/swapScript.ts`):
1. 親 PID の終了を待つ (60 秒)
2. `mv app -> backup`、`mv staging -> app`。2 つ目が失敗したら backup を戻す
3. 新 app を `open` で起動し、`launch-ok` を待つ (120 秒。経過時間は `date +%s` で測る)
4. 現れたら backup を消して `result.json` に `ok`。現れない、または 15 秒後に process が無ければ、
   新 app を終了させ、退けて backup を戻し、`rolledBack` を書いて旧 app を起動する

新 app が `launch-ok` を書く条件: main window の reveal が **renderer の signal で**起きた
(`windows/reveal.ts` の `byFallback === false`)、かつ `pending.json` の `to` が自分の版。
書いた後に `result.json` を最大 10 秒 poll して受け取る (ヘルパーは marker を見てから結果を書くので、
起動時の読み取りでは間に合わない)。ロールバックした版は `userData/updater/rolled-back` に記録し、
起動時の自動確認では勧めない (手動確認では出す)。

## 6. UI

- **起動時の確認**: main window の reveal の 10 秒後に 1 回。Settings の
  「Check for Updates at Startup」(`UiState.updateCheck`、既定 on) で止められる。止めると確認そのものをしない。
  自動確認のエラー (オフラインなど) は表示しない。
- **通知の経路** (起動時の確認、メニューの Check for Updates): 通知に Release Page / Update。
  ダウンロード中は通知に進捗、終わると確認 dialog、OK で展開の modal 進捗、終わると自動で再起動。
  保留中の更新を表す通知は `persistent` (× なし、隠すだけ) で、bell から開く center に残る。
  メニューの Check for Updates は、隠した更新の通知を toast に戻す。
- **Settings の経路** (General > Updates の Check for Updates 行): 現在の版、状態、Check Now /
  Release Page / Update。ダウンロードの進捗、Restart and Update、再起動待ちまで行の中で進み、
  **通知は一切出さない**。Restart and Update を押すことを確認とし、確認 dialog は出さない。
  展開の modal 進捗は同じ。どちらの経路で進めているかは `features/update/updateOrigin.ts`
  (最後に操作した側)。
- **展開中** (`installing`): modal の進捗 dialog だけを出す (通知には出さない)。
- **前回の結果**: 次の起動 (更新直後はその起動中) に通知。`ok` は「X に更新しました」、
  `rolledBack` は警告と Release Page。

## 7. バージョンとテスト用の仕掛け

- `tritium/packaging/package.sh` が electron-builder に `--config.extraMetadata.cuemolVersion="$QM_VERSION"` を渡す。
  main は `app.getAppPath()` の `package.json` から 4 桁版を読む。無ければ updater は無効。
- `CM_VERSION_OVERRIDE`: package.sh が別の版を名乗るビルドを作る。
- `CUEMOL_UPDATE_FEED`: releases API の代わりに読む URL。ローカルの http server に偽の release JSON
  (`tag_name`、`html_url`、`assets[{name, browser_download_url, size, digest}]`) を置いて試す。
- dev ビルドでは updater は動かない。UI は `dev.updateSample` (args `{ state }`) で状態を作って
  `task inspect_tritium_ui` で検査する。

## 8. 既知の制約

- 差分更新は無く、毎回 DMG 全体 (約 208 MB) を取得する。
- 信頼の根拠は「GitHub の CueMol/cuemol2 の release」と HTTPS、`digest` の照合だけで、手で取得するのと同じ。
- App Management (macOS 13+) の判定は将来の macOS で変わりうる。2026-10 時点の macOS 26 では、
  ad-hoc 署名の app が自分を置換してもダイアログは出なかった。
- asset 名が updater との契約になっている ([release-artifact-identity.md](release-artifact-identity.md))。
