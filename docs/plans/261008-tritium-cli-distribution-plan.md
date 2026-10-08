# tritium_cli: 改名、配布物への同梱、GUI の自動起動

**状態: 実装済み**。仕様は [`../architecture/local-api-server.md`](../architecture/local-api-server.md) §5。
実装時に計画から変えた点と、同じ PR で足したものは末尾の「実装時の変更と追加」に書く。

## Context
- #657 で入れた console の thin client `tools/cuemol-console.mjs` は repo からしか起動できない。
  既に C++ の CLI `cuetty` (`cli/`) があるので、名前を **`tritium_cli`** に変える。
- 配布物 (mac dmg / Windows NSIS / Linux AppImage・deb) に同梱し、インストールしただけで使えるようにする。
- `tritium_cli` を起動したときに GUI が動いていなければ、`tritium_cli` が GUI を起動して自動で接続する。
- ユーザーが決めたこと:
  - **PATH**: installer は変えない。Console の Settings ページに wrapper のフルパスと PATH への追加例を表示して、コピーできるようにする。deb だけは `/usr/bin/tritium_cli` の symlink を張る。
  - **起動した GUI の寿命**: detached で起動し、CLI を終了しても GUI は残す。
  - **アクセス**: CLI が起動した GUI、または起動中で Command line access が off の GUI では、設定を変えずに、その起動中だけ console endpoint を開く。
  - **Console plugin は既定で on** にする。

## 方式
- **実行**: app 内の wrapper が、app 自身の Electron 実行ファイルを `ELECTRON_RUN_AS_NODE=1` で Node として動かし、`tritium_cli.mjs` を実行する。
  - VS Code の `code` コマンドと同じ方式。
  - Electron fuse は設定していないので、RunAsNode は有効。無効にしないことを electron-builder.yml のコメントで明記する。
- **GUI の位置**: wrapper から起動された CLI では、`process.execPath` が GUI の実行ファイルそのものになる。自動起動にはこれを使う。

## 実装

### 1. 改名
- 名前を変える:
  - `tools/cuemol-console.mjs` → `tools/tritium_cli.mjs` (`git mv`)
  - 履歴ファイル `~/.cuemol_console_history` → `~/.tritium_cli_history`
  - USAGE とメッセージの中の名前
- 参照も新しい名前にする:
  - `src/main/localApi/consoleEndpoint.test.ts` の import
  - コメントに出てくる名前 (`consoleEndpoint.ts`、`useConsoleEndpoint.ts`、`consoleTypes.ts`、`shared/types/localApi.ts`)
  - console の manifest の setting の説明文

### 2. GUI の自動起動 (`tools/tritium_cli.mjs`)
- **起動する条件**: 接続できない場合 (情報ファイルが無い、`console` endpoint が無い、接続拒否) は、request の前に `ensureApp()` で GUI を起動する。
  - 起動するのは `process.env.ELECTRON_RUN_AS_NODE` があるとき (= wrapper 経由) だけ。
  - repo から node で起動した場合は、今と同じく案内を出して終了する。
- **spawn**:
  - `spawn(process.execPath, ['--tritium-cli'], { detached: true, stdio: 'ignore', env: <ELECTRON_RUN_AS_NODE を除いた env> }).unref()`
  - stderr に `Starting CueMol3...` を出す。
- **待ち方**:
  - 情報ファイルを 300 ms ごとに読み、`endpoints` に `console` が入るまで待つ。worker の初期化が終わってから endpoint が開くので、これが準備完了の合図になる。
  - 上限は 90 秒。超えたら「CueMol3 started but command line access did not open (is the Console plugin disabled?)」と出して exit 1。
- **既に動いている GUI** (access が off の場合): spawn した 2 個目のプロセスは single-instance lock で即終了する。argv は既存の GUI に渡るので、経路は 1 つで済む。
- **対象**: 対話モードと `-c` / script / stdin のすべて。`--no-launch` で起動しないようにできる (script 用)。

### 3. main / renderer: `--tritium-cli` で、その起動中だけ endpoint を開く
- **main** (`src/main/index.ts`, `src/main/localApi/index.ts`):
  - `process.argv`、または `second-instance` の argv に `--tritium-cli` があれば、`cliAccessRequested = true` にする (戻すことはしない)。
  - `LocalApiStatus` に `cliRequested: boolean` を足す。
  - 値が変わったら、新しい push `LOCAL_API_STATUS_CHANGED` で status を送る (`ipcChannels.ts` / `ipcContract.ts`)。
  - `second-instance` は既存のコードが window を前に出す。
  - `parseFileArgs` は `-` で始まる引数を無視するので、ファイルとして扱われることはない。
