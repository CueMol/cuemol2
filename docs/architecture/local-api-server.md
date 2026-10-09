# Local API server と MCP (日本語)

GUI アプリ (tritium) に内蔵した HTTP server。外部のプログラムが、今開いている CueMol を
操作するための入口で、endpoint は 2 つ:

- MCP (`/mcp`) -- plugin `mcp`。AI client から op catalog を tool として呼ぶ (§3, §4)。
- console (`/console/run`, `/console/complete`, `/console/info`) -- plugin `console`。terminal の
  `tritium_cli` から console の native / PyMOL dialect を使う (§5)。

計画: [261007](../plans/261007-local-api-server-plan.md)。

関連: [op catalog と console](op-catalog.md) (MCP の tool の中身)、
[plugin の API](tritium_plugin/api.md) (`useLocalApiEndpoint` など)。

## 1. 経路

```
MCP client      --POST /mcp-----------+
tritium_cli     --POST /console/*-----+--> main: localApi/server.ts (127.0.0.1:<port>)
                                 token / Origin / Host 検査、path -> endpoint
                                 localApi/mcpEndpoint.ts (MCP SDK, stateless)
                                 localApi/consoleEndpoint.ts (JSON)
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
  `secretStore` (namespace `localApi`、key `token`) に暗号化して保存し、無ければ
  `randomBytes(32)` で作る。popover の「Regenerate」で作り直せる。
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
- `notifications/cancelled` は SDK に渡す前に拾い、実行中の call の AbortController を止める
  (別の POST で届くため)。
- SDK (`@modelcontextprotocol/sdk`) は devDependency で、main の bundle に同梱する。

### tool と 1 call の扱い (`plugins/mcp/worker/mcp.service.ts`)

- 公開するのは `expose.tool !== false` の op 全部 (core + 全 toolset) と、`expose.mcp: true` の op
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
  既定 off) が on のとき、または `--tritium-cli` 付きで起動された app の起動中 (下記)。
- **wire 形式** (`shared/types/localApi.ts`):
  - `POST /console/run` `{ dialect, text, cwd }` -> `{ entries, aborted, interrupted, cwd }`
  - `POST /console/complete` `{ dialect, line, cwd }` -> `{ replacement, messages }`
  - `POST /console/info` `{}` -> `{ version, build }` (libcuemol2 の version と source revision。
    client の banner 用)
  - body の形は main で検査し (`cwd` は絶対パス)、だめなら 400。worker の失敗 (busy 等) は 409 `{ error }`。
- **実行**: panel と同じ worker service (`runCommand` / `complete`) を、アクティブなタブに対して
  呼ぶ。1 submission = 1 undo txn、排他 (`txnBusy()`) も panel と同じ。`load x.qsc` は panel と同じく
  File > Open の経路で開く。client の切断 (Ctrl-C) は `cancelRun` (= Stop)。panel と共通の
  `renderer/runSubmission.ts` を通るので、scene コマンド (§5.2) も同じに動く。
- **作業ディレクトリ**: client が持つ。request の `cwd` で相対パスを解決し、`cd` の結果を応答の
  `cwd` で返す。worker は client のための状態を持たず、panel の作業ディレクトリ (module 変数) も
  動かさない (`RunCommandArgs.cwd` / `CompleteArgs.cwd`)。PyMOL の log と `lastRay` は panel と共有。
- **GUI 側の表示**: CLI から来た submission の出力は console panel の transcript にも追加し、
  echo 行に `[cli] ` を付ける。

### 5.1 client (`tritium/react-gui/tools/tritium_cli.mjs`)

Node (18 以降) だけで動く、依存なしの thin client。repo からは `node tools/tritium_cli.mjs`、
配布物からは同梱の wrapper `tritium_cli` (§5.3) で起動する。

- 接続情報は request ごとに `~/.cuemol/local-api.json` (`CUEMOL_LOCAL_API_INFO`) から読む。
  port は MCP plugin の設定で変わり得るが、client は毎回このファイルを読むので影響しない。
- **app の自動起動** (`ensureApp`): 情報ファイルが無い、`console` endpoint が無い、pid が
  死んでいるときは、`ELECTRON_RUN_AS_NODE` 下 (= wrapper 経由、`process.execPath` が app) に限り
  app を `--tritium-cli` 付きで detached 起動し (`ELECTRON_RUN_AS_NODE` は外す)、情報ファイルに
  `console` が載るまで最長 90 秒待つ。CLI を抜けても app は残る。動いている app (access off) に
  対しても同じで、2 個目のプロセスは single-instance lock で argv を渡して終わり、動いている app が
  その起動中だけ endpoint を開く (main `noteCliLaunch` -> invoke `LOCAL_API_CLI_ACCESS` / push
  `LOCAL_API_CLI_ACCESS_GRANTED` -> renderer `useCliAccessGranted()`)。設定値は変えない。
  repo から node で起動したときと `--no-launch` では起動せず、案内を出して終わる。
- 対話: 起動時に banner (version、port、pid、操作の案内) を出す。prompt は `CueMol <dir> ❯` /
  `pymol <dir> ❯` (dialect 名は色分け)、`native` / `pymol` で dialect 切り替え、Tab 補完
  (`/console/complete` の返す行全体で入力行を書き換える)、履歴 `~/.tritium_cli_history`、
  待機中は spinner と経過秒、1 秒以上かかったコマンドは `✓` / `✗` と所要時間を出す。
  実行中の Ctrl-C は中断、待機中は入力行の消去 / 終了。`exit` か Ctrl-D で抜ける。
  色は TTY のときだけで、`NO_COLOR` で消える。dim / 灰色は暗い端末で読みにくいので使わない。
- 非対話: `-c "..."`、script ファイル、stdin のパイプ。全体を 1 submission として送る
  (= 1 undo、途中で失敗するとそこで止まる)。失敗があれば exit code 1。
- 出力: output は stdout、warning / error は stderr (TTY なら黄 / 赤)。echo 行は `--echo` のときだけ。

### 5.2 scene コマンド (native dialect)

`list_scenes` (短縮形 `scenes`。一覧、`*` がアクティブ)、`create_scene [name]`、`switch_scene <scene>`、
`close_scene [scene] [, force]`。scene は番号 (`list_scenes` の順)、`#uid`、名前で指定し、名前は Tab で
補完する。scene はタブなので worker では作れない: command は `CmdContext.requestScene` で要求を
返して submission をそこで終え (`RunCommandOutcome.sceneRequest` と残りの `rest`)、renderer の
`runSubmission` が `doSceneRequest` (`renderer/sceneRequest.ts`) でタブを操作してから、残りを
その時点のアクティブ scene に対して送り直す。よって `create_scene; fetch 1crn` は新しい scene に入り、
undo txn は scene ごとに分かれる。タブ操作は plugin API `useSceneTabs()` (各操作は tab strip に
反映されてから resolve する)。保存確認の dialog は出さない (terminal から操作中に GUI で止まるため):
未保存の scene は `force` が無いと閉じない。`@file` / `run` の script 内では使えない。

