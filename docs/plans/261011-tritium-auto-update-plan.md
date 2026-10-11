# tritium の自動更新 (コード署名なし)

**状態: macOS 分は実装済み**。仕様は [`../architecture/auto-update.md`](../architecture/auto-update.md)。
Windows と Linux (§3.3、§4 の Phase 3・4) は未実装。実装で計画から変えた点は末尾の「実装時の変更」に書く。

## Context
- tritium (CueMol3) には更新の仕組みが無い。新しい版を使うには、ユーザーが GitHub Releases から
  DMG / Setup.exe / AppImage を取り直すしかない。
- 配布物は署名していない (mac は ad-hoc 署名で Team ID なし、Windows は Authenticode なし)。
  [`../architecture/tritium-packaging-renovation.md`](../architecture/tritium-packaging-renovation.md)
  の Phase 4-4 は「署名後に electron-updater」で、「未署名の自動更新は無意味」としていた。
- electron-updater をそのまま入れられない理由:
  - **mac**: Squirrel.Mac は、更新後の app の署名が今の app の designated requirement を満たすかを検証する。
    ad-hoc 署名の requirement は build ごとの cdhash なので、毎回失敗する。
  - **バージョン**: electron-builder に渡しているのは semver 部分 (`2.3.21`) だけで、build 番号は
    `buildVersion` に分けている。build 番号だけ上げたリリース (`.544` -> `.545`) を更新として検出できない。
  - **成果物**: `publish:` が無く、`latest*.yml`・blockmap・mac の zip を作っていない。
- そこで、electron-updater は使わず、**GitHub Releases API を見て自前で取得・置換する updater** を main process に作る。

## 1. 方針
- **更新の確認**: `https://api.github.com/repos/CueMol/cuemol2/releases/latest` (repo は public なので token 不要)。
  - `tag_name` (`v2.3.21.544`) と、インストール版の 4 桁バージョンを数値で比較する。
  - `releases/latest` は draft と prerelease を返さない。
- **成果物の選び方**: asset 名で選ぶ (ADR-0056 の命名)。
  - mac: `^CueMol3-.*-macOS-arm64-Installer\.dmg$`
  - Windows: `^CueMol3-.*-Windows-x64-Setup\.exe$`
  - Linux: `^CueMol3-.*-Linux-x64\.AppImage$`
  - 目的の asset がまだ無い場合 (mac と Linux の workflow が別々に添付するので、片方だけ先に出ている間) は
    「更新なし」として扱う。
- **改ざん検知**: 署名の代わりに、API が返す asset の `digest` (`sha256:...`) とダウンロードした
  ファイルの SHA-256 を照合する。通信は HTTPS だけ。信頼の根拠は「GitHub の CueMol/cuemol2 の release」で、
  手でダウンロードする場合と同じ。
- **ダウンロードの経路**: main process の Node (`fetch` / `https`) で取得する。
  - Electron の `session.downloadURL` / `DownloadItem` は使わない。Chromium のダウンロード経路は
    mac で `com.apple.quarantine`、Windows で `Zone.Identifier` (Mark of the Web) を付ける。
    Node で書いたファイルにはどちらも付かないので、Gatekeeper / SmartScreen の判定対象にならない。
- **CI とリリース手順は変えない**: asset と `digest` は今の release にもう揃っている。
- **将来署名したとき**: この方式はそのまま動く。electron-updater (差分更新つき) に移るかは、そのとき決める。

## 2. macOS の実機検証 (2026-10-11)
環境: macOS 26.5.2、admin ユーザー。`/Applications/CueMol3.app` は 2.3.20.539 (ad-hoc 署名、Team ID なし)。