- **renderer**:
  - `plugin-host/localApi.ts` の `useLocalApiStatus` が push を購読する。
  - `useConsoleEndpoint.ts` の enabled 条件を `cm !== null && (prefs[REMOTE_ACCESS_PREF] === true || status?.cliRequested === true)` に変える。
- **Console plugin の既定**: `plugins/console/manifest.ts` を `defaultEnabled: true` にする (コメントも直す)。
  - 一度 on/off を選んだユーザーは `choices` の値のまま (`pluginSelect.ts:48`)。
  - 既定値を固定しているテストがあれば追随させる。

### 4. 同梱 (`electron-builder.yml`)
- **wrapper を新規に作る**:
  - `tools/tritium_cli` (sh)
    - `$0` の symlink を readlink のループで解決する (`/usr/bin` や `~/bin` からの symlink に対応するため)。
    - そこから `<resources>/cli` を求め、OS ごとの実行ファイルを `ELECTRON_RUN_AS_NODE=1` で exec する。
      - Darwin: `../../MacOS/CueMol3`
      - Linux: `../../<executableName>`。名前は `release/linux-unpacked` で確かめて固定する。
  - `tools/tritium_cli.cmd`
    - 内容: `@echo off` / `setlocal` / `set ELECTRON_RUN_AS_NODE=1` / `"%~dp0..\..\CueMol3.exe" "%~dp0tritium_cli.mjs" %*`
