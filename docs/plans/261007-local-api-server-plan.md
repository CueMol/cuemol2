# Local API server: MCP と console CLI から CueMol を操作する

> 261008: thin client は `tritium_cli` に改名し、配布物に同梱した ([261008](261008-tritium-cli-distribution-plan.md))。以下の `cuemol-console` はその前の名前。

Status: **実装済み** (PR 1: server + MCP #656、PR 2: console endpoint + CLI)。
実装後の仕様は [local API server](../architecture/local-api-server.md)。

PR 1 で計画から変えた点:
- MCP の UI は bottom tab ではなく、status bar のアイコン (状態表示 + popover: on/off、client の
  設定 dialog、token 再発行、Settings への入口) と Settings > Plugins > MCP Server の行
  (`serverEnabled`、`port`)。plugin-host に `contributes.statusBar` と `useOpenPluginSettings` を追加。
- toolset ごとの on/off は廃止 (全 tool を常に公開)。
- port は core の `UiState.localApiPort` ではなく MCP plugin の設定。main は既定 27182 で作られ、
  plugin の Root が endpoint を開く前に `setPort` する。PR 2 で console endpoint が同じ port を
  使うときに、置き場所 (core 設定へ移すか) を決め直す。
- 接続情報ファイルは `<userData>` ではなく `~/.cuemol/local-api.json` (`CUEMOL_LOCAL_API_INFO` で上書き)。
- MCP SDK は `McpServer` の下の protocol server に list / call handler を直接設定する
  (低レベル `Server` は deprecated)。

PR 2 で計画から変えた点:
- port は MCP plugin の設定のまま。CLI は毎 request 接続情報ファイルを読むので、port の置き場所を
  core に移す必要は無かった。
- パイプ入力は行ごとではなく全体を 1 submission として送る (script ファイルと同じ。1 undo)。
- echo 行は `--echo` のときだけ表示する (対話では入力と重複するため)。
- 接続情報の場所は `~/.cuemol/local-api.json` に一本化したので、`CUEMOL_USER_DATA` は不要。
関連: [op catalog と console](../architecture/op-catalog.md)、
[260926 MCP / tool catalog 計画](260926-mcp-tool-catalog-plan.md) (D4 とセキュリティ節を本計画で具体化)。

## Context
- op catalog (`renderer/worker/server/catalog/`) が揃い、agent と native console は同じ op から生成されている。
  次の 2 つを、GUI アプリに内蔵する 1 つの local server で提供する:
  1. **MCP**: Claude Code / Claude Desktop などの外部 MCP client から op を tool として呼ぶ。
  2. **console CLI**: native / PyMOL dialect の console を、terminal の thin client `cuemol-console` から使う。
- 既存計画 `docs/plans/260926-mcp-tool-catalog-plan.md` の D4 (GUI アプリに内蔵、Streamable HTTP、
  main に server) とセキュリティ節を引き継いで具体化する。
- ユーザー決定:
  - MCP のファイル読み書きは**任意パス** (console と同じ `fileAccess: 'any'`)。localhost + bearer token で守る。
  - MCP の tool は **core + 全 toolset を常に公開**する (`enable_toolsets` は経由しない)。toolset ごとに外せる。
  - console は socket 経由で使えるようにし、CLI 側は thin client。server は MCP と共有し endpoint を分ける。

## 構成
```
MCP client  --POST /mcp (Streamable HTTP)--+
cuemol-console --POST /console/{run,complete}--+--> main: localApi/server.ts (127.0.0.1:<port>, Bearer, Origin 検査)
                                                 |    router: path -> endpoint ('mcp' | 'console')、無効な endpoint は 404
                                                 v
                         push LOCAL_API_REQUEST {reqId, endpoint, kind, payload}
                                                 v
       renderer: endpoint を持つ plugin の Root (mcp / console) が受けて worker service を呼ぶ
                                                 v
       worker: plugin.mcp.{listTools,callTool,cancelCall} / plugin.console.{runCommand,complete,cancelRun}
                                                 v
                         invoke LOCAL_API_REPLY {reqId, res}  -> HTTP response
```
- **server・認証・中継は main (core)**。plugin は main を持てないため。各 endpoint は対応する plugin が
  有効なときだけ renderer から有効化される。少なくとも 1 つ有効なら listen、全部無効なら close。
- **共通部品**: listener、token 認証、Origin 検査、relay、worker 側の排他 `txnBusy()`。
  endpoint ごとの違いは handler だけにする。

## 実装

### 1. core: catalog の準備
- `plugins/agent/worker/toolOutput.ts` の `serializeToolOutput` を `catalog/toolOutput.ts` へ移す
  (MCP plugin が agent plugin を import しないため)。
- **排他**: `opRuntime.ts` の `runInTxn` に開いている txn の数と `txnBusy()` を足す。agent の `runTurn`、
  console の `runCommand` (panel・CLI 共通)、MCP の `callTool` は開始前に見て、busy なら始めずに
  「CueMol is busy (another command or agent turn is running); retry later」を返す。待たせないのは、
  client の timeout と、agent の turn が LLM 待ちで数分続くため。
- MCP の `instructions`: agent の `prompt/systemPrompt.ts` から tool の規則と selection 構文の早見表を
  `catalog/guide.ts` に切り出し、agent と MCP で共有する。

### 2. core: main `src/main/localApi/`
- `server.ts`: `node:http` で `127.0.0.1:<port>` に listen。
  - `Authorization: Bearer <token>` が不一致なら 401。`Origin` があり `http://127.0.0.1` / `http://localhost`
    以外なら 403 (DNS rebinding 対策)。
  - routing: `/mcp` -> `mcpEndpoint.ts`、`/console/run`・`/console/complete` -> `consoleEndpoint.ts`。
    無効な endpoint は 404。
  - client の切断 (`req.on('close')` / MCP の `extra.signal`) で `cancel` を relay する。
- `relay.ts`: `main/ipc/windowRelay.ts` の `makeWindowRelay` と同じ reqId + pending map の形。
  timeout は 30 分 (`render_image` や長い script のため)。window が閉じたら pending を全て失敗にする。
- `mcpEndpoint.ts`: `@modelcontextprotocol/sdk` の低レベル `Server` + `StreamableHTTPServerTransport`
  (stateless、`sessionIdGenerator: undefined`、request ごとに作る)。`ListTools` / `CallTool` を relay へ。
  高レベル `McpServer` は zod schema 前提なので使わず、`toolSchema(op)` の JSON Schema をそのまま返す。
  SDK は devDependency にして main bundle に同梱する。
- `consoleEndpoint.ts`: body の JSON を relay へ渡し、結果を JSON で返す (下記 §4)。
- **token と接続情報**: token は `secretStore.ts` (namespace `localApi`, key `token`)。無ければ
  `crypto.randomBytes(32).toString('base64url')` で作る。listen 中は `<userData>/local-api.json`
  (`{ port, token, pid }`、mode 0600) を書き、close / `will-quit` で消す。CLI はこれを読んで接続する
  (port も token も貼り付け不要)。
- **port**: core の設定 (`UiState.localApiPort`、既定 27182、Settings の General 行)。2 つの plugin で共有するため。
- IPC (`shared/ipcChannels.ts` + `ipcContract.ts`、型は `shared/types/localApi.ts`):
  - push `LOCAL_API_REQUEST`: `{ reqId, endpoint, kind, payload }`
  - invoke `LOCAL_API_REPLY`: `{ reqId, res }`
  - invoke `LOCAL_API_CONTROL`: `{ endpoint, enabled } | { action: 'regenerateToken' }` -> `LocalApiStatus`
  - invoke `LOCAL_API_STATUS`: -> `LocalApiStatus = { listening, port, endpoints, token?, error? }` (port 使用中は `error`)
  - plugin 側から使う薄い helper `useLocalApiEndpoint(endpoint, handler)` を `plugin-host/api.ts` に足す
    (mount で有効化、unmount で無効化、`LOCAL_API_REQUEST` のうち自分の endpoint だけ処理して reply)。

### 3. plugin `src/plugins/mcp/` (新規)
- manifest: id `mcp`、`defaultEnabled: false`、bottom tab `mcp`。
- renderer Root: `useLocalApiEndpoint('mcp', ...)`。`callTool` にアクティブなタブの `sceneId` / `viewId` を
  付ける (無ければ「Open a scene first」)。
- panel (form-kit): 状態、URL、token (伏せ字 + copy)、token の再生成、登録コマンドの copy
  (`claude mcp add --transport http cuemol http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"`)、
  toolset ごとの `SwitchField` (`usePluginPrefs('mcp')` の `disabledToolsets`。外したものは list に出さず call も拒否。
  stateless なので `tools/list_changed` は送れず、client の再接続で反映される旨を表示)。
- worker `mcp.service.ts`:
  - `listTools`: `OPS` のうち `expose.tool !== false` で、外されていない toolset のもの。
    `{ name, description, inputSchema: toolSchema(op) }`。
  - `callTool`: `txnBusy()` 確認 -> `findOp` -> `readToolArgs` -> `runInTxn(scene, txnLabel('MCP: ', name), ...)` の中で
    `invokeOp`。`OpContext` は agent の `opContextOf` と同じ形で `fileAccess: 'any'`、`cancelled` は call ごとの flag、
    `noteStream` の stream は txn を閉じる前に待つ (agent の `inflight` と同じ)。1 call = 1 undo txn。
  - 結果: `{ content: [text (serializeToolOutput), image?], isError: !ok }`。`capture_view` の画像は image content。
  - `cancelCall`: flag を立て、その call の stream を cancel する。
- `.qsc` の `load_file` (`outsideTxn`) は agent と同じく未対応。`save_scene` は `tool: false` なので出ない。

### 4. console: endpoint と CLI
- **console plugin** に設定 `remoteAccess` (toggle、既定 off、「Allow the cuemol-console command line」) を足す。
  plugin 有効かつ on のとき、Root が `useLocalApiEndpoint('console', ...)` を有効にする。
- endpoint:
  - `POST /console/run` `{ dialect, text, cwd }` -> `{ entries, aborted, interrupted, cwd }`。
    既存の worker service `runCommand` を使う。接続が切れたら `cancelRun` (Stop と同じ)。
  - `POST /console/complete` `{ dialect, line, cwd }` -> 既存の `complete` の結果。
  - 対象 scene はアクティブなタブ。
- **runtime の変更 (`runtime/runCommand.ts`)**: 作業ディレクトリは今 worker の module 変数 `workingDir`
  (panel 用) だけ。`RunCommandArgs` / `CompleteArgs` に省略可能な `cwd` を足し、渡されたらそれを使い、
  `cd` の結果は module 変数ではなく結果の `cwd` で返す。CLI の cwd は CLI 側が持つので、server 側に
  session 状態は持たない。PyMOL の `lastRay` は GUI の console と共有のまま (scene の状態に近いため)。
- GUI の console panel の transcript に、CLI から来た submission を `[cli]` 付きで表示する
  (console plugin の plugin channel で push)。GUI 上で何が起きたか分かるようにするため。
- **thin client `tritium/react-gui/tools/cuemol-console.mjs`** (Node 標準のみ、依存なし):
  - `<userData>/local-api.json` を読む (無ければ「CueMol is not running, or command line access is off」)。
    userData の場所は OS ごとの既定 (`~/Library/Application Support/<app>` など) と `CUEMOL_USER_DATA` で上書き。
  - 対話: `readline` (async completer で `/console/complete`、prompt は `CueMol>` / `PyM>`、
    履歴は `~/.cuemol_console_history`)。`native` / `pymol` で dialect 切り替え。Ctrl-C で実行中の request を
    abort (= Stop)、待機中なら終了。
  - 非対話: `cuemol-console -c "fetch 1crn; show 1crn"`、`cuemol-console script.cml`、stdin がパイプなら行ごとに実行。
    `--dialect pymol`。失敗があれば exit code 1。
  - 出力: `warning` は stderr、`error` は stderr + 赤 (TTY のとき)、他は stdout。
  - 配布は当面 repo から `node tools/cuemol-console.mjs` で起動する。パッケージ同梱 (Electron の
    `ELECTRON_RUN_AS_NODE` で動かす wrapper) は別タスク。

## PR の分け方
1. **local API server + MCP** (§1-3)。server の routing と `useLocalApiEndpoint` はこの時点で endpoint 汎用にする。
2. **console endpoint + CLI** (§4)。

## ドキュメント
- 実装後に `docs/architecture/local-api-server.md` (経路、セキュリティ、MCP の登録方法、CLI の使い方、既知の制約) を書き、
  `docs/architecture/_index.md`、`op-catalog.md` §4-5、`tritium/CLAUDE.md` の plugin 一覧に追記。

## 主に触るファイル
- 新規: `src/main/localApi/{server,relay,mcpEndpoint,consoleEndpoint}.ts`、`src/shared/types/localApi.ts`、
  `src/plugins/mcp/{index.ts,calls.ts,renderer/*,worker/mcp.service.ts}`、`catalog/{toolOutput,guide}.ts`、
  `tools/cuemol-console.mjs`
- 変更: `src/main/index.ts` (will-quit)、`src/main/ipcHandlers.ts`、`shared/ipcChannels.ts`、`shared/ipcContract.ts`、
  `shared/types/uiPrefs.ts` (`localApiPort`)、Settings の General 行、`plugin-host/api.ts`、`catalog/opRuntime.ts`、
  `plugins/agent/worker/{turnLoop.ts,toolOutput.ts,prompt/systemPrompt.ts}`、
  `plugins/console/{index.ts,renderer/ConsolePanel.tsx,shared/consoleTypes.ts,worker/runtime/runCommand.ts,worker/completion/completeService.ts}`、
  `plugins/index.ts`、`package.json`

## テスト (最小集合)
- main `server`: token 無し 401、不正 Origin 403、無効な endpoint 404、有効な endpoint の request が relay に
  `{endpoint, kind, payload}` で届いて結果が返る (relay を fake にして実 HTTP で 1 件)。
- main `mcpEndpoint`: `tools/list` / `tools/call` の relay と応答の形 (1 件)。
- worker `mcp.service`: 1 call = 1 txn (label `MCP: <name>`)、`txnBusy()` 中は拒否、外した toolset は list・call とも不可、
  image outcome が image content になる (fake ctx で 1-2 件)。
- `opRuntime`: `txnBusy()` が `runInTxn` の間だけ true (既存テストに assert 追加)。
- console runtime: `cwd` を渡すと相対パスがそれで解決され、`cd` が module 変数を変えずに結果の `cwd` で返る (1 件)。
- CLI: `local-api.json` が無いときのメッセージと、`-c` 実行の request body (server を fake にして 1 件)。

## 検証
1. `cd build_scripts && task build_tritium` -> `task run_tritium` (起動マーカー確認)。
2. PR 1: MCP plugin を有効化し panel に URL と token が出ること、`curl` で 401 / 403。
   Claude Code に登録し「1crn を取得して cartoon にし、画像を見せて」「GI でレンダリングしてプロジェクトに保存」などを実行。
   画面に反映、1 call が Cmd+Z 1 回で戻る、画像が client に届く、agent の turn 中は busy、client 側の中断で render が止まる。
3. PR 2: console の `remoteAccess` を on にし、`node tools/cuemol-console.mjs` で対話・Tab 補完・`cd` / `ls`・
   `pymol` 切り替え・Ctrl-C での Stop、`-c` / script / パイプ実行、GUI panel に `[cli]` 行が出ること。
   MCP と CLI を同時に使い、片方の実行中にもう片方が busy を返すこと。
4. 確定後: `npm test`、`tsc` (web / node)、ESLint、`task lint_tritium_style`。

## 未確認事項 (実装時に確かめる)
- SDK の現行版が Electron main の bundle (devDependency 同梱) で問題なく動くか、zod の版の要求。
- CLI から userData の場所を確実に知る方法 (app 名・dev 実行時の `CUEMOL_FRESH_PREFS` による差)。
  難しければ main が `~/.cuemol/local-api.json` にも書く。
