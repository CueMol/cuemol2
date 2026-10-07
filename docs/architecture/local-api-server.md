# Local API server と MCP (日本語)

GUI アプリ (tritium) に内蔵した HTTP server。外部のプログラムが、今開いている CueMol を
操作するための入口で、現在の endpoint は MCP (`/mcp`) だけ。console の command line client
(`/console/*`) は [261007 計画](../plans/261007-local-api-server-plan.md) の PR 2 で足す予定。

関連: [op catalog と console](op-catalog.md) (MCP の tool の中身)、
[plugin の API](tritium_plugin/api.md) (`useLocalApiEndpoint` など)。

## 1. 経路

```
MCP client --POST /mcp--> main: localApi/server.ts (127.0.0.1:<port>)
                                 token / Origin / Host 検査、path -> endpoint
                                 localApi/mcpEndpoint.ts (MCP SDK, stateless)
                                        |
                  push LOCAL_API_REQUEST {reqId, endpoint, kind, payload}
                                        v
           renderer: plugin mcp の Root (useLocalApiEndpoint('mcp', ...))
                                        v
           worker: plugin.mcp.{describe, listTools, callTool, cancelCall}
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

- 公開するのは `expose.tool !== false` の op 全部 (core + 全 toolset)。MCP client は全 server の
  tool を一覧して自分で選ぶので、agent の `enable_toolsets` の段階は無い。
- 1 call = 1 undo transaction (label `MCP: <tool 名>`)。Cmd+Z 1 回で 1 call が戻る。
  何も変えなかった call は rollback (空 commit で redo を消さないため)。
- 対象はアクティブなタブの scene / view。無ければ「No scene is open」。
- **排他**: agent の turn、console の submit、MCP の call は `txnBusy()` (catalog の
  `runInTxn` が数える、開いている txn の数) を見て、busy なら待たずに `TXN_BUSY_MESSAGE` を返す。
  client の timeout と、agent の turn が LLM 待ちで数分続くことがあるため。
- 結果は `serializeToolOutput` の JSON text。`capture_view` の画像は MCP の image content で
  返す (画像を model に渡すか、表示するかは client 次第)。
- ファイルを書く op (`export_image` / `render_image` / `save_object`) の説明と共有の規則に
  「ユーザが頼んだときだけ書く。見るだけなら `capture_view`」と書いてある。
- `.qsc` を開く `load_file` (`outsideTxn`) は未対応。`save_scene` は tool に出ない。

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

## 5. 既知の制約

- stateless なので `tools/list_changed` を送らない。tool の追加は client の再接続で反映。
- token の再発行・port の変更後は client を登録し直す必要がある。
- 起動中の call を GUI 側から止める UI は無い (client 側の中断で止まる)。
