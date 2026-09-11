# AI Agent Prompt Panel 実装プラン (tritium/react-gui)

作成日: 2026-09-11。**未実装** (着手前の実装計画)。

調査 (ブリーフ 7 項目の結果) と設計判断の記録を兼ねる。実装が済んだら `docs/plans/_index.md` の
状態を「実装済み」に更新し、仕様の説明は `docs/architecture/ai-agent-panel.md` に書き起こす。

---

## 1. Context (背景と目的)

tritium には約 235 個の worker service (`fn(ctx, args) -> Result`) が揃っており、シーン操作・
選択・レンダラ生成・解析・画像出力が全て構造化引数で呼べる。この資産を **LLM の判断で呼ぶ
チャット UI (AI agent prompt panel)** として開くのが本プランの目的。ユーザーが自然言語で
「1CRN を読み込んで cartoon で表示し、リガンド周辺 5 Å を stick で出す」と書けば、agent が
既存 service を順に呼び、結果を streaming テキストで返す。

調査ブリーフ (7 項目) の結果と、ユーザー決定 (2026-09-11) を前提にする。

### ユーザー決定

| 項目 | 決定 |
|---|---|
| LLM provider | **OpenAI API** (実験用 API キーを使う) |
| agent loop の層 / undo | **worker 内 loop、1 指示 = 1 undo txn** (C++ 変更なし) |
| panel 配置 | **左 side pane に新 activity view `agent`** |
| API キー保存 | **main で `safeStorage` 暗号化 + electron-store**、`OPENAI_API_KEY` を fallback |

### 調査で確定した事実 (設計の根拠)

- **呼び出し口**: `cm.invokeService<K>(name, args)` (`worker/client/AsyncCueMol.ts:115` ->
  `WorkerTransport.ts:501`)。wire は `postMessage([method, seqno, args])`。失敗は `Result`
  (`worker/shared/result.ts`) で返り、throw は reject (文字列) になる。結果の形は 3 方言混在
  (`Result<T>` / 素の `{ok}` / `{ok, error?, count?}`)。
- **ServiceMap** は `worker/shared/calls/` の 20 スライス + `index.ts` (`ALL_SERVICE_KEYS`、
  235 件)。`calls/index.test.ts:24-31` の `SLICES` は手書き map (新スライスは追記必須)。
- **worker 内で service 同士を直接呼べる** (`services/traj/morphMol.ts:296` など)。
  非同期 service も既存 (`file/streamLoadFromUrl.ts` は `await fetch()` を worker 内で実行)。
- **worker の unhandled rejection は致命的**: `worker_launcher.ts:38-50` が `__worker_crash__` を
  post し `WorkerTransport._handleWorkerCrash` が worker を破棄する。async service は全経路
  try/catch 必須。
- **外部 HTTP**: CSP は一切無い。worker は renderer 側 Web Worker で
  `nodeIntegrationInWorker: true`。Node 組み込みは `electron.vite.config.ts` の
  `workerExternal` / `workerGlobals` に登録が必要。
- **長時間非同期の先例**: `helpers/streamFetchToReader.ts` (AbortController を `reqId` で
  Map 管理、`cancelStream(reqId)`) と `renderjob/*` (`ctx.svc.pushMessage(CHANNEL, update)` ->
  wire `[CHANNEL, update]`、transport 側 `const [update] = event.data.slice(1)`)。push channel は
  `WorkerTransport.ts:172-250` に 1 分岐ずつ手配線し `subscribeXxx(cb) => unsubscribe` を持つ。
- **undo**: `services/withUndoTxn.ts` (`withUndoTxn` / `undoTxnResult`、同期 body 専用)。
  C++ `UndoManager::startTxn` は **nested を最外側に吸収** (`src/qsys/UndoManager.cpp:178-189`、
  内側の commit/rollback は nest counter を減らすだけ)。`commitTxn` は空 txn でも redo を消す。
  **`rollbackTxn` は pending の編集を実際に revert する** (`UndoManager.cpp:205-226`
  `m_pPendInfo->undo()`)。`isInTxn` は C++ にあるが `Scene.qif` に露出していない。
  複数 service をまたぐ txn 手段は TS 層に無い。CLAUDE.md: undo txn API は worker service 内のみ。
- **選択式**: `helpers/makeSel.ts` でコンパイル。TS 側語彙の正本は
  `h3-kit/selection/selectionGrammar.ts` (13 keyword) + `selectionExpr.ts` (演算子・前置/後置)。
  組み込み named selection は `data/default_style.xml:445-453` (`protein`, `ligand`, `water`,
  `helix`, `sheet`, ...)。`getSelDefs` は名前のみ返す。`validateSelection` は `{ok}` のみ。
  ESLint 層規則で `worker/server` は `h3-kit` を import できない (cheat sheet は静的テキスト)。
- **panel 登録**: 左 side pane は `shell/SidePanel.tsx` の `VIEW_PANES` registry +
  `shell/ActivityBar.tsx` の `ActivityView` union。サイズ/collapse は `LayoutProvider` が
  view id キーで electron-store に永続化 (`LAYOUT_DEFAULTS` への追加は不要、`defaultSize` fallback)。
  `activeView` は `MainLayout.tsx:30` のローカル state (コマンドから開けない)。右ペインに registry 無し。
