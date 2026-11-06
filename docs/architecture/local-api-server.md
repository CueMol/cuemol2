# Local API server と MCP (日本語)

GUI アプリ (tritium) に内蔵した HTTP server。外部のプログラムが、今開いている CueMol を
操作するための入口で、endpoint は 2 つ:

- MCP (`/mcp`) -- plugin `mcp`。AI client から op catalog を tool として呼ぶ (§3, §4)。
- console (`/console/run`, `/console/complete`, `/console/info`, `/console/lock`、`/app/quit`) -- plugin `console`。
  terminal の `tritium_cli` から console の native / PyMOL dialect を使い、app を終了する (§5)。

どちらの endpoint から来た編集も、main の**編集ロック**で client 間の排他を取る (§7)。

まだ実装していない項目は [backlog](../plans/261011-op-console-backlog-plan.md) の「MCP / agent」「console 本体」。

関連: [op catalog と console](op-catalog.md) (MCP の tool の中身)、
[plugin の API](tritium_plugin/api.md) (`useLocalApiEndpoint` など)。

## 1. 経路

```
MCP client      --POST /mcp-----------+
tritium_cli     --POST /console/*-----+--> main: localApi/server.ts (127.0.0.1:<port>)
                --POST /app/quit                 token / Origin / Host 検査、path -> endpoint
                                 localApi/mcpEndpoint.ts (MCP SDK, stateless)
                                 localApi/consoleEndpoint.ts (JSON)
                                 localApi/appEndpoint.ts (/app/quit: main だけで答える。下記 §5.4)
                                        |
                  push LOCAL_API_REQUEST {reqId, endpoint, kind, payload}
                                        v
           renderer: endpoint を持つ plugin の Root (useLocalApiEndpoint)
                                        v
           worker: plugin.mcp.{describe, listTools, callTool, cancelCall}
                   plugin.console.{runCommand, complete, cancelRun}
                                        |
                  invoke LOCAL_API_REPLY {reqId, res} -> HTTP 応答
```

- **main が持つもの**: socket、token、認証、routing、MCP の protocol。plugin は main に
  コードを置けないので、server は core にある (`src/main/localApi/`)。main は plugin の設定を
  読まない。
- **plugin が持つもの**: endpoint の意味。`useLocalApiEndpoint(endpoint, enabled, handlers)` を
  mount している間だけ endpoint が開き、request は `handlers.handle` に届く。plugin を無効に
  すると Root が unmount されて endpoint が閉じる。
- **listen するのは endpoint が 1 つ以上開いている間だけ**。全部閉じると close し、
  接続情報ファイルも消す。
- relay (`localApi/relay.ts`) の timeout は 30 分 (`render_image` が長いため)。main window が
  閉じたら待っている request を全て失敗にする。client が切断したら `kind: 'cancel'` を push し、
  plugin の `handlers.cancel(reqId)` に届く。

## 2. セキュリティ

- bind は `127.0.0.1` のみ。
- `Authorization: Bearer <token>` が一致しなければ 401 (`timingSafeEqual`)。token は
  userData の `local-api-token` (権限 0600) に保存し、無ければ `randomBytes(32)` で作る。
  popover の「Regenerate」で作り直せる。`safeStorage` (Keychain) は使わない: 同じ token を
  情報ファイル (下記、0600) に平文で書くので暗号化しても守るものが無く、起動のたびの
  Keychain 読み出しが、ad-hoc 署名の app では更新のたびにパスワードダイアログを出していた。
- `Origin` が付いていて loopback 以外なら 403、`Host` が loopback 以外でも 403
  (DNS rebinding で web ページから叩かれるのを防ぐ)。
- body は JSON 4 MB まで。
- 開いていない endpoint の path は 404。
- MCP のファイル読み書きは任意のパス (`fileAccess: 'any'`)。client は token を持つ本人の
  プログラムという前提。相対パスはデスクトップ基準で解決する (worker の cwd にしない)。

### 接続情報ファイル

listen 中は `~/.cuemol/local-api.json` (mode 0600、`CUEMOL_LOCAL_API_INFO` で場所を変更可) に
`{ port, token, pid, endpoints }` を書く。同じユーザの command line client が、port も token も
貼り付けずに接続するためのもの。close と app 終了で消す。

## 3. MCP endpoint

- Streamable HTTP の **stateless** (`sessionIdGenerator: undefined`、`enableJsonResponse: true`)。
  POST ごとに `McpServer` と transport を作るので、client ごとの状態を持たない。GET / DELETE は 405。
- tool の list / call は `McpServer` の下の protocol server に handler を直接設定する。
  `registerTool` は zod schema 前提なので使わず、catalog の `toolSchema(op)` (JSON Schema) を
  そのまま返す。
