# MCP server と tool カタログの共通化 (agent / MCP / pymconsole)

Status: **未実装 (計画)**。
関連: [AI agent plugin](../architecture/ai-agent-plugin.md)、
[pymconsole plugin 計画](260913-pymconsole-plugin-plan.md)、
[tritium plugin](../architecture/tritium_plugin/_index.md)。

## 背景

CueMol の機能を MCP (Model Context Protocol) 経由で外部の AI client (Claude Code / Claude Desktop
など) から使えるようにしたい。あわせて、同じ操作を 3 つの経路が別々に実装している状態を解消する:

- **AI agent plugin** (`plugins/agent/worker/tools/`): JSON Schema の tool 約 20 本
- **pymconsole plugin** (`plugins/pymconsole/worker/commands/`): PyMOL 互換 command 40 本強
- **MCP** (新規): 外部 client 向けの tool

pymconsole 計画は「agent tool との共有化は今はやらない」とし、着手の引き金の 1 つに
「3 つ目の consumer が出たとき」を挙げていた。MCP がその 3 つ目にあたる。

## 決定事項

### D1. 正式な tool interface は CueMol ネイティブの ops + toolCatalog

- **ops** (操作本体) は CueMol の概念そのままで設計する: renderer は object、selection は CueMol
  構文、property は CueMol の名前。
- **toolCatalog** は ops の上の JSON Schema adapter。**agent と MCP はこれだけを使う**。
- **pymconsole は ops の consumer の 1 つ**。PyMOL に寄せる部分 (`pym:<rep>` renderer 規約、
  `translateSelection`、PyMOL 設定名の alias、PyMOL 語彙のエラー文言) は console 側に閉じる。
- 依存の向きは **console -> ops のみ**。ops が console を参照しないことを ESLint の
  import 制限で強制する。console の PyMOL 合わせの妥協を正式な interface に持ち込まないため。

### D2. `run_pymol` (console の 1 行を実行する tool) は正式 interface にしない

pymconsole は PyMOL と CueMol の差を無理に合わせている部分があり、CueMol の機能を 100% 出せない。
LLM が PyMOL 構文に強いことを確かめる**実験用途としてのみ**、dev-only (`__DEV_UI__`) の tool として
置くことは可。toolCatalog の正式メンバーにはしない。

### D3. ops は agent 側の実装を起点に作る

console の `run` 本体は PyMOL の意味で書かれているので、それを持ち上げるのではなく、
agent tool の実装 (動作・テスト済み) から ops を作り、console をその上に書き直す
(pymconsole 計画の理由 (a) と同じ)。

### D4. MCP server は GUI アプリに内蔵する (Streamable HTTP)

- 見ながら操作する (描画結果を返す) 用途が主なので、GL context を持つ GUI アプリで動かす。
- transport は **Streamable HTTP を `127.0.0.1` で待ち受け**。stdio は client がプロセスを
  起動する方式で、single-instance lock を持ち stdout をログに使う GUI アプリには向かない。
  stdio しか話せない client は `mcp-remote` 等の shim で中継する。
  登録例: `claude mcp add --transport http cuemol http://127.0.0.1:<port>/mcp`
- server 本体 (HTTP・認証・中継) は main に置く (**core**)。plugin は renderer / worker しか
  持てず、main は plugin registry を見ない設計のため。on/off・port 等の設定は plugin
  `mcp` (`defaultEnabled: false`) の `contributes.settings` とし、main へは汎用 IPC で起動・停止を伝える。

### 採らない案

- **headless MCP server (Node + `@cuemol/core` を stdio で)**: 描画が OffscreenCanvas / WebGL
  依存で画像を返せない。worker service が `import.meta.glob` / vite alias に依存しており別 bundle が
  要る。バッチ解析用途が必要になったら再検討。
- **Python binding (`src/pybr`) + FastMCP**: standalone module としての現状が未確認。

## 構成

```
core: src/renderer/worker/server/
  ops/            型付き操作本体。(ctx, typedArgs, OpContext) => Outcome
                  例: loadFile, fetchPdb, setVisible, center, getProps/setProp,
                      exportImage, captureView, getNames, measure ...
  opRuntime/      OpContext 型、1 txn の commit/rollback helper、実行の直列化 (runQueued)、
                  出力整形 (serializeToolOutput / normalizeServiceResult)
  toolCatalog/    JSON Schema の tool 定義 (ops を呼ぶ薄い adapter)、sceneSnapshot、
                  geometry、selectionCheatSheet。agent と MCP で共有

plugins/agent/                  LLM loop + chat UI -> toolCatalog
plugins/pymconsole/worker/      PyMOL adapter (params / parser / PyMOL の意味づけ) -> ops
plugins/mcp/worker/             listTools / callTool / readResource -> toolCatalog
main/mcpServer.ts               MCP SDK、HTTP、認証、renderer への中継 (core)
```

### OpContext と undo txn

- tool が今 `TurnContext` から使っているのは `sceneId` / `viewId` / `callId` / `noteStream` の 4 つだけ
  (`outcomes` / `inflight` / `queue` / `mutated` / `turnId` は agent loop の状態)。
- 共通の `OpContext = { sceneId, viewId, markMutated, print?, warn?, noteStream?, callId? }` に分ける。
  console の `print` / `warn` は省略可能にし、tool 側は結果に載せる。