- **UI 規約**: form-kit に **複数行 textarea は無い** (先にカタログへ追加が必須)。
  Markdown renderer 依存は無い。auto-scroll の先例は `features/log/LogPanel.tsx:55-61`。
- **設定**: `features/settings/settings/settingsConfig.ts` (宣言的、control kind は
  `select|number|toggle|color|path`) と `features/settings/settings/SettingRow.tsx`。永続化は
  `IPC.UI_SAVE` -> electron-store (`shared/types/uiPrefs.ts UiState`、追加は additive のみ)。
  `safeStorage` 使用実績なし。
- **`setRendererSelection` は定型 `selKind` 6 種のみ**受け付ける (任意選択式は不可)。renderer の
  `sel` を任意文字列で書くには `setGenericProp(propName:'sel', valueType:'object<MolSelection>')`
  (`props/write.ts` が `makeSel` でコンパイル) を使う。
- RCSB URL テンプレートは renderer の `commands/useSceneCommands.ts:450-456` に直書き
  (worker から使うには shared へ移設)。

### OpenAI API 側の前提 (2026-09 時点の公式 docs / repo で確認)

- SDK `openai` 7.x: 実行時依存ゼロ、`exports` は import/require のみ、isomorphic
  (`fetch` / `AbortController` / `ReadableStream` があれば動く)。ブラウザ判定は
  `window && window.document && navigator` なので Web Worker では発火しないが、保険として
  `dangerouslyAllowBrowser: true` を付ける。中断は request option の `signal`。エラーは
  `OpenAI.APIError` 系 (`AuthenticationError` 401 / `RateLimitError` 429 / `NotFoundError` 404)。
- **Responses API を stateless に使う**: `client.responses.create({ model, instructions, input,
  tools, store: false, stream: true, reasoning?: { effort } }, { signal })` ->
  `for await (const ev of stream)`。最終 Response は `response.completed` event の `ev.response`
  (`client.responses.stream()` helper は今回 docs を取得できず未確認。実装時に存在確認し任意採用)。
- 履歴は `input` 配列: user item + 前回 `response.output` の **全 item (reasoning item の
  `encrypted_content` 含む)** + `{ type: 'function_call_output', call_id, output }`。
  `function_call` が無くなるまで繰り返す。
- **function tool**: `{ type: 'function', name, description, parameters, strict: true }`。
  strict は **全 property を `required` に列挙 + `additionalProperties: false`**、optional は
  `["string","null"]` で表す。公式推奨「1 turn で 20 未満の function」。
- **streaming event**: `response.output_text.delta` (`delta`) / `response.output_item.added|done`
  (`item`) / `response.function_call_arguments.delta|done` / `response.completed` (`response`) /
  `response.incomplete` / `response.failed` / `error`。
- **prompt caching**: 自動 (prefix 一致、1024 tok 以上)。`instructions` と `tools` (順序含む) を
  バイト一致に保ち、変化する内容は末尾 (最新 user item) に置く。`reasoning.effort` 変更で
  invalidate。ヒットは `usage.input_tokens_details.cached_tokens`。
- **モデル**: docs 上の現行は `gpt-6-astra` (flagship)、`gpt-5.6` (= `gpt-5.6-sol` alias)、
  `gpt-5.6-luna` (低コスト)、旧 `gpt-5.5`。ID は流動的なので **既定は定数 1 箇所
  (`DEFAULT_AGENT_MODEL`)** に置き、Settings で自由入力、実装時に `client.models.list()` で検証。
  `reasoning.effort` は `none|minimal|low|medium|high|xhigh|max` (既定 medium、latency 重視は `low`)。

---

## 2. アーキテクチャ概要

```
renderer (React)                          Web Worker                          main
+-------------------------+   invokeService   +---------------------------+   IPC   +------------------+
| AgentChatPane           | ----------------> | agentRunTurn (async svc)  |         | agentSecrets     |
|  useAgentSession()      |  agentRunTurn     |  - scene.startUndoTxn     |         |  safeStorage     |
|  (transcript, history,  |  agentCancelTurn  |  - loop:                  |  fetch  |  electron-store  |
|   running, turnId)      | <---------------- |     OpenAI Responses API -+-------->|  OPENAI_API_KEY  |
|                         |  'agent-progress' |     -> function_call      |  https  +------------------+
| AgentConfigContext      |  push events      |     -> tool.run(ctx,...)  |
|  (model, effort,        |                   |       = 既存 service 直呼び|
|   keyStatus, getApiKey) | <-- IPC (key) --- |  - finally commit/rollback|
+-------------------------+                   +---------------------------+
```

- **LLM 呼び出しとツール実行は worker 内** (`agentRunTurn`)。ツールは `fn(ctx, args)` の直接
  呼び出し (IPC 往復なし)。turn 全体を 1 つの undo txn で包む (worker service 内なので規約準拠)。
- **履歴 (OpenAI input items) は renderer が所有** し、毎 turn 引数で渡す。worker は turn 中の
  AbortController 以外に状態を持たない (`streamFetchToReader` と同じ形)。
- **API キーは main が保持**。renderer は送信時に `IPC.AGENT_KEY_GET` で取得し、
  `agentRunTurn` の args に載せて worker へ渡す (React state には保持しない。ディスクには暗号化済みのみ)。