### 5.3 配布物への同梱

- `tools/tritium_cli.mjs` を extraResources で `<resources>/cli/` に置き、afterPack hook
  (`build/cliWrapper.js`) が隣に wrapper を書く: macOS / Linux は sh の `tritium_cli`、Windows は
  `tritium_cli.cmd`。wrapper は app 自身の実行ファイルを `ELECTRON_RUN_AS_NODE=1` で Node として
  動かす (VS Code の `code` と同じ)。Electron の RunAsNode fuse を切らないこと。sh 版は symlink を
  辿ってから app を探すので、PATH 上の symlink から起動できる。
- PATH は installer では触らない。Settings > Plugins > Console の「Command line tool」行に
  wrapper のフルパス (Copy) と PATH への入れ方を出す (`AppPathInfo.cliPath`、custom setting 行
  `CliPathRow`)。例外は deb で、`/usr/bin/tritium_cli` に symlink を張る
  (`build/linux/after-install.tpl` / `after-remove.tpl`、app-builder-lib の stock template の写し +
  1 行)。AppImage は resources が起動ごとの一時 mount なので非対応。

## 6. 既知の制約

- stateless なので `tools/list_changed` を送らない。tool の追加は client の再接続で反映。
- token の再発行・port の変更後は client を登録し直す必要がある。
- 起動中の call を GUI 側から止める UI は無い (client 側の中断で止まる)。
- Windows の `tritium_cli.cmd` (GUI subsystem の exe を Node として動かす) で、対話 (readline) と
  Ctrl-C が動くかは未確認。