- `initialize` の `instructions` は `catalog/guide.ts` の `MCP_INSTRUCTIONS` (agent の system
  prompt と共有する tool の規則 + selection 構文の早見表)。初回に worker から取り、以後 cache。
  取れなかったとき (window の起動中など) は cache せず、次の request で取り直す。
- window への中継は endpoint 共通の `relayed()` (`main/localApi/relay.ts`) を通す。window の handler
  が throw すると `{ error }` が返るので、それを throw に変える: console は 409、MCP の
  `tools/list` は JSON-RPC error、`tools/call` は tool の結果になる。
- 失敗した `tools/call` は、どこで失敗しても (main、window、worker) `{ ok: false, error }` の JSON を
  `isError: true` で返す (`shared/mcpResult.ts`)。`TOOL_RULES` が client にそう約束している。
- `notifications/cancelled` は SDK に渡す前に拾い、実行中の call の AbortController を止める
  (別の POST で届くため)。実行中の call は全 client 共通の Map に request id で持つので、id が衝突する
  client 同士は互いの call を取り消し得る。`tritium_cli mcp` (§5.6) は id を書き換えてこれを避ける。
- `tools/call` は編集ロック (§7) を call の間だけ取る。別の client が持っていれば
  `EDIT_LOCK_BUSY_MESSAGE` の tool 結果 (`isError: true`) を返す。
- SDK (`@modelcontextprotocol/sdk`) は devDependency で、main の bundle に同梱する。

### tool と 1 call の扱い (`plugins/mcp/worker/mcp.service.ts`)

- 公開するのは `isMcpOp` (`catalog/index.ts`、一覧は `MCP_OPS`): `expose.tool !== false` の op 全部 (core + 全 toolset) と、`expose.mcp: true` の op
  (agent には出さない MCP 専用。`save_scene`、Tools 系の `calc_elepot` / `cut_surface` / `morph_*`、
  アニメーション編集の `list_anims` / `add_anim` など)。MCP client は全 server の tool を一覧して自分で
  選ぶので、agent の `enable_toolsets` の段階は無い。
- 1 call = 1 undo transaction (label `MCP: <tool 名>`)。Cmd+Z 1 回で 1 call が戻る。
  何も変えなかった call は rollback (空 commit で redo を消さないため)。
- 対象はアクティブなタブの scene / view。タブが無ければ (console と同じく) 新しい scene を作る。
- `outsideTxn` の op (`save_scene`、`.qsc` を開く `load_file`) は txn の外で実行する (scene の
  保存・読み込みは undo stack を作り直すため。agent の turn は全体が 1 txn なので、agent には出さない)。
  `load_file` の `.qsc` は worker が path を返し (`CallToolOutcome.openScene`)、`McpRoot` が
  File > Open と同じ経路 (`CmdId.OpenSceneByPath`) で開いて `{ scene, sceneId }` を返す。
- **排他**: agent の turn、console の submit、MCP の call は `txnBusy()` (catalog の
  `runInTxn` が数える、開いている txn の数) を見て、busy なら待たずに `TXN_BUSY_MESSAGE` を返す。
  client の timeout と、agent の turn が LLM 待ちで数分続くことがあるため。
- 結果は `serializeToolOutput` の JSON text。`capture_view` の画像は MCP の image content で
  返す (画像を model に渡すか、表示するかは client 次第)。
- ファイルを書く op (`export_image` / `render_image` / `save_object`) の説明と共有の規則に
  「ユーザが頼んだときだけ書く。見るだけなら `capture_view`」と書いてある。

### scene (タブ) の tool (`plugins/mcp/renderer/sceneTools.ts`)

`list_scenes` / `create_scene {name}` / `switch_scene {sceneId}` / `close_scene {sceneId, discardChanges}`。
タブは window のものなので worker には行かず、`McpRoot` が `useSceneTabs()` で答える (結果は op と
同じ `{ ok, result }` の JSON)。console の scene コマンド (§5.2) と同じく保存確認は出さず、未保存の
scene は `discardChanges: true` が無いと閉じない (説明文で「捨てる前にユーザに聞く」よう指示)。
`MCP_INSTRUCTIONS` にも scene が複数あり得ることと、これらの tool を書いた。

## 4. UI (plugin `mcp`)