---

## 3. 設計判断 (要点)

### 3.1 undo: 1 turn = 1 txn

```
scene.startUndoTxn(`AI: ${userText.slice(0, 40)}`)
turn.mutated = false
try {
  LLM loop (各 function_call で tool.run; tool.mutates && outcome.ok なら turn.mutated = true)
} finally {
  turn.mutated ? scene.commitUndoTxn() : scene.rollbackUndoTxn()
  activeTurns.delete(turnId)
}
```

- **mutating tool が 1 つでも成功したら、cancel / API エラー時も必ず commit**。理由: C++ の
  rollback は pending 編集を revert するので、途中で止めた turn を rollback するとユーザーが見た
  変更 (nesting で吸収された手動編集も) が巻き戻る。read-only だけの turn は rollback
  (空 txn の commit は redo を消すため)。
- ツール内部の `undoTxnResult` / `withUndoTxn` は nested として吸収される (C++ 仕様)。
- **既知の制約 (docs に明記する)**: turn 実行中 (LLM 応答待ち含む) にユーザーが手動で行った
  scene 編集は同じ txn に吸収される。内側の `rollbackUndoTxn` は nest を減らすだけなので、失敗した
  ツールの部分変更も outer txn に残る。緩和: (a) 実行中は composer を disable、(b) 実行中は
  Edit > Undo/Redo を無効化 (`useUndoRedoState` の enabled 計算に `turnRunning` を AND し
  `MENU_UPDATE_STATE` を false で送る)、(c) panel に「Working...」表示。E2E で問題なら
  `turnLoop.ts` の `txnGranularity: 'turn' | 'round'` を `'round'` (assistant message 単位で
  commit / start) に切り替えられる構造にしておく。

### 3.2 LLM loop (worker 内、OpenAI Responses API)

```ts
const ac = new AbortController(); activeTurns.set(turnId, ac)
const client = deps.createClient(config.apiKey)              // DI seam (tests inject a fake)
const input = [...history, userItem(snapshot, userText)]; const appended = [input.at(-1)]
scene.startUndoTxn(label)
try {
  for (let round = 0; round < maxRounds; round++) {           // MAX_ROUNDS = 16
    const stream = await client.responses.create({ model, instructions: SYSTEM_PROMPT, input,
      tools: OPENAI_TOOLS, store: false, parallel_tool_calls: true,
      reasoning: effort ? { effort } : undefined, stream: true }, { signal: ac.signal })
    let response
    for await (const ev of stream) {
      // response.output_text.delta -> push text_delta
      // response.output_item.added(function_call) -> push status 'tool'
      // response.completed | response.incomplete -> response = ev.response
      // response.failed | error -> throw
    }
    input.push(...response.output); appended.push(...response.output)   // reasoning items included
    const calls = response.output.filter(o => o.type === 'function_call')
    if (calls.length === 0 || response.status === 'incomplete') break
    for (const c of calls) { const out = await runTool(ctx, turn, c); input.push(out); appended.push(out) }
  }
  return ok({ appended, finalText, usage, mutated: turn.mutated, toolCalls })
} catch (e) {
  return ac.signal.aborted ? fail('canceled', 'canceled') : failFrom(e, 'io')   // APIError: status を文言に
} finally { ... §3.1 ... }
```

- **全ての await を try 内に置く** (unhandled rejection = worker 破棄)。`for await` を途中 break
  しない (最後まで消費するか abort する)。
- 中断: `agentCancelTurn({turnId})` -> `ac.abort()` に加え、turn 内で起動した
  `streamLoadFromUrl` の `reqId` (`${turnId}:${callId}`) を `cancelStream()` で止める。
- 結果: `Result<{ appended: AgentInputItem[]; finalText: string; usage: AgentUsage;
  mutated: boolean; toolCalls: number }>`。キャンセルは `fail('canceled', 'canceled')`。
  完了/失敗は push せず service の戻り値が契約 (`renderStart` が `complete` を push するのは
  即時 return するため。本件は turn 全体を await する)。
- renderer 側は `invokeService('agentRunTurn', args, { quiet: true })` で呼ぶ: 数十秒〜数分の turn
  が StatusBar の busy 表示と wait cursor を占有するのを避け、進捗は panel 自身が出す
  (`quiet` の用途注記「pointer-rate stream 専用」からの逸脱なので、CLAUDE.md の表に 1 行追記する)。
- キャンセルされた turn の item は履歴に追加しない (次 turn の scene snapshot が実状態を伝える)。
- APIError の写像: 401 -> `fail('Invalid API key (401). Check Settings > AI Agent.', 'invalid-args')`、
  404 -> model 不明、429 -> rate limit。キー文字列はログ・文言に出さない
  (`WorkerService.invoke` の args ログは無効化済みだが `agentRunTurn` 内でも args を log しない)。

### 3.3 tool catalog (手書き宣言)

TS 型 -> JSON Schema の自動生成ツールは workspace に無いので **手書き宣言**。`strict: true` で
API 側が入力形を保証するため、クライアント側バリデータは持たない。