アプリを改造せずに確かめるため、`open -n --env ELECTRON_RUN_AS_NODE=1 -a /Applications/CueMol3.app --args spike.mjs`
で、CueMol3 本体のバイナリを Node として動かした (LaunchServices 経由の起動なので、responsible process は
Terminal ではなく CueMol3 になる)。スクリプトは次を行った:
1. releases API で最新版を判定 (2.3.20.539 < 2.3.21.544)
2. Node の `fetch` で DMG (208 MB) を取得し、`digest` と照合
3. `hdiutil attach -nobrowse -readonly`
4. 切り離した (detached) ヘルパー sh を起動して自分は終了
5. ヘルパーが親の終了を待ち、`mv` で旧 app を退避し、`ditto` で新 app をコピーして、`open` で起動

| 項目 | 結果 |
|---|---|
| ダウンロード | 約 58 秒、SHA-256 一致 |
| ダウンロードした DMG の xattr | 空 (quarantine なし) |
| `mv` + `ditto` による置換 | 成功。**App Management (アプリケーション管理) のダイアログもブロックも無し** |
| 置換後の app | 2.3.21.544、quarantine なし、ad-hoc 署名、`codesign --verify --deep --strict` OK |
| 起動 | Gatekeeper の警告なし (`spctl -a` は rejected だが、quarantine が無いので起動時に評価されない) |
| TCC | 更新後も Documents のファイルを許可の再確認なしで開けた |
| 自動再起動 | ヘルパーの `open` では起動しなかった。ヘルパーが `ELECTRON_RUN_AS_NODE=1` を引き継いだためと見られる (実験の構成による問題)。本実装では env からこの変数を外して `open` する |

未検証: 標準ユーザー (`/Applications` に書けない)、Intel mac (配布していない)、App Translocation 下の起動。

## 3. 設計

### 3.1 インストール版のバージョン
- `app.getVersion()` は 3 桁 (`2.3.21`) なので比較に使えない。
- `tritium/packaging/package.sh` の electron-builder 呼び出しに
  `--config.extraMetadata.cuemolVersion="$QM_VERSION"` を足し、app の `package.json` に 4 桁版を入れる。
  main は `app.getAppPath()` の `package.json` から読む。
- dev 起動 (`app.isPackaged === false`) では updater を無効にする。

### 3.2 更新の流れ (全 OS 共通)
1. **確認**:
   - 起動 30 秒後に 1 回 (前回の確認から 24 時間以内なら省略)。
   - Help > Check for Updates... (mac は app メニュー) から手動でも確認できる。
2. **通知**: 新しい版があれば dialog を出す。
   - 版番号と release notes (release の `body`。Markdown の表示は console help の `marked` 共通パーサを使う)。
   - ボタン: **Update** / **Later** / **Skip This Version**。
   - Skip した版は記録し、それより新しい版が出るまで自動確認では出さない。手動確認では出す。
3. **ダウンロード**:
   - 置き場所: `app.getPath('temp')/cuemol3-update/`。
   - 進捗を renderer に push する。キャンセルできるようにする。
   - SHA-256 を照合し、不一致なら破棄してエラーを出す。
4. **終了と置換**:
   - `quitApp(false)` (`src/main/appQuit.ts`) で、Cmd+Q と同じ保存確認を通して終了する。
   - 結果が `'cancelled'` なら置換しない (ダウンロード済みファイルは次回に使う)。
   - `'quit'` なら、`will-quit` で OS 別のインストーラ処理 (§3.3) を detached で起動してから終了する。
5. **起動**: 置換後に新しい版を起動する。

設定: Settings に「起動時に更新を確認する」(既定 on) を置く。値と Skip した版は main の
`stateStore` に持つ。

### 3.3 OS 別のインストール
**macOS (DMG、§2 で検証済み)**
- **置換先**: `process.execPath` から `.app` のパスを求める (`/Applications` 以外に置いた app にも対応する)。
- **ヘルパー sh**: 引数は親 PID、マウント先、app パス。手順:
  1. 親の終了を待つ
  2. 旧 app を同じボリュームに `mv` で退避
  3. `ditto` で新 app をコピー
  4. 失敗したら退避した旧 app を戻す
  5. 旧 app を削除し、`hdiutil detach` する
  6. `env -u ELECTRON_RUN_AS_NODE open <app>` で新しい版を起動する