- **Settings > Plugins > MCP Server** を on にすると plugin が有効になる (既定 off)。
  ページの行は「Accept connections」(`serverEnabled`、既定 on) と「Port」(既定 27182)。
  Port は数値の text 欄 (`McpPortSettingRow`) で、Enter / blur のときだけ反映する
  (入力の途中で server を開き直さない)。1024-65535 以外は反映せずに赤字で示し、下の行に
  実際の状態 (Listening / ほかのプログラムが使用中などのエラー / endpoint が無く閉じている) を出す。
  既定値でなければ Reset を出す。
  port は入力が止まって 0.8 秒後に適用する。
- **status bar のアイコン** (`contributes.statusBar`): off は灰、待機中は緑、実行中は黄で
  tool 名、port が使用中などのエラーは赤。クリックで popover:
  on/off スイッチ (Settings の行と同じ値)、状態、「Clients: Set up...」、「Token: Regenerate」、
  歯車 (Settings のページを開く)。
- **Connect a client dialog**: Claude Code (コマンド) / Codex (`~/.codex/config.toml`) /
  Antigravity (`~/.gemini/config/mcp_config.json`) / Other の設定を表示し、Copy で token を
  埋めてコピーする (画面上は `<token>`)。中身は `plugins/mcp/renderer/clientSetup.ts`。
  Codex は tool の timeout が既定 60 秒なので `tool_timeout_sec = 1800` を入れている。

## 5. console endpoint と `tritium_cli`

- **有効化**: Console plugin (既定 on) の Root が `useLocalApiEndpoint('console', ...)` を開く
  (`renderer/useConsoleEndpoint.ts`)。開くのは、Settings の「Command line access」(`remoteAccess`、
  既定 off) が on のとき、または `--tritium-cli` (か `--tritium-cli=mcp`) 付きで起動された app の起動中 (下記)。
- **wire 形式** (`shared/types/localApi.ts`):
  - `POST /console/run` `{ dialect, text, cwd, lock? }` か `{ dialect, scriptPath, cwd, lock? }`
    -> `{ entries, aborted, interrupted, cwd }`
    (`lock` は §7。main が取り除いてから window に渡す)。`scriptPath` (絶対パス) は、dialect が
    `submit: 'path'` と宣言した script を app 自身に読ませるとき (今は native の `.qax`。1 action = 1 undo で再生)。
    `text` と同時には渡せない。
  - `POST /console/lock` `{ action: 'acquire' | 'release', owner }` -> `{}` (main が答える、§7)
  - `POST /console/complete` `{ dialect, line, cwd }` -> `{ replacement, messages, candidates? }`
    ([console-completion.md](console-completion.md))
  - `POST /console/info` `{}` -> `{ version, build, protocol, dialects }` (libcuemol2 の version と source
    revision。client の banner 用)。`dialects` は app が話す dialect の一覧 (`id`、`label`、`prompt`、
    `scripts: { ext, submit: 'text' | 'path' }[]`、`cliColor`)。console plugin の
    `useDialectMetas()` (native と、有効な dialect の plugin の meta。[op-catalog.md](op-catalog.md) §5) をそのまま返す。client は dialect の表を持たず、これで
    `--dialect` の検証・prompt の色・切り替えの語・script ファイルの送り方を決める。`protocol` は console-kit の `CONSOLE_PROTOCOL` (wire の改訂番号)。
    npm 版 (§5.5) の client は app と別に更新されるので、対話開始時に自分の値と比べ、違えば
    古い側を更新するよう警告する (警告だけで続行。`protocol` の無い古い app も同じ扱い)。
    旧 client を壊す wire 変更をしたら値を上げる。現在 3 (`dialects` と `scriptPath` を足したとき。2 は
    `/console/lock` と `lock`)。`dialects` の無い app (protocol 2 以前) には、client は native / PyMOL の
    2 つを話すものとして扱い、`.qax` を native `run "<abs>"` で送る (`cli/src/dialects.ts`)。
  - body の形は main で検査し (`cwd` は絶対パス)、だめなら 400。main は `dialect` が空でない文字列で
    あることだけを見る。どの dialect があるかは window が知っているので、知らない dialect は window が
    `{ error }` で断る (409)。worker の失敗 (busy 等) も 409 `{ error }`。
- **実行**: panel と同じ worker service (`runCommand` / `complete`) を、アクティブなタブに対して
  呼ぶ。1 submission = 1 undo txn、排他 (`txnBusy()`) も panel と同じ。`load x.qsc` は panel と同じく
  File > Open の経路で開く。client の切断 (Ctrl-C) は `cancelRun` (= Stop)。panel と共通の
  `renderer/runSubmission.ts` を通るので、scene コマンド (§5.2) も同じに動く。
- **作業ディレクトリ**: client が持つ。request の `cwd` で相対パスを解決し、`cd` の結果を応答の
  `cwd` で返す。worker は client のための状態を持たず、panel の作業ディレクトリ (module 変数) も
  動かさない (`RunCommandArgs.cwd` / `CompleteArgs.cwd`)。PyMOL の log と `lastRay` は panel と共有。