```ts
interface AgentTool {
  name: string;                    // snake_case, LLM-facing
  description: string;             // includes WHEN to call it
  parameters: StrictObjectSchema;  // additionalProperties:false, every property in required
  mutates: boolean;                // drives the undo commit decision
  run(ctx: WorkerContext, input: Record<string, unknown>, turn: TurnContext): ToolOutcome | Promise<ToolOutcome>;
}
type ToolOutcome = { ok: true; data?: unknown } | { ok: false; error: string };
interface TurnContext { turnId: string; sceneId: number; viewId: number; mutated: boolean; push(ev): void }
```

- `run` が LLM 向け入力を既存 service の args に変換し (必須だが既定値で埋められる項目を補完、
  enum を写像)、`toolOutput.ts` の `normalizeServiceResult()` で 3 方言を `ToolOutcome` に正規化、
  `serializeToolOutput()` で JSON 化 (配列 truncate、8 KB cap)。Responses API に `is_error` は
  無いので `ok:false` を JSON に埋め、system prompt で「`ok:false` は失敗」と教える。
- 登録順は **name 昇順で固定** (prompt caching)。`tools/` 配下は `*.service.ts` と命名しない
  (glob 自動登録に拾われる)。

### 3.4 system prompt (`instructions`)

静的テキスト 1 本 (バイト一致でキャッシュに乗せる):
役割、原則 (ID は `<scene_state>` / `get_scene_state` の値のみ使う / 選択式は `check_selection` で
検証してから使う / `ok:false` は失敗、1 回だけ再試行 / 曖昧なら質問する / 最後に 1〜3 文で報告)、
**選択式チートシート** (静的転記: keyword `chain resid resn name elem alt bfac occ rprop aid`、
演算子 `and or not` (`& | !`)、後置 `around <d>` / `expand <d>`、前置 `byres bymainch bysidech`、
階層形 `chain.resid.aname`、クォート = 大文字小文字区別)、組み込み named selection 9 種と本体
(`protein = rprop type=prot` など)、単位 (Å)。drift はテスト T6 で `KEYWORDS` と照合して pin。
動的な **scene snapshot** は system には入れず、毎 turn の user item 先頭に
`<scene_state>...</scene_state>` として付ける (`sceneSnapshot.ts`: `getSceneTree` を flatten し
`{ viewId, objects:[{id,name,class,visible,sel?,renderers:[{id,name,type,visible}]}],
namedSelections }`、renderer 40 件で truncate。tool `get_scene_state` と共用)。

### 3.5 panel (左 side pane)

- `ActivityView` に `'agent'` を追加、`VIEW_PANES.agent = [{ id: 'chat', defaultSize: 600, render }]`。
- チャット状態 (transcript / OpenAI 履歴 / running / turnId) は **`state/agent/AgentSessionProvider`**
  に置く。side pane は view 切替や collapse で unmount されるため、pane 内 state だと会話が消える。
  同 provider の `turnRunning` を `useUndoRedoState` が読む。
- 表示: user 行 / assistant 行 (`white-space: pre-wrap`、streaming caret、Markdown なし) /
  tool 行 (名前 + `DisclosureCaret` で入力 JSON と結果 summary を折り畳み、ok/error) / error 行。
  auto-scroll は `LogPanel` の方式。
- composer: form-kit に **`TextAreaField` を新規追加** (Enter 送信 / Shift+Enter 改行、
  1〜6 行 auto-grow、サイズは `_form-kit.css` に 1 定義、CatalogPane1 に 1 例)。Send / Stop は
  `FormButton`。active scene が無ければ composer 無効。API キー未設定時は error 行 +
  「Open Settings」ボタン (`dispatch(CmdId.UiSettingsTab)`)。

### 3.6 設定と API キー

- Settings タブに category `tools.aiAgent` ("AI Agent (OpenAI)"): `agent.apiKey` (新 control kind
  `secret`: masked `TextField password` + 状態文 "Stored (....ab12)" / "Using OPENAI_API_KEY" /
  "Not set" + `FormButton Clear`)、`agent.model` (新 kind `text`、既定 `DEFAULT_AGENT_MODEL`)、
  `agent.reasoningEffort` (select `default | low | medium | high`、既定 `low`)。
- model / effort は `UiState` に additive 追加し `IPC.UI_SAVE` で保存 (`ApbsConfigContext` と同型の
  `AgentConfigContext`)。
- API キーは main の `agentKeyStore.ts` + `handlers/agentSecrets.ts`: `safeStorage.encryptString(key)`
  を base64 で electron-store の新フィールド `secrets.openaiApiKeyEnc` に保存。`GET` は復号、無ければ
  `process.env.OPENAI_API_KEY`。`safeStorage.isEncryptionAvailable()` が false なら保存を拒否して
  env 利用を案内する (平文保存はしない)。空文字 SET = clear。

---

## 4. 追加する契約行 (型契約マップ)