- **書き込めない場合** (標準ユーザー): app の親ディレクトリに書けなければ in-place 更新はしない。
  DMG を Finder で開いて (`shell.openPath`) 手動で入れ替えるよう案内する。
  `osascript ... with administrator privileges` による昇格は後回し。
- **App Translocation**: quarantine 付きの app を移動せずに起動した場合、`execPath` は
  `/private/var/folders/.../AppTranslocation/` の下になる。この場合も in-place 更新はせず、案内だけにする。

**Windows (NSIS、perMachine)**
- `perMachine: true` は変えない (インストール先とレジストリは HKLM のまま)。そのため更新のたびに
  UAC の確認が出る。発行元は「不明」と表示される。
- **起動方法**: Setup.exe を昇格して silent で起動し、app は終了する。
  - 例: `powershell -NoProfile -Command Start-Process -Verb RunAs -FilePath <setup> -ArgumentList '/S','--updated','--force-run'`
  - 引数を渡したいので、`shell.openPath` ではなく `Start-Process -Verb RunAs` を使う。
  - electron-builder の NSIS は、silent でも前回のインストール先 (レジストリの InstallLocation) を使う。
    app の終了も待つ (CHECK_APP_RUNNING)。
- **UAC を拒否された場合**: インストーラが起動しないので、app は終了せずにエラーを出す。
  そのため、Start-Process の終了コードを見てから `quitApp` する。
- **SmartScreen**: Node で取得したファイルには MOTW が付かないので出ない見込み。§4 の spike で確認する。
- **未検証**。§4 の Windows spike で確かめてから実装する。

**Linux**
- **AppImage** (`process.env.APPIMAGE` があるとき):
  - 新しい AppImage を同じディレクトリに一時名でダウンロードし、`chmod +x` して `rename` で置き換える
    (同じファイルシステム内なので atomic)。そのあと `spawn(APPIMAGE, { detached })` で起動して終了する。
  - ディレクトリに書けない場合は、ダウンロード先を案内するだけにする。
- **deb**: 通知だけにする。ダウンロードページ (release の `html_url`) を開く。apt リポジトリは対象外。

### 3.4 コードの置き場所
- `src/main/updater/` に置く:
  - `updateCheck.ts` (API 取得・4 桁比較・asset 選択)
  - `updateDownload.ts` (取得・digest 照合・進捗)
  - `installMac.ts` / `installWin.ts` / `installLinux.ts`
  - `index.ts` (`initUpdater()`、`src/main/index.ts` の `whenReady` で `createWindow()` の後に呼ぶ。
    条件は `app.isPackaged && gotSingleInstanceLock`)
- mac のヘルパー sh は、ファイルとして同梱しない。実行時に temp に書き出す。
- **IPC**: `shared/ipcChannels.ts` と `shared/ipcContract.ts` に行を足し、`main/handlers/updater.ts` で登録する。
  - invoke: `update:check`、`update:download`、`update:install`、`update:cancel`
  - push: `update:status`。状態は idle / checking / available / downloading(進捗) / ready / error。
- **メニュー**: `shared/menuTemplate.ts` に `check-updates` を足す (mac は app メニュー、他は Help)。
  対応する行を `shared/menuActionMap.ts` にも足す。
- **UI**: dialog は CLAUDE.md の「新規ダイアログの追加パターン」に従う
  (`UpdateDialog.tsx` + `createDialogHook` + `CmdId.UiUpdateDialog`)。
  form-kit のカタログ部品で組み、`ui-style-guide.md` に従う。

## 4. フェーズ
各フェーズを 1 PR にし、マージしてから次に進む。

| Phase | 内容 | 前提 |
|---|---|---|
| 1 | 確認と通知 (全 OS)。4 桁版の埋め込み、`updateCheck.ts`、メニュー、dialog、設定。Update ボタンは release page を開く | なし |
| 2 | macOS の in-place 更新 (ダウンロード、置換、再起動)。書き込めない場合と Translocation の fallback | Phase 1 |
| 3 | Windows の更新 (昇格した silent install) | Windows 実機の spike: UAC、silent でのインストール先の維持、SmartScreen、`--force-run` による再起動 |
| 4 | Linux AppImage の自己置換 (deb は Phase 1 の通知のまま) | Linux 実機での確認 |