- **GUI 側の表示**: CLI から来た submission の出力は console panel の transcript にも追加し、
  echo 行に `[cli] ` を付ける。

### 5.1 client (pnpm package `tritium/cli`、`@cuemol/tritium-cli`)

thin client。react-gui と並ぶ workspace package で、ソースは TS (`src/tritium_cli.ts` が entry、
接続まわりは `src/connection.ts`)。`scripts/build.mjs` (esbuild) が import ごと 1 ファイルの
ES module `dist/tritium_cli.mjs` に bundle する (`task build_tritium` に含まれる。単体は
`task build_tritium_cli`)。実行は Node 18 以降。

- wire 型 (`LocalApiInfoFile`、`TRITIUM_CLI_FLAG`、`/console/*` と `/app/quit` の body) は、app と
  共有する package `tritium/console-kit` (`@cuemol/console-kit`) にある。TS ソースのまま配り、各 consumer
  が bundle する (DOM / Node 非依存)。react-gui は `src/shared/types/localApi.ts` から re-export するので、
  app 側の import は変わらない。react-gui の devDependency なので electron-vite の main build でも
  外部化されず bundle される (`externalizeDepsPlugin` が外に出すのは `dependencies` だけ)。
- 検査: `task test_tritium_cli` (console-kit / cli の typecheck と cli の Vitest)。CI は
  `check_tritium_react_gui` から同じものを走らせる。CLI と endpoint を突き合わせる結合テストは
  react-gui 側 (`main/localApi/consoleEndpoint.test.ts`、devDependency `@cuemol/tritium-cli`)。repo からは `task run_tritium_cli`
(`-- -c '...'` で非対話)、配布物からは同梱の wrapper `tritium_cli` (§5.3) で起動する。

- 接続情報は request ごとに `~/.cuemol/local-api.json` (`CUEMOL_LOCAL_API_INFO`) から読む。
  port は MCP plugin の設定で変わり得るが、client は毎回このファイルを読むので影響しない。
- **app の自動起動** (`ensureApp`): 情報ファイルが無い、`console` endpoint が無い、pid が
  死んでいるときは、app を `--tritium-cli` 付きで detached 起動し (`ELECTRON_RUN_AS_NODE` は外す)、情報ファイルに
  `console` が載るまで最長 90 秒待つ (300 ms ごとに読む。endpoint は worker の初期化が終わってから
  開くので、これが準備完了の合図になる)。CLI を抜けても app は残る。動いている app (access off) に
  対しても同じで、2 個目のプロセスは single-instance lock で argv を渡して終わり、動いている app が
  その起動中だけ endpoint を開く (main `noteCliLaunch` -> invoke `LOCAL_API_CLI_ACCESS` / push
  `LOCAL_API_CLI_ACCESS_GRANTED` -> renderer `useCliAccessGranted()`)。設定値は変えない。
  `task run_tritium_cli` からは、env `TRITIUM_CLI_DEV_APP` (react-gui のパス) を見て、そこで
  `pnpm exec electron-vite preview --skipBuild -- --tritium-cli` を detached 起動する (build 済みの
  dev app。electron-vite は `--` 以降を app の argv に渡す)。task は CLI の cwd を task を実行した
  ディレクトリにする。起動する app は次の順で最初に当たったもの (`launchCommand`):
  1. `ELECTRON_RUN_AS_NODE` 下 (= 同梱 wrapper 経由): `process.execPath` (app 自身)
  2. `TRITIUM_CLI_DEV_APP`: 上記の dev app
  3. それ以外 (npm 版を system の `node` で実行): インストール済みの app (`src/appLocator.ts`
     `locateApp()`)。env `CUEMOL3_APP` (app の実行ファイル、macOS は `.app` も可) が最優先。
     無ければ macOS は `/Applications` と `~/Applications` の `CueMol3.app`、次に Spotlight
     (`mdfind`、bundle id `org.cuemol.cuemol3`)。Windows は `reg query` で HKLM / HKCU の Uninstall
     配下の `InstallLocation` を全部読み (key 名は electron-builder が appId から作る GUID なので
     名前では引かない)、`CueMol3.exe` がある所。無ければ `%ProgramFiles%\CueMol3`。Linux は deb の
     `/opt/CueMol3/resources/cli/tritium_cli` (wrapper) を読み、`exec "$dir/../../<exe>"` から実行
     ファイル名を取る (名前は packager が package 名から決めるので固定できない)。AppImage は
     `CUEMOL3_APP` で指定してもらう。
  どれも無ければ `NOT_INSTALLED` (`https://github.com/CueMol/cuemol3/releases/latest` と
  `CUEMOL3_APP` の案内) を出して exit 1。`--no-launch` では起動せず、案内を出して終わる。
  spawn の失敗 (実行ファイルが無い等) は `error` event で即座に失敗にする (90 秒待たない)。