| 境界 | マップ | 追加行 |
|---|---|---|
| renderer <-> worker | `worker/shared/calls/agent.ts` (新スライス) + `calls/index.ts` (`ServiceMap extends AgentCalls`、`ALL_SERVICE_KEYS` に `...AGENT_KEYS`) + `calls/index.test.ts` の `SLICES` に `agent: AGENT_KEYS` | `agentRunTurn: { args: AgentRunTurnArgs; result: AgentRunTurnResult }`、`agentCancelTurn: { args: { turnId: string }; result: Result }` |
| worker -> renderer push | `worker/shared/agentTypes.ts` | `AGENT_PROGRESS_CHANNEL = 'agent-progress'`、`AgentProgressUpdate` union (`status {phase}` / `text_delta {delta}` / `tool_call {callId,name,input}` / `tool_result {callId,name,ok,mutates,summary}`、全て `turnId` 付き)、`AgentInputItem = ResponseInputItem` (type import)、`AgentConfig`、`AgentUsage`、`DEFAULT_AGENT_MODEL` |
| renderer <-> main | `shared/ipcChannels.ts` + `shared/ipcContract.ts InvokeChannels` | `AGENT_KEY_SET { req: { apiKey: string }; res: { ok: boolean; error?: string } }`、`AGENT_KEY_GET { req: void; res: { apiKey: string \| null; source: 'stored' \| 'env' \| 'none' } }`、`AGENT_KEY_STATUS { req: void; res: { source; last4: string \| null; encryptionAvailable: boolean } }` |
| 設定永続化 | `shared/types/uiPrefs.ts UiState` | `agentModel?: string; agentReasoningEffort?: 'default' \| 'low' \| 'medium' \| 'high'` (additive) |
| main store | `main/stateStore.ts StoreSchema` | `secrets?: { openaiApiKeyEnc?: string }` (additive) |
| コマンド | `commands/ids.ts` / `CommandMap.ts` | **Phase 1 では追加しない** (§10 後続) |

---

## 5. ファイル一覧

すべて `tritium/react-gui/src/` 相対。(新) = 新規、(改) = 変更。

### worker
- (新) `renderer/worker/shared/agentTypes.ts` -- channel 定数、progress union、args/result 型、`DEFAULT_AGENT_MODEL`
- (新) `renderer/worker/shared/calls/agent.ts` -- `AgentCalls` + `AGENT_KEYS`
- (新) `renderer/worker/shared/pdbUrls.ts` -- `rcsbDownloadUrl(pdbId, 'mmcif' | 'pdb')` (`useSceneCommands.ts:450-456` から移設)
- (改) `renderer/worker/shared/calls/index.ts`、`calls/index.test.ts`
- (新) `renderer/worker/server/services/agent/agent.service.ts` -- `services = { agentRunTurn, agentCancelTurn }` + `export type *`
- (新) `renderer/worker/server/services/agent/turnLoop.ts` -- loop 本体、txn、`activeTurns: Map<turnId, AbortController>`、progress push、`deps.createClient` DI
- (新) `renderer/worker/server/services/agent/openaiClient.ts` -- `createOpenAIClient(apiKey)` (`dangerouslyAllowBrowser: true`, `maxRetries: 2`)
- (新) `renderer/worker/server/services/agent/toolOutput.ts` -- 3 方言正規化 + JSON 直列化 (truncate / cap)
- (新) `renderer/worker/server/services/agent/sceneSnapshot.ts`
- (新) `renderer/worker/server/services/agent/prompt/systemPrompt.ts` / `prompt/selectionCheatSheet.ts` (静的)
- (新) `renderer/worker/server/services/agent/tools/types.ts` / `index.ts` (`AGENT_TOOLS` name 昇順、`toOpenAIFunctionTools()`)
- (新) `renderer/worker/server/services/agent/tools/{scene,selection,renderer,file,analysis}Tools.ts`
- (新) `renderer/worker/server/services/agent/tools/defaultFileOpenOptions.ts` -- `FileOpenOptions` の既定 builder (reader 既定は既存 `getReaderDefaultOptions` service から seed。実装時に確認)
- (改) `renderer/worker/client/WorkerTransport.ts` -- `agent-progress` 分岐 (APBS 分岐 L230-237 の直後) + `subscribeAgentProgress`
- (改) `renderer/worker/client/AsyncCueMol.ts` -- `subscribeAgentProgress` facade
- (改) `commands/useSceneCommands.ts` -- URL 参照先を `worker/shared/pdbUrls.ts` へ
- (改) `package.json` -- `devDependencies` に `openai` (Vite が worker chunk に束ねる。externalize しない)

### renderer (UI)
- (新) `renderer/state/agent/AgentSessionProvider.tsx` -- transcript / history / running / turnId、`useAgentSession()`、transcript reducer
- (改) `renderer/state/AppStateProviders.tsx` -- Provider 追加
- (新) `renderer/features/agent/AgentChatPane.tsx` / `AgentTranscript.tsx` / `useAgentTurn.ts` / `agent-chat.css`
- (改) `renderer/app.css` -- `@import "./features/agent/agent-chat.css"`
- (改) `renderer/shell/ActivityBar.tsx` -- `ActivityView` に `'agent'`、`buildActivityItems` に `{ id:'agent', icon:'activity.agent', label:'AI Agent' }`
- (改) `renderer/shell/SidePanel.tsx` -- `VIEW_TITLES` / `VIEW_ICONS` / `VIEW_PANES.agent`
- (改) `renderer/h3-kit/primitives/appIcons.ts` -- `activity.agent` (Phosphor `Sparkle` 等)
- (改) `renderer/__test__/activityBarDevUi.test.ts` -- item 列を pin していれば追随
- (新) `renderer/h3-kit/form/TextAreaField.tsx` + (改) `h3-kit/form/index.ts` + (改) `styles/_form-kit.css` (`.h3-form-textarea` 1 定義) + (改) `shell/CatalogPane1.tsx` (1 例)
- (改) `renderer/h3-kit/form/TextField.tsx` -- `password?: boolean` (`InputGroup type="password"`、サイズ不変)
- (改) `renderer/hooks/useUndoRedoState.ts` -- `turnRunning` 中は undo/redo enabled を false で同期
- (新) `renderer/contexts/AgentConfigContext.tsx` + (改) `renderer/index.tsx` (Provider ツリー、`ApbsConfigProvider` の隣)
- (改) `renderer/features/settings/settings/settingsConfig.ts` -- category / 3 設定 / `SettingControl` に `text` と `secret` / `AGENT_SETTING_KEYS`
- (改) `renderer/features/settings/settings/SettingRow.tsx` -- `text` / `secret` の描画
- (改) `renderer/features/settings/SettingsPane.tsx` -- 値解決 / `handleChange` に agent 分岐