- **配置**: `extraResources` に `from: tools`、`to: cli`、filter `tritium_cli*` を追加する。
  - 置き場所: `Contents/Resources/cli/` (mac)、`resources\cli\` (Windows)、`/opt/CueMol3/resources/cli/` (deb)。
  - sh の実行ビットが残ることを unpacked で確かめる。
- **deb**: `linux.deb.afterInstall` / `afterRemove` を `build/linux/` に置く。
  - stock の `after-install.tpl` / `after-remove.tpl` (app-builder-lib の templates/linux) の中身を引き継いだうえで、`/usr/bin/tritium_cli` の symlink を張る / 消す行を足す。
- **AppImage**: resources は起動のたびに一時 mount されるので対象外。Settings にもそう表示する。
- **mac**: afterPack の deep ad-hoc codesign の対象に入る。追加の設定はいらない。

### 5. Settings の表示 (Console のページ)
- `AppPathInfo` に `cliPath` を足す (`shared/types/appPath.ts`、`main/handlers/appPath.ts`)。
  - 値は `<resourcesPath>/cli/tritium_cli` (Windows は `.cmd`)。
  - 開発ビルドは repo の `tools/tritium_cli.mjs`、AppImage (`process.env.APPIMAGE`) は `''`。
- 設定行は、statusBar と同じ「manifest で宣言して component は plugin が持つ」形で足す。
  - plugin-host の `PluginSettingControl` に `{ kind: 'custom' }` を足す。
  - `RendererPlugin.settingRows: { [key]: Component }`。
  - 型、definePlugin の検証、Settings の描画、`contributions.md` を更新する。
- Console に行「Command line tool」を足す。
  - 中身: read-only の mono `TextField` にパス、`FormButton` の Copy、OS ごとの例を 1 行。
    - mac/Linux: `ln -s "<path>" ~/bin/tritium_cli`
    - Windows: `<resources>\cli` を PATH に足す
  - 部品は form-kit のものを使う。

## ドキュメント
- 計画: `docs/plans/261008-tritium-cli-distribution-plan.md` (本計画) と `docs/plans/_index.md` の行。
- `docs/architecture/local-api-server.md`:
  - §5 を名前と同梱、自動起動、`--tritium-cli` に合わせて更新する。
  - §6 の「配布物に入っていない」を消す。
- `docs/architecture/op-catalog.md` §5 と `docs/architecture/tritium_plugin/contributions.md` (custom の setting 行)。
- release note は、次のリリースのときに書く。

## テスト (最小集合)
- 既存の `consoleEndpoint.test.ts`: import 先の変更だけ。
- CLI の自動起動を 1 件 (`tools/tritium_cli.mjs` から `ensureApp` を export して、spawn を注入できるようにする):
  - 情報ファイルが無ければ、`--tritium-cli` を付けて `execPath` を起動する。その後、ファイルに `console` が現れたら resolve する。
  - `ELECTRON_RUN_AS_NODE` が無いときは起動せずに reject する。
- main: argv の `--tritium-cli` で status が `cliRequested: true` になり、push されることを 1 件 (`shellOpenLifecycle.test.ts` の second-instance の形に倣う)。

## 検証
1. `cd /Users/user1/proj64/cuemol2_work2/build_scripts && task build_tritium` → `task run_tritium` (起動マーカーを確認)。
2. 開発ビルドで確かめること:
   - Console plugin が既定で on になっている。
   - Settings に Command line tool の行が出る。
   - `node tools/tritium_cli.mjs` が今までどおり動く。
3. mac をパッケージして確かめること (`pnpm run package:mac`, または `package:dir`):
   - `.../CueMol3.app/Contents/Resources/cli/tritium_cli` に実行ビットがある。
   - GUI が停止中: 対話を起動すると GUI が起動し、自動で接続される。CLI を exit しても GUI は残る。
   - 起動中で access が off: `tritium_cli -c "pwd"` が通り、Settings の値は off のまま。
   - Settings に出たパスで symlink を張り、PATH から起動できる。
4. Windows / Linux:
   - CI の installer を手元で確かめる。
   - Windows は `.cmd` で、対話 (readline) と Ctrl-C が GUI subsystem の exe でも動くかを確かめる。これが最大の未確認点。対話が駄目なら `-c` / script だけを docs に書く案に落とす。
   - deb は `/usr/bin/tritium_cli` を確かめる。
5. 確定後: `npm test`、`tsc` (web / node)、ESLint、`task lint_tritium_style`。

## 範囲外 (別計画)
- console / MCP からのタブ操作 (新しい空 scene のタブ、タブの一覧・切り替え、タブを閉じる)。

## 主に触るファイル
- 改名と新規:
  - `tritium/react-gui/tools/tritium_cli.mjs`
  - `tools/tritium_cli`、`tools/tritium_cli.cmd`
  - `build/linux/after-install.sh`、`build/linux/after-remove.sh`
- 変更:
  - `tritium/react-gui/electron-builder.yml`
  - `src/main/index.ts`、`src/main/localApi/index.ts`、`src/main/handlers/appPath.ts`
  - `src/shared/{ipcChannels,ipcContract}.ts`、`src/shared/types/{localApi,appPath}.ts`
  - `src/renderer/plugin-host/{localApi,types,definePlugin}.ts` と Settings の plugin ページ
  - `src/plugins/console/{manifest.ts,index.ts,renderer/useConsoleEndpoint.ts,renderer/CliPathRow.tsx}`

## 実装時の変更と追加

- **wrapper**: `tools/` に固定ファイルとして置く案をやめ、afterPack hook (`build/cliWrapper.js`) が
  生成する。Linux の実行ファイル名 (`packager.executableName`、`@cuemolreact-gui`) は packager が
  決めるため。deb の template は `build/linux/after-install.tpl` / `after-remove.tpl`。
- **access の伝え方**: `LocalApiStatus.cliRequested` ではなく、専用の invoke
  `LOCAL_API_CLI_ACCESS` と push `LOCAL_API_CLI_ACCESS_GRANTED` (renderer `useCliAccessGranted()`)。
- **CLI の見た目**: 起動時の banner (`/console/info` で version を取得)、色付きの prompt
  `CueMol <dir> ❯`、spinner と経過秒、遅いコマンドの所要時間。dim / 灰色は使わない。
- **scene コマンド** (「範囲外」に挙げていたタブ操作のうち console 分): `scenes` / `new_scene` /
  `switch_scene` / `close_scene`。worker が要求を返し、renderer がタブを操作してから残りを送り直す。
  plugin API `useSceneTabs()` を追加。MCP からのタブ操作は後続の PR で追加 (`list_scenes` ほか、
  `save_scene` と `.qsc` の `load_file` も MCP から使えるようにした)。
- **Tab 補完**: スペースを含む名前に届くよう、引数全体を先に試す。
- **テスト**: `ensureApp` (`consoleEndpoint.test.ts`)、scene コマンドでの submission 分割
  (`runCommand.test.ts`)、scene の指定と `force` (`sceneRequest.test.ts`)、補完 (`complete.test.ts`)。
  main の `noteCliLaunch` のテストは書いていない。