- 対話: 起動時に banner (version、port、pid、操作の案内) を出す。prompt は `CueMol <dir> ❯` /
  `PyMOL <dir> ❯` (dialect の `label`。色は `cliColor`)、dialect の id (`native` / `pymol` ...) だけの行で
  dialect 切り替え、Tab 補完
  (zsh 式の一覧とメニュー。[console-completion.md](console-completion.md))、履歴 `~/.tritium_cli_history`、
  待機中は spinner と経過秒、1 秒以上かかったコマンドは `✓` / `✗` と所要時間を出す。
  実行中の Ctrl-C は中断、待機中は入力行の消去 / 終了。`exit` か Ctrl-D で抜ける (app は残る)。
  `quit` (`--force` / `force=true` で確認なし) は app ごと終了し、CLI も終わる (§5.4)。
  色は TTY のときだけで、`NO_COLOR` で消える。dim / 灰色は暗い端末で読みにくいので使わない。
- 非対話: `-c "..."`、ファイル引数 (下記)、stdin のパイプ。`-c` と script と stdin は全体を 1 submission
  として送る (= 1 undo、途中で失敗するとそこで止まる)。
- 出力: output は stdout、warning / error は stderr (TTY なら黄 / 赤)。echo 行は `--echo` のときだけ。
  終了前に stdout / stderr の書き出しを待つ (pipe への書き込みは非同期で、`process.exit` で切れるため)。
- **コマンドライン** (`src/args.ts`、gh 流): 最初の語が subcommand 名 (`skill` / `mcp` / `status` /
  `help` / `version`) ならその subcommand、それ以外は console 自身の引数。同名のファイルは `./skill` と書く。
  `-V` / `--version`、`-h` / `--help`、`help <subcommand>`、`<subcommand> --help`。
  exit code: 0 成功 / 1 実行失敗 / 2 usage エラー / 130 Ctrl-C。
  - `--version` / `version`: CLI の版 (+ `CONSOLE_PROTOCOL`) と、動いていれば app の版。app は起動しない。
    CLI の版は bundle に埋め込まない (§5.5 の byte 比較が毎回差分になるため)。`dist/` の 1 つ上の
    `package.json` (npm 版にはある、name が `@cuemol/tritium-cli` のとき) から読み、無ければ
    `bundled with CueMol3` と出す (`src/version.ts`)。
  - `status`: 情報ファイルを読み、稼働の有無・pid・port・開いている endpoint・版を出す。起動しない。
    exit 0 = 稼働、1 = 非稼働 (`src/status.ts`)。
- **ファイル引数** (`src/inputs.ts`): 拡張子で分ける。どの拡張子がどの dialect の script かは
  `/console/info` の `dialects` で決まるので、CLI は app につないでからファイルを分ける
  (組み合わせの usage エラーも接続後に出る)。
  - dialect の script -> その dialect で。`submit: 'text'` (`.pml`) は中身を、`submit: 'path'` (`.qax`) は
    `scriptPath` を送る。`.txt` / `-` (stdin) -> 中身を現在の dialect で。script は単独 (他のファイルや `-c`
    と併用すると exit 2)。
  - `.qsc` -> scene。`load` の `.qsc` は txn の外で、長い行の中では拒否され、scene を開くのは
    submission の後 (`runSubmission.ts`) なので、**1 個ずつ単独の submission** にして指定順に送る。
    `/console/run` は scene を開き終えてから返るので、返った時点でそのタブがアクティブ。
  - それ以外 -> data。native `load "<abs>"` (= `load_file`。reader は File > Open と同じく拡張子か中身で
    選ぶ)。data と `-c` は 1 submission (= 1 undo) にまとめ、最後に開いた scene (アクティブタブ) に送る。
    1 コマンド 1 行で送る (パスの括弧が次のコマンドを飲み込まないよう)。dialect が native 以外なら `-c` は
    別の submission になる。
  - scene が 2 個以上あり data か `-c` もあるときは、どの scene に入れるか曖昧なので exit 2。
  - 存在しないファイルは送る前に exit 1。パスは `"..."` で囲む (console に escape は無いので、`"` を含む
    パスは `'...'`、両方含むものは渡せない)。
  - 送り終えたら終了。`-i` を付け stdin が TTY なら続けて対話に入る。
  - submission が 2 件以上なら、最初の前に編集ロックを取り、最後の後に放す (`src/runs.ts`、§7)。