### main / shared
- (改) `shared/ipcChannels.ts` / `shared/ipcContract.ts` / `shared/types/uiPrefs.ts`
- (新) `main/agentKeyStore.ts` -- `resolveApiKey({ stored, env })` 純関数、`encrypt/decrypt` (safeStorage)
- (新) `main/handlers/agentSecrets.ts` -- `registerAgentSecretHandlers()` (`handleInvoke` 3 本)
- (改) `main/ipcHandlers.ts` (登録集約点 L44-52) / `main/stateStore.ts` (`secrets` + load/save/clear)

### docs
- (新) `docs/plans/260911-ai-agent-prompt-panel-plan.md` (本書の複写) + (改) `docs/plans/_index.md`
- (改) `docs/migration/ui-style-guide.md` -- form-kit カタログ表に `TextAreaField`、`TextField password`
- (改) `tritium/CLAUDE.md` -- AsyncCueMol dispatch 表の `quiet` 行に agentRunTurn の用途を追記
- 実装完了後: (新) `docs/architecture/ai-agent-panel.md` + `_index.md` (UXP に無い新機能なので architecture 側)

---

## 6. tool カタログ初期セット (19 件、20 未満)

`objId` / `rendId` / `nodeId` は `<scene_state>` / `get_scene_state` が返す uid。`selection` は
CueMol 選択式。sceneId / viewId は `TurnContext` から補うので LLM には見せない。
optional は `["string","null"]` 等で表現 (strict)。

| tool | mutates | 呼ぶ service | adapter が補う既定値 / 変換 |
|---|---|---|---|
| `get_scene_state` | no | `getSceneTree` + `getSelDefs` | snapshot と同じ圧縮形。camera/style ノードは省く |
| `get_mol_chains {molId}` | no | `getMolChains` | そのまま |
| `get_mol_residues {molId, chain, offset\|null, limit\|null}` | no | `getMolResidues` | `residueIndex` は文字列 ("10A" あり) と説明。200 件 cap + `total/truncated` |
| `check_selection {molId, selection}` | no | `validateSelection` + `getSelHitCount` | `{valid, atomCount}`。空文字は無効扱い (`validateSelection` は空で ok:true) |
| `get_named_selections` | no | `getSelDefs` | `{global, scene, currentSel?}` |
| `get_renderer_types {objId}` | no | `getNewRendererOptions({ sourceNodeType: 'object' })` | `rendererTypes / presetTypes / defaultName` |
| `get_renderer_props {rendId}` | no | `getGenericProps({ nodeType: 'renderer' })` | container 行を除き `key/type/value/enumdef` のみ |
| `get_coloring_styles` | no | `getPaintColoringStyles` | `set_renderer_coloring` の `styleName` 候補 |
| `fetch_pdb {pdbId, format\|null, rendererType\|null, selection\|null}` | yes (async) | `streamLoadFromUrl` | URL は `pdbUrls.ts`、`readerName` mmcif/pdb、`options` は default builder、`reqId = ${turnId}:${callId}` |
| `load_file {path, rendererType\|null, selection\|null}` | yes | `getCompatibleRendererNames` -> `loadObject` | `contentFirst: false`、options default builder |
| `create_renderer {objId, rendererType, name\|null, selection\|null}` | yes | `createRendererOnObject` | type を `getNewRendererOptions` で検証、`RendererOptions` の欠損 (`objectName / rendererName / selectionEnabled / centerView / mapCenterPolicy: 'auto'`) を埋める |
| `set_renderer_selection {rendId, selection}` | yes | `setGenericProp` (`propName: 'sel'`, `valueType: 'object<MolSelection>'`, `op: 'set'`, `mode: 'commit'`) | `setRendererSelection` は定型 6 種のみのため |
| `set_mol_selection {molId, selection}` | yes | `applyMolSelString` | 空 = clear と説明 |
| `center_view {molId, selection\|null, zoom}` | yes | `centerMolSelection` / `zoomMolSelection` | `selection ?? currentSel ?? '*'`。mol.sel も書き換わる副作用を description に |
| `set_renderer_coloring {rendId, styleName}` | yes | `setRendererColoring` | `coloringId: \`style-${styleName}\``、`targetKind: 'renderer'`。`paint-type-*` 固定値は enum で別 param にしてもよい |
| `set_visible {nodeId, nodeType, visible}` | yes | `setNodeVisible` | `nodeType ∈ object \| renderer \| rendGroup` |
| `set_renderer_prop {rendId, prop, value}` | yes | `getGenericProps` で型取得 -> `setGenericProp` | `value` 文字列を `type` に応じ coerce、readonly / unknown は enumdef 付き error |
| `analyze_interactions {objId, selection, maxDist\|null, hbondOnly\|null}` | yes | `analyzeInteractions` | `useMol2:false, useSel2:false`、`minDist / maxLabels` は dialog 初期値、`rendName: 'measure'` |
| `export_image {fileName, width\|null, height\|null}` | no (scene 不変、ファイル書込) | `getSceneExportInfo` -> `exportScene` (`exporterName: 'png'`) | 入力は basename のみ (区切り文字拒否)、保存先は `os.homedir()/Desktop` 固定、結果にフルパスを返す |