- undo txn の規則 (変更があれば commit、なければ rollback) は agent の `turnLoop.ts` と console の
  `runCommand.ts` が同じものを別々に実装している。**opRuntime の helper 1 つ**にまとめる。
  単位は agent = 1 turn、console = 1 submit、MCP = 1 tool call。

### MCP の実行経路

```
MCP client
   |  Streamable HTTP  http://127.0.0.1:<port>/mcp  (bearer token)
   v
main: McpServer (@modelcontextprotocol/sdk)
   |  IPC push (request id 付き) -> invoke で結果
   v
renderer: plugins/mcp の Root (中継のみ)
   |  invokePluginService('plugin.mcp.callTool', { name, input })
   v
worker: toolCatalog から tool を引き、opRuntime の 1 txn helper の中で run
```

- `tools/list` は worker に問い合わせる (定義は worker 側コード)。起動時に一度取って cache。
- 対象 scene / view は呼ばれた時点のアクティブなタブ。
- 公開するもの: tools (toolCatalog)、resource `cuemol://scene/active` (sceneSnapshot)、
  `initialize` の `instructions` に selectionCheatSheet。
- 画像: `capture_view` (agent 用に先行実装中、`feat/agent-capture-view`) の PNG 取り出しを ops に置き、
  MCP では image content として返す。

### セキュリティ (必須)

- `127.0.0.1` のみで待ち受ける。
- 起動時に生成するランダムな bearer token で認証する。Settings で表示・再生成。
- `Origin` header を検証する (MCP 仕様の DNS rebinding 対策)。
- ディスクに触れる tool (`load_file` / `export_image`) は確認ダイアログを出すか、
  読み書き可能なディレクトリを制限する。
- 既定は off。

### 既存機能との衝突

- agent panel の turn 実行中は、MCP の書き込み系 tool を待たせるか拒否する (同じ undo txn に
  混ざらないように)。
- ユーザーの手作業との関係は agent と同じ (既知の制約として ai-agent-plugin.md §7)。

## 網羅性 (CueMol の機能を 100% に近づける)

tool の本数と網羅性がぶつかる (agent は約 20 本に抑える前提)。対策の優先順:

1. **汎用 tool で幅を取る**: 既存の `get_node_props` / `set_node_prop` で描画設定の大半を扱える。
   camera・style・animation も同様の汎用読み書きで足す。
2. **toolset で出し入れ**: map / MD / animation などを toolset に分ける。agent は Settings か会話で
   有効化、MCP は server 設定で選ぶ (MCP client は多数の tool を扱えるので全部出してもよい)。
3. **introspection tool**: `list_capabilities` のような tool で詳しい説明を必要時に引かせる。

まず 1、足りなくなったら 2。

## フェーズ

1. **ops / opRuntime を core に切り出す** (挙動変更なし)。agent の既存 tool を ops 経由に書き換え、
   `OpContext` と 1 txn helper を導入。既存 agent テストが pass し続けることで確認。
2. **pymconsole の重複 7 操作を ops に乗せ替える**: `load` / `fetch` / `set`・`get`・`unset` /
   `enable`・`disable` / `png` / `zoom`・`center` / `get_names`。
   - `load` / `fetch` / `get`・`set`・`unset` / `png` / `get_names` はほぼ CueMol ネイティブなので
     そのまま ops にできる。
   - `enable`・`disable` / `zoom`・`center` は ops を CueMol の形 (node id、selection) で作り、
     PyMOL の名前から対象を引く部分は console に残す。
   - console 固有の操作 (`show` / `hide` / `color` / `isomesh` / `select` など) は当面 console に残し、
     agent 側で必要になった時点で ops へ上げる。
3. **MCP server を追加**: `main/mcpServer.ts`、`plugins/mcp`、Settings (on/off・port・token)、
   セキュリティ対策、agent turn との排他。
4. **toolCatalog を広げる**: 汎用読み書き tool と toolset。

## テスト (最小集合)

- toolCatalog: 既存 `tools/index.test.ts` (schema キーワード集合) をそのまま共通契約として移す。
- opRuntime: 1 txn helper の commit / rollback 規則 (変更あり -> commit、失敗しても変更があれば commit、
  変更なし -> rollback) を 1 件。agent と console の既存テストを helper 経由に寄せる。
- MCP: `tools/list` の形、`tools/call` が worker に届く payload、1 call = 1 txn、
  token 無し・不正 Origin の拒否。各 1 件程度。
- 依存方向: ops が `plugins/pymconsole` を import しないことは ESLint で担保 (テストは書かない)。

## 未確認事項

- MCP SDK (`@modelcontextprotocol/sdk`) の Streamable HTTP server を Electron main で動かす際の
  Node / bundle 上の制約。
- worker から一時ファイルを読めるか (`capture_view` 実装時に確認する)。
- agent turn 中の MCP 書き込みを「待たせる」か「拒否する」か (client 側 timeout との兼ね合い)。

## pymconsole 計画との関係

[260913-pymconsole-plugin-plan.md](260913-pymconsole-plugin-plan.md) の「AI agent tool との共有化は
今はやらない」は本計画で着手条件を満たした。同計画の「`run` 本体に PyMOL 固有の関心を持ち込まない」
規則は D1 の依存方向の前提としてそのまま有効。