### 5.2 scene コマンド (native dialect)

`list_scenes` (短縮形 `scenes`。一覧、`*` がアクティブ)、`create_scene [name]`、`switch_scene <scene>`、
`close_scene [scene] [, discardChanges]`。scene は番号 (`list_scenes` の順)、`#uid`、名前で指定し、名前は Tab で
補完する。scene はタブなので worker では作れない: command は `CmdContext.requestScene` で要求を
返して submission をそこで終え (`RunCommandOutcome.sceneRequest` と残りの `rest`)、renderer の
`runSubmission` が `doSceneRequest` (`renderer/sceneRequest.ts`) でタブを操作してから、残りを
その時点のアクティブ scene に対して送り直す。よって `create_scene; fetch 1crn` は新しい scene に入り、
undo txn は scene ごとに分かれる。

- タブの操作そのもの (scene の解決、一覧、作成、切り替え、閉じる) は plugin host の `sceneTabOps.ts`
  にあり、MCP の scene tool (`plugins/mcp/renderer/sceneTools.ts`) と共有する。各 front end は結果を
  行 (console) か JSON (MCP) に整形するだけ。タブ操作は plugin API `useSceneTabs()` (各操作は
  tab strip に反映されてから resolve する)。
- 保存確認の dialog は出さない (terminal から操作中に GUI で止まるため): 未保存の scene は
  `discardChanges` が true でないと閉じない (MCP も同じ引数名)。
- タブが 1 つも無いとき、`runSubmission` はまず scene 無し (sceneId 0) で worker に送る。先頭が
  タブのコマンドならそのまま動き (`list_scenes` で scene が作られることはない)、それ以外は
  `not-found` で返り、そこで scene を作って送り直す。
- `@file` / `run` の script 内では使えない。

### 5.3 配布物への同梱

- cli package の `dist/tritium_cli.mjs` を extraResources (`from: ../cli/dist/...`) で `<resources>/cli/` に置き、afterPack hook
  (`build/cliWrapper.js`) が隣に wrapper を書く: macOS / Linux は sh の `tritium_cli`、Windows は
  `tritium_cli.cmd`。wrapper は app 自身の実行ファイルを `ELECTRON_RUN_AS_NODE=1` で Node として
  動かす (VS Code の `code` と同じ)。Electron の RunAsNode fuse を切らないこと。sh 版は symlink を
  辿ってから app を探すので、PATH 上の symlink から起動できる。
- wrapper を固定ファイルで持たず afterPack で生成するのは、実行ファイルの場所が packager の決める
  ものだから (Linux では package 名から導かれる `packager.executableName`)。mac では同じ hook
  (`build/afterPack.js`) が wrapper を書いた後に deep ad-hoc codesign するので、wrapper も署名に入る。
- `cliPath` は、開発ビルドでは cli package の `dist/tritium_cli.mjs` (`node` で起動)、AppImage では空。
- PATH は installer では触らない。Settings > Plugins > Console の「Command line tool」行に
  wrapper のフルパス (Copy) と PATH への入れ方を出す (`AppPathInfo.cliPath`、custom setting 行
  `CliPathRow`)。例外は deb で、`/usr/bin/tritium_cli` に symlink を張る
  (`build/linux/after-install.tpl` / `after-remove.tpl`、app-builder-lib の stock template の写し +
  1 行)。AppImage は resources が起動ごとの一時 mount なので非対応。

### 5.4 `quit` (`POST /app/quit`)

- 1 行が `quit` と高々 force 引数だけのとき (`quit`、`quit --force`、`quit -f`、`quit true`、
  `quit force=true`。読み方は console-kit `quitLine()` で app の command と共有)、client はそれを console に送らず
  `POST /app/quit` `{ force }` -> `{ outcome: 'quit' | 'cancelled' }` を送る (対話・`-c`・script・stdin
  の全モード)、app が終了したら client も終わる。対話の `exit` は CLI を抜けるだけ (`exit` は引数を取らない。force は `quit` だけ)。app 側にも同じ働きの `quit` / `exit` command が
  あり ([op-catalog.md](op-catalog.md) の builtin)、`-c "load x; quit"` のように他のコマンドと並んだ
  `quit` はそちらで終了する (結果の `cancelled` は返らない)。
- console endpoint に属する (CLI アクセスと同時に開閉) が、window には relay せず main が答える
  (`localApi/appEndpoint.ts`、終了処理は `main/appQuit.ts` を注入)。閉じようとしている window に
  答えさせると、返事が来ないまま window が消えるため。