### description に必ず書く曖昧点 (調査で判明)
- uid は不透明な整数。名前から推測せず `get_scene_state` で取る
- `residueIndex` は文字列 (挿入コード付きあり)
- `center_view` は選択の適用も行う
- `set_renderer_coloring` の `styleName` は `get_coloring_styles` の名前のみ有効
- `fetch_pdb` / `load_file` は新しい object と既定 renderer を作る (結果に新 objId を返す)
- `export_image` はディスクにファイルを書く (パスを結果で報告)

---

## 7. 実装フェーズ

### P0: 契約と骨組み (ビルドが通る状態)
1. `cd tritium/react-gui && pnpm add -D openai`。`task build_tritium` で worker chunk に束なることを確認
   (`grep -c "OpenAI" out/renderer/assets/worker_launcher-*.js` が 1 以上、`require("openai")` 無し)。
   Rollup が `node:*` 未解決を警告した名前だけ `electron.vite.config.ts` の `workerExternal`/`workerGlobals` へ。
2. `worker/shared/agentTypes.ts`、`calls/agent.ts`、`pdbUrls.ts`、`calls/index.ts` / `index.test.ts` の行追加。
   `agent.service.ts` は仮実装 (`fail('not implemented', 'unsupported')`) で `calls/index.test.ts` を通す。
3. `WorkerTransport.ts` に `agent-progress` 分岐 + `subscribeAgentProgress`、`AsyncCueMol.ts` facade。
4. IPC 3 チャンネル + `UiState` / `StoreSchema` の additive 追加 (main 側 handler は P3 だが型は先に)。
5. `npx tsc -p tsconfig.web.json --noEmit` / `tsconfig.node.json`。

### P1: worker agent core + 最小 tool 5 件
1. `openaiClient.ts`、`toolOutput.ts`、`sceneSnapshot.ts`、`prompt/*`。
2. `turnLoop.ts` (§3.2)。全 await を try 内に。`response.status === 'incomplete'` で loop 終了 + 注記。
3. tools: `get_scene_state`, `check_selection`, `get_renderer_types`, `set_mol_selection`, `create_renderer`。
4. main 側 `AGENT_KEY_GET` の env fallback だけ先に最小実装 (P2 の E2E で `OPENAI_API_KEY` を使うため)。
5. 検証: renderer dev console から `cm.invokeService('agentRunTurn', {...})` を叩き、`agent-progress` が
   届き、Toolbar の undo 履歴に `AI: ...` が **1 件** だけ残ることを確認。`client.models.list()` で
   `DEFAULT_AGENT_MODEL` が利用可能か確認し、必要なら定数を直す。

### P2: panel UI
1. form-kit `TextAreaField` 追加 (+ `_form-kit.css` + CatalogPane1 に 1 例 + ui-style-guide 表)。
2. `AgentSessionProvider` (transcript reducer: `text_delta` は streaming 中の assistant 行へ追記、
   `tool_call` / `tool_result` は `callId` で対応付け、`turnRunning`)。
3. `AgentChatPane` / `AgentTranscript` / `useAgentTurn` (send: `getApiKey()` -> `agentRunTurn`
   `{ quiet: true }`、stop: `agentCancelTurn`、結果 `appended` を history へ、`fail` は error 行、
   `code === 'canceled'` は "Stopped" 表示)。
4. `ActivityBar` / `SidePanel` / `appIcons` 登録。`useUndoRedoState` の enabled gating。
5. **ユーザー目視確認 (E2E)**: `task build_tritium` -> `task run_tritium`。dark/light 両テーマ。

### P3: 設定と API キー
1. main: `agentKeyStore.ts` + `handlers/agentSecrets.ts` + `stateStore.ts` の `secrets`。
2. `AgentConfigContext` + Settings category / `text` `secret` control / `SettingRow` / `SettingsPane` dispatch。
3. 未設定時の error 行 + 「Open Settings」。
4. **目視確認**: キー保存 -> 再起動後も `source: 'stored'`、Clear で `env` / `none` に戻る。

### P4: 残りの tool + prompt 調整
1. 残る 14 tool を domain ファイルに追加。各 description に §6 の曖昧点を書く。
2. 実シナリオで prompt を調整 (例: 「1CRN を読み込んで cartoon、ligand 周辺 5 Å を stick」
   「chain A を rainbow で着色」「水を非表示」「相互作用を解析」「PNG で出力」)。