## 5. テスト (最小集合)
- `updateCheck.test.ts`:
  - 4 桁比較: build 番号だけ違う版を新しいと判定する。過去にこれが原因で electron-updater を採らなかったので、ここを pin する。
  - asset 選択: OS ごとの名前の規則と、asset が無いときに「更新なし」になること。
  - `digest` の照合。
- ヘルパーの置換手順・UAC・ファイル置換は mock では意味がないので、各フェーズで実機で確認する。
  手順を PR 本文に残す。

## 6. ドキュメント
- 実装したら `docs/architecture/auto-update.md` に仕様を書き起こし、`_index.md` に 1 項目足す。
- `../architecture/tritium-packaging-renovation.md` の Phase 4-4 と「未署名の自動更新は無意味」を書き直し、
  本方式へのリンクにする。
- `../architecture/release-artifact-identity.md`: 「asset 名はリポジトリのどこからも literal 参照されていない」
  という前提が変わる。updater は asset 名の正規表現に依存するので、改名は updater との契約の変更になる、と追記する。
- `../../tritium/packaging/README.md`: 未署名配布の注意に、「初回のみ quarantine 解除が要り、以降の更新では要らない」と追記する。

## 7. リスクと残る判断
- **差分更新が無い**: 毎回全量をダウンロードする (DMG で約 208 MB)。
- **mac の判定が変わる可能性**: App Management の判定は将来の macOS で変わりうる。失敗したら手動の案内に
  fall back するので、壊れはしない。
- **Windows の UAC**: 毎回出る。silent に更新したいなら per-user インストールへの変更 (HKCU、既存ユーザーの移行)
  が要る。本計画の範囲外。
- **release の作り方の前提**: CueMol2 (`cuemol2_*.tar.bz2`) と同じ release を共有している。prerelease を出すときは、
  `releases/latest` から外れるよう prerelease フラグを付ける運用を前提にする。

## 実装時の変更 (macOS 分)
- **パッケージ**: Electron に依存しない本体を `tritium/updater` (`@cuemol/updater`) に分けた。
  `@cuemol/console-kit` と同じく TS source のまま main の bundle に入る。
- **UI**: dialog だけの案から、VS Code 風の通知 (toast / center / status bar の bell、
  `renderer/shell/notifications/`) に変えた。通知には Update と Release Page を置く。
  保留中の更新を表す通知は × を出さず、隠しても center に残す。
- **Settings の経路**: General > Updates に Check for Updates 行を足した。起動時の確認の on/off に関係なく、
  確認からダウンロード・再起動までを行の中で行い、通知は出さない。
- **起動確認つきのロールバック**: 新しい版が main window を renderer の signal で出したら marker を書き、
  ヘルパーは 120 秒待って来なければ旧版に戻す。実機で 539 版 (updater なし) への更新で戻ることを確かめた。
  staging / backup は `/Applications` ではなく userData に置く。
- **ダウンロード**: `fetch` をやめて Node の `http` / `https` にした (undici の assert が main の
  uncaught exception になった)。
- **4 桁バージョン**: package.sh が `extraMetadata.cuemolVersion` を入れる。テスト用に
  `CM_VERSION_OVERRIDE` (package.sh) と `CUEMOL_UPDATE_FEED` (main) を足した。
- **同じ PR で直したもの**:
  - local API の token を `safeStorage` から userData のファイル (0600) に移した。起動のたびの Keychain
    読み出しが、更新のたびにパスワードダイアログを出していた。
  - Settings の custom 行とパス欄の幅 (320px の上限で折り返し・切れていた)、MCP の Port 欄
    (slider をやめ、Enter / blur で反映、範囲外のエラーと実際の状態を表示)。