- **通常**: main window を前面に出し (macOS は `app.focus({ steal: true })`)、`app.quit()`。
  Cmd+Q と同じく `before-quit` -> close funnel -> renderer の保存確認 (`ConfirmCloseTabDialog`) を通る。
  前面に出すのは、terminal が focus を持ったまま dialog が裏や最小化中の window に出ると、誰も
  答えられずに待ち続けるため。結果は `quitState.waitQuitOutcome()` で待ち、renderer の
  `WINDOW_CLOSE_PROCEED` (`proceed` true -> `quit`、false -> `cancelled`) で決まる。応答は window が
  閉じる前に返る。
- **force**: crash UI の Quit と同じフラグ (`setForceQuit` / `setAppQuitting` / confirmed) を立てるが、
  `app.exit()` ではなく `app.quit()` で終わる。`will-quit` が走るので、接続情報ファイルと render
  history は消える。保存確認は出ず、未保存の変更は失われる。
- client: 通常の quit は確認待ちの間 spinner を出す。`cancelled` なら案内を出して対話を続け、
  `quit` なら終了する。app が落ちて応答が届かなかった場合は pid が消えたことで `quit` とみなす。
  ルートの無い古い app (404) には「この CueMol は CLI から終了できない」と出す。Ctrl-C は待つのを
  やめるだけで、app の dialog は残る。

### 5.5 npm 配布 (`@cuemol/tritium-cli`)

同梱と同じ `dist/tritium_cli.mjs` を npm に publish し、`npm i -g @cuemol/tritium-cli` で app と
別に入れられるようにする (system の Node 18 以降で動く。app は §5.1 の探索で見つけて起動する)。

- package: `tritium/cli/package.json` の `bin` (`tritium_cli` -> `dist/tritium_cli.mjs`)、`files: ["dist"]`。
  bundle が依存 (console-kit、marked) を全部含むので runtime dependencies は無い。repo 上の
  `version` は `0.0.0` のプレースホルダーで、publish 時に決める。
- entry 判定は `realpath` で比べる (`isEntry()`)。npm の bin は symlink (Windows は `.cmd` shim) なので、
  `argv[1]` と `import.meta.url` をそのまま比べると main が走らない。
- publish は release workflow (`.github/workflows/build2.yml` の `publish_npm`、`v*` tag のみ、
  `release_build` の後):
  - **変わったときだけ**: build した bundle を npm 上の `latest` の `dist/tritium_cli.mjs` と
    byte 比較し、同じなら何もしない。esbuild の出力は決定的で version 等を埋め込まないので、
    同じ byte = 変更なし (console-kit や marked の変更も拾う)。bundle に版数や日時を埋め込むと
    毎回 publish されるようになるので入れないこと。
  - version は tag の先頭 3 桁 (`v2.4.0.546` -> `2.4.0`。npm は semver 3 桁)。「その app release で
    最後に CLI が変わった」の意味になる。同じ 3 桁が publish 済みで中身だけ変わった場合
    (build 番号だけの release) は publish できないので job を失敗させる (revision を上げて出し直す)。
  - publish 前に `devDependencies` を消す (`workspace:` protocol は repo の外で意味を持たない)。
  - 認証は npm trusted publishing (GitHub OIDC、`id-token: write`)。token の secret は持たない。
    npm >= 11.5.1 が要るので job で `npm@latest` を入れる。npmjs.com の package 設定 (Trusted
    Publisher) に repository `CueMol/cuemol3`、workflow `build2.yml` を登録しておくこと。この設定は
    package が存在しないとできないので、最初の 1 回は手で publish した。

### 5.6 `tritium_cli mcp` (stdio の MCP)

MCP client に stdio transport で tool を出す (`src/mcpBridge.ts`)。中身は §3 の HTTP endpoint で、
bridge は中継するだけ (SDK は使わない)。`claude mcp add cuemol -- tritium_cli mcp` のように登録する。

- **起動**: `ensureApp({ endpoint: 'mcp' })`。情報ファイルに `mcp` が載るまで待つ。載っていなければ
  `--tritium-cli=mcp` で起動する (動いている app にも 2 個目のプロセスとして渡す)。main の
  `noteCliLaunch` は flag ごとに endpoint を付与し (`cliFlagEndpoints`、`console` + `mcp`)、
  `LOCAL_API_CLI_ACCESS` / `LOCAL_API_CLI_ACCESS_GRANTED` で一覧を渡す。mcp plugin は manifest の
  `cliActivatedBy: 'mcp'` により、**無効にされていてもその run の間は有効**になり
  (`isPluginEnabled`)、`McpRoot` は「Accept connections」が off でも endpoint を開く。設定値は変えない。