3. `usage.cachedTokens` が 2 回目以降 > 0 になることを確認 (prefix 安定性)。
4. 任意: Settings に "Test connection" (`client.models.list()`)。

### P5: テスト / lint / docs (目視確認で挙動確定後)
- `cd tritium/react-gui && npm test`、`npx tsc -p tsconfig.web.json --noEmit`、
  `npx tsc -p tsconfig.node.json --noEmit`、`npm run lint`、`task lint_tritium_style`、`npm run lint:comments`。
- `docs/architecture/ai-agent-panel.md` を起こし、`docs/plans/_index.md` を「実装済み」へ。

---

## 8. テスト (最小集合、契約のみ。新規 5 ファイル / 7 件)

| # | ファイル | pin する契約 |
|---|---|---|
| T1 | `__test__/agentProgressWire.test.ts` | `WorkerTransport` が `['agent-progress', update]` を `subscribeAgentProgress` の listener へ配り、unsubscribe 後は配らない (`asyncCueMolInvoke.test.ts` の mock Worker を流用) |
| T2-T4 | `__test__/agentRunTurnService.test.ts` | fake client (`deps.createClient` 注入、round 1: function_call -> round 2: text) で: (a) mutating tool 成功 -> `AI: ...` が commit 1 回、(b) read-only のみ -> rollback で commit 0 回、(c) abort -> `code: 'canceled'` かつ mutating 済みなら commit されている。`@renderer/worker/testing` の `fakeScene` / `makeWorkerCtx` |
| T5 | `__test__/agentToolOutput.test.ts` | `it.each` で 3 方言 (`Result` fail / bare `{ok:false}` / `{ok:false,error}`) -> `ok:false` + error 文言、長大配列 truncate |
| T6 | `__test__/agentToolSchema.test.ts` | 全 tool: name 一意・昇順、`additionalProperties === false`、`required` = `Object.keys(properties)` (再帰)、件数 < 20。system prompt cheat sheet が `KEYWORDS` の全 `emit` と 9 named selection 名を含む |
| T7 | `src/main/agentKeyStore.test.ts` | `resolveApiKey`: stored 優先 -> env fallback -> none。空文字 SET = clear |
| -- | (既存) `calls/index.test.ts` | slice 追加で自動的に契約検査。新規不要 |

書かないもの: UI の見た目、`invokeService` 転送、Settings 行の描画、各 tool の service 転送。

---

## 9. 検証手順 (E2E)

1. `cd build_scripts && task build_tritium` で bundler エラーが無いこと (`openai` の worker 束ね含む)。
2. `task run_tritium` -> `launch worker OK` -> `CueMol2 nodejs add-on : INITIALIZED` -> `bindCanvas` ->
   `shader program created OK`。
3. Settings > AI Agent (OpenAI) にキーを保存 -> ActivityBar の AI Agent を開く。
4. 「1CRN を読み込んで cartoon で表示して」 -> streaming テキストと tool 行 (`fetch_pdb`,
   `create_renderer`) が出る -> 3D view に反映 -> Toolbar の undo 履歴に `AI: 1CRN を...` が **1 件**。
   Cmd+Z で一括で戻る。
5. 「chain A の残基数を教えて」 (read-only) -> undo 履歴が増えない・redo が消えない。
6. 実行中に Stop -> "Stopped" 表示。変更済みなら履歴 1 件が残る (revert されない)。
7. 誤ったキー -> 「Invalid API key (401)」の error 行 (キー文字列は表示されない)、アプリは継続 (worker 生存)。
8. 実行中に Edit > Undo が無効になっていること。
9. dark / light 両テーマで見た目確認、`task lint_tritium_style` のベースライン件数が増えない。

---

## 10. 既知の制約と後続候補

- **turn 実行中の手動編集が agent の undo に吸収される** (§3.1)。恒久策は C++ `UndoManager` に
  「直近 N txn を統合」API を足してツール毎 txn を turn 終了時に統合する案、または `Scene.qif` に
  `isInTxn` を露出して turn 開始時に他 txn が開いていたら拒否する案 (いずれも別プラン)。
- **Markdown 表示なし** (依存追加を避ける)。必要なら `react-markdown` を後続で検討。
- **メニュー / コマンドから panel を開けない**: `activeView` が `MainLayout` ローカル state。
  `LayoutProvider` へ移して `UiState.sidebarActiveView` (現状 dead) を活かし、`CmdId.UiAgentPanel` +
  `IPC.MENU_AI_AGENT` (`menuTemplate.ts` / `menuActionMap.ts` / `CommandMap.ts`) を足すのは別タスク。
- **会話履歴はセッション内のみ** (再起動で消える)。プロンプト入力履歴のみ `createLruStringHistory`
  で localStorage に残す案は任意項目。
- **provider 中立層は作らない**。`openaiClient.ts` と `turnLoop.ts` の event 処理に provider 依存を
  閉じ込め、tool 宣言は JSON Schema のまま (他 provider でも再利用可) に留める。
- **モデル ID の流動**: `DEFAULT_AGENT_MODEL` 1 箇所 + Settings 自由入力 + `models.list()` 検証。
  404 は panel にそのまま表示。