- stdin の 1 行 (JSON-RPC の message か batch) を 1 回の `POST /mcp` にし、応答を 1 行で stdout に書く。
  202 (notification) は何も書かない。`text/event-stream` の応答なら `data:` 行を取り出す。initialize の
  結果の `protocolVersion` を以後 `MCP-Protocol-Version` header に付ける。token と port は毎回情報
  ファイルから読む。stdout には JSON-RPC 以外を書かない (起動中の案内は stderr)。
- request は直列化しない (`notifications/cancelled` が実行中の call に届く必要があるため)。
- **request id の書き換え**: main は実行中の call を全 client 共通に request id で持つ (§3)。bridge は
  起動ごとの接頭辞 (`tcli-<pid>-<8 hex>-`) + 連番の文字列 id に置き換えて送り、応答の id を client の
  元の値 (number / string の型も) に戻す。`notifications/cancelled` の `requestId` も同じ表で変換し、
  表に無ければ (もう応答済み) 送らない。
- app が落ちている・401 等: id のある request に JSON-RPC error (`-32000`) を返し、bridge は終わらない。
  stdin の EOF で、応答待ちを待ってから終了。

### 5.7 `tritium_cli skill`

agent 向けの skill (`src/skill/SKILL.md`、frontmatter `name: cuemol`) を esbuild の text loader で
bundle に入れ、`skill` で stdout に出す (app 不要)。`skill install [--dir DIR] [--force]` は既定で
`~/.claude/skills/cuemol/SKILL.md` に書く。中身の違う既存ファイルは `--force` 無しでは上書きしない
(`src/skill.ts`)。コマンドの一覧は skill に書かず、`tritium_cli -c help` を呼ぶよう指示する
(app が自分の catalog から答えるので、app の版とずれない)。

## 6. 既知の制約

- stateless なので `tools/list_changed` を送らない。tool の追加は client の再接続で反映。
- token の再発行・port の変更後は client を登録し直す必要がある。
- 起動中の call を GUI 側から止める UI は無い (client 側の中断で止まる)。
- Windows の `tritium_cli.cmd` (GUI subsystem の exe を Node として動かす) で、対話 (readline) と
  Ctrl-C が動くかは未確認。npm 版は console subsystem の `node.exe` で動くので、この問題は無い。
- npm 版の Windows / Linux での app 探索 (§5.1) は実機で未確認。
- MCP の request id は main で client を区別せずに持つので、`tritium_cli mcp` を介さない HTTP client
  同士で id が衝突すると、取り消しが別の client の call に届き得る (stateless で client を区別できない)。
- `tritium_cli mcp` で有効になった mcp plugin は、その run の間 Settings の switch もオンに見える。

## 7. 編集ロック (client 間の排他)

全 client は app のアクティブ scene を共有し、worker の排他 (`txnBusy()`) は 1 submission の間しか
守らない。`tritium_cli a.qsc b.pdb` の 2 つの submission の間に別の client が scene を開くと `b.pdb` が
そちらに入るので、**1 回のコマンドライン全体**を排他にする。同時編集はサポートしない: 競合した側は
待たずに `EDIT_LOCK_BUSY_MESSAGE` で失敗する (待ち行列・再試行は無い)。

- main の `localApi/editLock.ts` (`EditLock`、Electron と時計を注入する純 module)。1 つを console と
  MCP の endpoint が共有する (`localApi/index.ts`)。
- **明示**: `POST /console/lock` `acquire` (owner は CLI の実行ごとの `randomUUID()`) -> 各 run に
  `lock: owner` -> `release`。他の owner が持っていれば `acquire` も run も 409。
- **暗黙**: `lock` の無い `/console/run` (`-c`、script、stdin、対話の 1 行) と MCP の `tools/call` は、
  その request の間だけ自分で取り、終われば放す。対話の CLI は入力待ちの間は持たない。
- 読むだけの request (`/console/complete`、`/console/info`、MCP の `initialize` / `tools/list`) は見ない。
- **失効**: 実行中の request が 0 になってから 10 秒 (`EDIT_LOCK_IDLE_MS`) で失効する (CLI が `release`
  せずに死んだ場合)。実行中の request がある間は失効しない (長い `render_image` を守る)。client の切断は
  relay の cancel で request が終わるので、そこから数える。失効は次の判定のときに処理する (timer なし)。
- CLI は成功・失敗・Ctrl-C で `release` を送る。`/console/lock` の無い古い app (404) にはロック無しで送る。
- GUI (console panel、agent) は参加しない (従来どおり `txnBusy()` だけ)。
