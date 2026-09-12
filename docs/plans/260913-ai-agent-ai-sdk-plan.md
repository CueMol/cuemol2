# AI Agent plugin: Vercel AI SDK への載せ替えと prompt history (260913)

作成日: 2026-09-13。**実装済み**。実装の所在は `tritium/react-gui/src/plugins/agent/`。
仕様の説明は [`../architecture/ai-agent-plugin.md`](../architecture/ai-agent-plugin.md)。
本書は着手前の計画として残す。実装中に変えた点は末尾の「11. 実装時の差分」にまとめた。

---

## 1. Context (背景と目的)

`src/plugins/agent/` の LLM 層は `openai` SDK (Responses API) 直叩きで、provider 依存は
`worker/openaiClient.ts` と `worker/turnLoop.ts` の event 分岐に閉じている。
[`docs/architecture/ai-agent-plugin.md`](../architecture/ai-agent-plugin.md) §3.2 は
「provider 中立の抽象層は作っていない -- 2 つ目が要るまでは早すぎる」と記録しており、
その前提が今回外れた: **Anthropic など他社モデルも同じ panel から使いたい**。

自前で抽象層を書く理由はない。Vercel AI SDK (`ai` v7 + `@ai-sdk/openai` + `@ai-sdk/anthropic`) が
provider 差を吸収し、tool 定義は手書き JSON Schema のまま `jsonSchema()` で渡せ、provider 固有機能
(OpenAI の reasoning effort / Anthropic の adaptive thinking と cache control) は `providerOptions` で
落とさずに使える (前回の調査、2026-09-12)。

あわせて **prompt history** を足す。送信済み prompt をシェルのように ↑/↓ で composer に呼び戻す機能で、
原プラン (`260911` §10) で「任意項目」として先送りしたもの。

### ユーザー決定 (2026-09-13)

| 項目 | 決定 |
|---|---|
| LLM 層 | **Vercel AI SDK に載せ替え**、OpenAI と Anthropic を切り替え可能に |
| prompt history の操作 | **↑/↓ キーで呼び出し (シェル風)**。リスト UI は作らない |
| history の範囲 | **アプリ全体で共有、再起動でも残る** (localStorage、直近 50 件、LRU で重複なし) |

### 触らないもの (行数の大半)

tool 19 本の本体と JSON Schema、`systemPrompt.ts` / `selectionCheatSheet.ts`、`sceneSnapshot.ts`、
`toolOutput.ts` の 3 方言正規化、undo txn の設計 (1 turn = 1 txn、変更したら必ず commit)、
panel UI とセッション管理、push channel / prefs / secret / undo lock の host API。

### 調査で確定した事実 (codebase 側)

- **provider を知っているのは 5 ファイル + 2 テスト**: `worker/openaiClient.ts` (丸ごと置換)、
  `worker/turnLoop.ts:198-259` (`responses.create` 呼び出し、event 文字列 4 種、`function_call` フィルタ、
  `function_call_output` 組み立て L134-142、`describeApiError` L146-153)、`worker/tools/index.ts:14,44-50`
  (`OPENAI_TOOLS` を openai の `FunctionTool` 形に流す最後の 1 手)、`shared/agentTypes.ts`
  (`AgentInputItem = ResponseInputItem` L68、`DEFAULT_AGENT_MODEL` L19、`AGENT_MODEL_SUGGESTIONS` L32-37、
  `AGENT_SECRET_KEY` / `AGENT_API_KEY_ENV` L64-65)、`calls.ts:49` (`agentApiKey` 1 本)、
  `index.ts:47-89` (settings 行)。テストは `turnLoop.test.ts` (fake client を `deps.createClient` で注入、
  event 文字列 4 種に依存) と `tools/index.test.ts:62-68` (`OPENAI_TOOLS` の `type/strict` を pin)。
- **renderer は履歴を不透明な配列としてしか見ない**: `agentSessionStore.ts:47` `history: AgentInputItem[]`、
  `useAgentTurnRunner.ts:85,101` で渡して受けるだけ。型を差し替えても renderer の変更は文言のみ。
- **worker bundle は IIFE で npm 依存を inline** する (`electron.vite.config.ts` の `workerExternal` に
  npm ライブラリは無い)。`openai` と同じく `ai` / `@ai-sdk/*` も devDependencies で束なる。
  IIFE なので dynamic `import()` は分割されず、両 provider が静的に入る (それでよい)。
  `zod` は workspace に無い。
- **prompt history の部品は揃っている**: `renderer/utils/createLruStringHistory.ts`
  (`{ key, max, normalize?, guard?, readGuard? }` → `getHistory / pushHistory / removeHistory / clearHistory`、
  newest-first、同値は重複しない)。使用例 `plugins/getpdb/renderer/pdbIdHistory.ts`
  (`'cuemol.getPdbDialog.history'`, max 20) と `h3-kit/MolSelList/selHistory.ts` (max 100)。
  キー命名は `cuemol.agent.promptHistory`。
- **`TextAreaField` の `onKeyDown` は submit 以外のキーで素通しで発火する**
  (`h3-kit/form/TextAreaField.tsx:120-130`)。`AgentChatPane.tsx:74-84` は `onKeyDown` を渡していないので
  ↑/↓ recall はそこに足せる。ただし内部 `ref` は forward されておらず、recall 後にキャレットを末尾へ置くには
  `forwardRef` 化が要る (kit の小変更)。既存コードにシェル風の入力履歴 recall は無い (初出)。
- **送信文を renderer が知る唯一の場所**は `AgentChatPane.tsx:52-56` の `submit()`
  (`runner.send(draft.trim()); setDraft('')`)。history への push はここ。

### 調査で確定した事実 (AI SDK 側、2026-09-13 に配布物の `.d.ts` と docs で検証)

**バージョンと要件**: `ai@7.0.99`、`@ai-sdk/openai@4.0.66`、`@ai-sdk/anthropic@4.0.53`。**ESM only、Node >= 22**
(Electron 42 は満たす)。**`zod` は必須 peer dep** (`@ai-sdk/provider-utils` が `zod/v4` を静的 import。
`jsonSchema()` だけ使っても外せない) → `zod` も devDependencies に足す。
配布物に `import.meta` / dynamic `import()` / 静的 `node:*` import は無く、`undici` は
`process.getBuiltinModule` 経由で bundler に見えない → **worker IIFE に問題なく束なる**。

**v7 で名前が変わったもの** (v5/v6 の記憶で書くと全部外れる。公式 codemod 表あり):

| v5/v6 | v7 |
|---|---|
| `system` | **`instructions`** (`messages` 内の `role:'system'` は既定で throw: `allowSystemInMessages: false`) |
| `result.fullStream` | **`result.stream`** |
| `stepCountIs(n)` | **`isStepCount(n)`** (既定は `isStepCount(1)`) |
| `onStepFinish` / `onFinish` | `onStepEnd` / `onEnd` (+ `onAbort`, `onError`) |
| `result.response.messages` / `totalUsage` | **`await result.responseMessages`** (全 step の assistant/tool メッセージ) / **`await result.usage`** (全 step 合計) |
| `usage.cachedInputTokens` | **`usage.inputTokenDetails.cacheReadTokens`** (`inputTokens` / `outputTokens` / `totalTokens` / `outputTokenDetails.reasoningTokens`) |
| `MockLanguageModelV2/V3` | **`MockLanguageModelV4`** (`ai/test`)。`simulateReadableStream` は **`ai`** から |
| `experimental_repairToolCall` | `repairToolCall` |

**tool**: `tool({ description, inputSchema: jsonSchema<T>(schema), execute(input, { toolCallId, messages, abortSignal }), strict?, providerOptions? })`。
`execute` は async 可・任意の JSON 値を返せる。**throw すると `tool-error` part になり loop は続く**
(Anthropic には `is_error: true` で渡る)。

**stream part** (`result.stream`): `text-delta { id, text }` (`textDelta` ではない)、`tool-call { toolCallId, toolName, input }`、
`tool-result { toolCallId, toolName, input, output }`、`tool-error { ..., error }`、`finish-step { usage, finishReason }`、
`finish { finishReason, totalUsage }`、`error { error }`、`abort { reason? }`。
**復旧可能な provider エラーは `error` part で届き throw しない** (throw するのは stream を止める致命エラーだけ)。
**abort は `{type:'abort'}` を流して close する** -- `for await` は正常終了し throw しない。`onAbort` は呼ばれ `onEnd` は呼ばれない。

**OpenAI provider**: 既定が Responses API (`openai(id)` = `openai.responses(id)`)。
`providerOptions.openai = { store: false, include: ['reasoning.encrypted_content'], reasoningSummary: null, strictJsonSchema (既定 true) }`。
reasoning part は `providerMetadata.openai.{ itemId, reasoningEncryptedContent }` を持ち、`responseMessages` を送り返せば再生される。
v7 は `reasoningEffort` 指定時に `reasoningSummary` が `'detailed'` 既定になる → 要らないので `null`。

**Anthropic provider**: `createAnthropic({ apiKey, headers })`。**`anthropic-dangerous-direct-browser-access: true` は provider が付けない**ので
自分で `headers` に足す (renderer/worker origin からの直接呼び出しに必要)。
`providerOptions.anthropic = { thinking: { type: 'adaptive' }, effort?: 'low'|'medium'|'high'|'xhigh'|'max' (thinking の兄弟), cacheControl: { type: 'ephemeral' }, sendReasoning (既定 true), thinking.blockBinding.prefixMismatchBehavior: 'error'|'drop_block' }`。
cacheControl は system message / content part / `tool({ providerOptions })` の 3 箇所に置ける。
cache のヒットは `usage.inputTokenDetails.cacheReadTokens`。

**portable な reasoning**: top-level `reasoning: 'none'|'minimal'|'low'|'medium'|'high'|'xhigh'` (v7 新設)。
`providerOptions.openai.reasoningEffort` を書くと **top-level は無視される** (merge されない)。

**provider をまたぐ履歴**: OpenAI の encrypted reasoning と Anthropic の thinking signature はそれぞれの `providerOptions` キーに入り、
相手側は読まない。**別 provider が作った reasoning part を渡したときの挙動は未文書** → provider が変わったら reasoning part を落とす。

**モデル文字列**: `createProviderRegistry` は存在し区切りは `:`。ただし **`streamText` に素の文字列 (`'anthropic/claude-opus-5'`) を渡すと
Vercel AI Gateway 経由にルーティングされる** → 必ず `createOpenAI({ apiKey })(modelId)` / `createAnthropic(...)(modelId)` で model を作る。

**エラー**: `APICallError.isInstance(e)` + `.statusCode` (`instanceof` ではなく symbol brand の `isInstance` を使う。bundle 二重化に強い)。
retry を使い切ると `RetryError`。stream 途中の provider エラーは `StreamProviderError { statusCode }`。
abort 判定は `isAbortError()` (`@ai-sdk/provider-utils`)。`AbortError` クラスは無い。

**未確定 (実装時に wire で確認)**: `tool({ strict })` と `providerOptions.openai.strictJsonSchema` の優先関係、
Anthropic `effort` の置き場 (schema は thinking の兄弟、docs の断片は入れ子で食い違う。schema を信じる)。

---

## 2. アーキテクチャ概要

```
renderer                                          Web Worker
+-- plugins/agent/renderer ----------------+   invokePluginService   +-- plugins/agent/worker ----------------------+
| AgentChatPane                             | ----------------------> | plugin.agent.runTurn                         |
|  composer: TextAreaField                  |   { quiet: true }       |  turnLoop.ts                                 |
|   ↑/↓ = promptHistory recall (new)        | <---------------------- |   model = createModel(spec, apiKey)  (new)   |
|   submit -> pushHistory(text) (new)       |   [plugin-channel.      |   streamText({ model, system, messages,      |
| useAgentTurnRunner                        |    agent.progress, u]   |     tools: AI_SDK_TOOLS, stopWhen, abort })  |
|   parseModelSpec(prefs.model) (new)       |                         |   for await (part of result.stream) -> push  |
|   apiKey = agentApiKeys[provider].get()   |                         |   appended = response.messages (ModelMessage)|
|   history: ModelMessage[] (type changes)  |                         |  1 turn = 1 undo txn (unchanged)             |
+-------------------------------------------+                         +----------------------------------------------+
promptHistory.ts (new): createLruStringHistory('cuemol.agent.promptHistory', 50)
```

- **provider の選択はモデル文字列で決まる**: Settings の Model は `openai:gpt-5.6` /
  `anthropic:claude-opus-5` のように `provider:model` で書く (AI SDK の registry 記法)。
  prefix 無しの id は **OpenAI とみなす** (既に保存されている `gpt-5.6` を壊さない)。
  provider 用の別 select は作らない -- モデルと provider の不一致という状態を作らないため。
- **API キーは provider ごと**: `openaiApiKey` (`OPENAI_API_KEY`) と `anthropicApiKey`
  (`ANTHROPIC_API_KEY`) の 2 secret。送信時に parse した provider のキーだけ読む。
- **履歴の型は `ModelMessage[]`** (AI SDK の共通形)。provider を途中で切り替えても同じ配列を
  送り返せる (provider 固有の reasoning part の扱いは調査結果で確定する)。

---

## 3. 設計判断 A: LLM 層 (AI SDK)

### A1. `shared/modelSpec.ts` (新、純関数) と `worker/modelProvider.ts` (新、`openaiClient.ts` の後継)

`parseModelSpec` は renderer も使う (provider ごとの secret を選ぶため) ので **SDK を import しない `shared/`** に置き、
SDK に触る `createModel` / `providerOptionsFor` / `describeApiError` を `worker/` に置く。

```ts
// shared/modelSpec.ts
export type Provider = 'openai' | 'anthropic'
export interface ModelSpec { provider: Provider; modelId: string }
/** `provider:model`。prefix 無しは openai (既存の保存値 `gpt-5.6` を壊さない)。未知 prefix は error。 */
export function parseModelSpec(raw: string): ModelSpec | { error: string }
/** 別 provider が作った reasoning part を落とす (assistant message の reasoning part で
 *  `providerOptions[provider]` を持たないもの)。ワイヤ変更なし・切替 2 回でも正しい・純関数。 */
export function sanitizeHistory(history: ModelMessage[], provider: Provider): ModelMessage[]

// worker/modelProvider.ts
/** 素の文字列を streamText に渡すと Gateway 経由になるので、必ずここで LanguageModel を作る。 */
export function createModel(spec: ModelSpec, apiKey: string): LanguageModel
//   openai:    createOpenAI({ apiKey })(modelId)
//   anthropic: createAnthropic({ apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(modelId)

/** provider ごとの固定オプション。turn ごとに変わる値 (effort) は top-level `reasoning` で渡す。 */
export function providerOptionsFor(spec: ModelSpec): ProviderOptions
//   openai:    { openai: { store: false, include: ['reasoning.encrypted_content'], reasoningSummary: null } }
//   anthropic: { anthropic: { thinking: { type: 'adaptive',
//                             blockBinding: { prefixMismatchBehavior: 'drop_block' } } } }   // Claude 間の切替で署名不一致を吸収
//   (reasoningEffort は providerOptions に書かない: 書くと top-level `reasoning` が無視される。
//    strict も tool({ strict: true }) だけに書き、providerOptions.openai.strictJsonSchema は既定に任せる)

export function describeApiError(e: unknown, spec: ModelSpec): string
//   RetryError -> 最後のエラーを剥がす / APICallError.isInstance / StreamProviderError の statusCode:
//   401 -> "Invalid <Provider> API key (401). Check Settings > Plugins > AI Agent."
//   404 -> "Unknown model <modelId> (404). ..."   429 -> rate limit    それ以外 -> message

export type CreateModel = typeof createModel   // turnLoop の DI seam (テストは MockLanguageModelV4 を返す)
```

`ReasoningEffort` の写像: `'default'` → `reasoning` を渡さない、`low|medium|high` → top-level `reasoning` にそのまま。
両 provider で同じ 3 段を使うが体感は揃わない (§10)。

`AGENT_MODEL_SUGGESTIONS` (両 provider、label に provider を含める):

| value | label |
|---|---|
| `openai:gpt-6-astra` | OpenAI, most capable |
| `openai:gpt-5.6` | OpenAI, flagship (既定) |
| `openai:gpt-5.6-terra` | OpenAI, balanced |
| `openai:gpt-5.6-luna` | OpenAI, lowest cost |
| `anthropic:claude-opus-5` | Anthropic, most capable |
| `anthropic:claude-sonnet-5` | Anthropic, balanced |
| `anthropic:claude-haiku-4-5` | Anthropic, lowest cost |

### A2. `worker/tools/index.ts`: `OPENAI_TOOLS` → `buildAiSdkTools(tools, ctx, turn): ToolSet`

`AgentTool` (`tools/types.ts`) と 19 本の本体は不変。turn ごとに `tool({ description, inputSchema: jsonSchema(t.parameters), strict: true, execute })`
の record を組む。**tool の一覧を引数で受ける**ので、テストは `vi.mock` なしで fake tool を差し込める。

`execute(input, { toolCallId })` の契約:
- `t.run(ctx, input, { ...turn, callId: toolCallId })` を呼ぶ。`fetch_pdb` の `reqId = ${turnId}:${callId}` はそのまま動く。
- `t.mutates && outcome.ok` で `turn.mutated = true` を立てる (**`mutated` が立つ唯一の場所**)。
- 結果を `turn.outcomes.set(toolCallId, outcome)` に記録する (progress の `tool_result` はストリーム側で出す。後述)。
- **`serializeToolOutput(outcome)` の文字列をそのまま返す**。SDK は文字列を `{ type: 'text' }` output として
  OpenAI `function_call_output.output` / Anthropic `tool_result.content` に載せるので、モデルが見るバイト列は現行と同一。
  8 KB cap の手組み JSON (`toolOutput.ts:101-108`) と `toolOutput.test.ts` もそのまま。
- **`ok:false` で throw しない**。throw は SDK の `tool-error` (`error-text`) になり `{ok:false,error}` の構造と
  system prompt の契約が崩れる上、OpenAI 側には `is_error` が無いので provider 間で挙動が分岐する。
  `tool-error` part は SDK 由来 (`NoSuchToolError` / `InvalidToolInputError`) だけに現れる状態にしておく。
  現行 `turnLoop.ts:113-114` の「no tool called」分岐は SDK が代替するので削除。
- **逐次実行を維持する**: SDK は同一 step の tool を並行に `execute` する。全部 worker スレッドなので await 点でしか
  交錯しないが、ダウンロード中に renderer 生成が走る順序が現行と変わる。`turn.queue` (promise chain) で直列化。
- **`turn.inflight: Set<Promise>` に登録**する。abort 時に SDK は進行中の `execute` を待たずに stream を閉じるため、
  loop 側がこれを `await Promise.allSettled` してから txn を閉じる (A3)。

### A3. `worker/turnLoop.ts`: 手書き loop → `streamText` + `isStepCount`

undo txn の外枠 (`startUndoTxn` → try → finally commit-if-mutated else rollback)、`activeTurns`、
`turnStreams` / `noteStream`、`cancelTurn` は不変。中身のスケッチ:

```ts
const spec = parseModelSpec(args.model)                                   // error なら fail('invalid-args')
const turn: TurnContext = { ...現行, outcomes: new Map(), inflight: new Set(), queue: Promise.resolve() }
const userItem: ModelMessage = { role: 'user', content: `${snapshot}\n\n${args.userText}` }
const messages = withCacheBreakpoint(spec, [...sanitizeHistory(args.history, spec.provider), userItem])

let finalText = '', toolCalls = 0, finishReason = '', failure: unknown = null, canceled = false
scene.startUndoTxn(undoLabel(args.userText))
try {
  const result = streamText({
    model: deps.createModel(spec, args.apiKey),
    instructions: SYSTEM_PROMPT, messages,
    tools: buildAiSdkTools(deps.tools ?? AGENT_TOOLS, ctx, turn),
    stopWhen: isStepCount(MAX_ROUNDS), abortSignal: controller.signal,
    ...(args.reasoningEffort === 'default' ? {} : { reasoning: args.reasoningEffort }),
    providerOptions: providerOptionsFor(spec),
    onError: () => {},                                                     // SDK 既定の console 出力を止める
  })
  for await (const part of result.stream) {                               // 全経路で末尾まで消費 (break しない)
    switch (part.type) {
      case 'start-step':  push status 'thinking'
      case 'text-start':  if (finalText) 区切り '\n\n' を足して push   // Anthropic は text→tool→text と出す
      case 'text-delta':  finalText += part.text; push text_delta
      case 'tool-call':   toolCalls++; push status 'calling-tools'; push tool_call { input: JSON.stringify(part.input) }
      case 'tool-result': o = turn.outcomes.get(part.toolCallId); push tool_result { ok: o?.ok, summary: summarizeOutcome(o) }
      case 'tool-error':  push tool_result { ok: false, summary: errorMessage(part.error) }   // SDK 由来のみ
      case 'error':       failure ??= part.error                           // 復旧可能エラーは throw せずここに来る
      case 'abort':       canceled = true                                  // abort も throw しない
      case 'finish':      finishReason = part.finishReason
    }
  }
  await Promise.allSettled(turn.inflight)                                  // abort で取り残された execute を待つ
  if (canceled || controller.signal.aborted) return fail('canceled', 'canceled')
  if (failure !== null) return fail(describeApiError(failure, spec), 'io')
  // 成功経路でだけ await する: abort/error 後の usage / responseMessages は reject か pending になり得る
  const [responseMessages, usage] = await Promise.all([result.responseMessages, result.usage])
  return ok({
    appended: [userItem, ...responseMessages],                             // userItem は cacheControl 無しの素の方
    finalText, toolCalls, mutated: turn.mutated,
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0,
             cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0 },
    roundLimitHit: finishReason === 'tool-calls',
  })
} catch (e) {
  if (controller.signal.aborted || isAbortError(e)) return fail('canceled', 'canceled')
  return fail(describeApiError(e, spec), 'io')
} finally { turn.mutated ? scene.commitUndoTxn() : scene.rollbackUndoTxn(); activeTurns/turnStreams を消す }
```

- **progress の `tool_result` はストリーム part から push する** (`execute` からではなく)。`execute` から push すると、
  消費側がまだ `tool-call` part を処理していない時点で `tool_result` が届き得て、store は `callId` 一致かつ `ok === null`
  のエントリにしか結果を当てない (`agentSessionStore.ts:149-153`) ので捨てられ「running...」のまま残る。
- `tool-call` の `input` は **オブジェクト** (provider chunk は文字列だが `streamText` レベルでパース済み)。
  progress の `input` は `string` なので `JSON.stringify`。
- `TurnDeps = { createModel: CreateModel; tools?: readonly AgentTool[] }`。

**Anthropic の cacheControl** (`withCacheBreakpoint`): 送信直前に **最後の message (userItem のコピー)** に
`providerOptions.anthropic.cacheControl = { type: 'ephemeral' }` を付ける。breakpoint はそこまでの prefix 全部
(tools → system → 全履歴) を対象にし、次 turn では同じ message が履歴に残るので prefix 一致でヒットする。
「最後の tool に付ける」案は tools ブロックしかキャッシュしない (system は tools の後) ので不適。
履歴に保存する `appended[0]` は `providerOptions` 無しの素の `userItem` にして OpenAI 側の履歴をバイト同一に保つ。
OpenAI は `providerOptions.anthropic` を無視するので分岐は provider 判定 1 箇所。ヒットは `cacheReadTokens` で確認。

### A4. `shared/agentTypes.ts`

- `AgentInputItem = ModelMessage` (`import type { ModelMessage } from 'ai'`。renderer も load するが type-only)
- `DEFAULT_AGENT_MODEL = 'openai:gpt-5.6'`、`AGENT_MODEL_SUGGESTIONS` は A1 の表
- `AGENT_SECRETS: Record<Provider, { key: string; envVar: string }>` =
  `{ openai: { openaiApiKey, OPENAI_API_KEY }, anthropic: { anthropicApiKey, ANTHROPIC_API_KEY } }`
- `ReasoningEffort` は据え置き。`AgentRunTurnArgs` / `AgentTurnOutcome` は型が変わるだけでフィールドは不変
  (`historyProvider` のような追加は不要 -- `sanitizeHistory` が part 単位で判定する)
- `TurnContext` (`tools/types.ts`) に `outcomes` / `inflight` / `queue` を追加

### A5. `calls.ts` / `index.ts` / `useAgentTurnRunner.ts`

- `agentApiKeys: Record<Provider, PluginSecret>` (`definePluginSecret` を provider ごとに)
- settings: `model` combo の候補を A1 の表に、`anthropicApiKey` secret 行を追加、plugin 名を 'AI Agent' に、
  description / secret 行の説明から OpenAI 固定の文言を落とす
- runner: `parseModelSpec(prefs.model)` → error なら error 行、OK なら `agentApiKeys[provider].get()` →
  無ければ「Anthropic API key を Settings > Plugins > AI Agent で」と**行を名指し**した error 行 (`needsApiKey`)

### A6. エラー写像 (`describeApiError(e, spec)`)

`RetryError.isInstance(e)` なら最後のエラーを剥がし、`APICallError.isInstance` / `StreamProviderError` の
`statusCode` で分岐: 401/403 → "Invalid <provider> API key"、404 → "Unknown model <modelId>"、429 → rate limit、
529 → Anthropic overloaded、それ以外は message。plain `Error` は retry で包まれないので `instanceof Error` 分岐も持つ。
abort は `abort` part / `controller.signal.aborted` / `isAbortError(e)` の 3 経路で `canceled`。

---

## 4. 設計判断 B: prompt history (↑/↓ recall)

### B1. `renderer/promptHistory.ts` (新)

```ts
const store = createLruStringHistory({ key: 'cuemol.agent.promptHistory', max: 50 })
export const { getHistory, pushHistory, clearHistory } = store

/** Readline-style browsing state. Pure, so the step rules are testable without a DOM. */
export interface RecallState { index: number | null; stashedDraft: string }
export const IDLE: RecallState = { index: null, stashedDraft: '' }
export function recallUp(state, draft, history): { state; draft } | null    // null = nothing to recall
export function recallDown(state, history): { state; draft } | null
```

- `pushHistory` は **送信時** (`AgentChatPane.submit`)。失敗した turn の prompt も残す
  (シェルと同じ。言い直すために呼び戻すのが典型)。
- 重複は `createLruStringHistory` が畳む (同文は先頭へ移動)。`normalize` は既定の `trim`。

### B2. `AgentChatPane.tsx`: ↑/↓ の判定

`TextAreaField` に `onKeyDown` を渡す。**発火条件を絞る**のが要 (複数行の編集で矢印キーを奪わない):

- ArrowUp: `value.slice(0, selectionStart)` に `\n` が無い (キャレットが先頭行) とき recall。
- ArrowDown: `value.slice(selectionEnd)` に `\n` が無い (最終行) とき、かつ browsing 中のみ。
- 修飾キー付き・IME 中 (`isImeKey`) は素通し。
- recall したら `e.preventDefault()`、draft を差し替え、キャレットを末尾へ。
- `onChange` (ユーザーの打鍵) で browsing を解除 (`index = null`)。編集を失わない単純な規則。
- 送信で `pushHistory` + `IDLE` に戻す。
- placeholder に「↑ for previous prompts」を添える (リスト UI を作らない分の発見性)。

### B3. `h3-kit/form/TextAreaField.tsx`: `forwardRef`

recall 後にキャレットを末尾へ置くため `React.forwardRef<HTMLTextAreaElement>` にする
(内部 `ref` と統合、既存 props 不変)。kit の他の入力部品と揃う小変更。

---

## 5. 追加する契約行

| 境界 | マップ | 追加 / 変更 |
|---|---|---|
| renderer ↔ worker | `plugins/agent/calls.ts` `AgentCalls` | 行は不変 (`runTurn` / `cancelTurn`)。`AgentRunTurnArgs.history` と `AgentTurnOutcome.appended` の型が `ModelMessage[]` に |
| worker → renderer push | `shared/agentTypes.ts` `AgentProgressUpdate` | 不変 |
| secrets | `calls.ts` `agentApiKeys` | `definePluginSecret(id, 'anthropicApiKey', { envVar: 'ANTHROPIC_API_KEY' })` を追加 |
| settings | `index.ts` manifest | `model` 候補の差し替え、`anthropicApiKey` secret 行 |
| prefs | `UiState.pluginPrefs.agent.model` | 値の形が `provider:model` に。prefix 無しは openai と読む (additive) |
| localStorage | `cuemol.agent.promptHistory` | 新規キー (string[]、newest-first) |
| deps | `package.json` devDependencies | `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, **`zod`** (必須 peer) を追加、`openai` を削除 |

---

## 6. ファイル一覧 (`tritium/react-gui/src/` 相対)

### plugin
- (新) `plugins/agent/shared/modelSpec.ts` -- A1 (`parseModelSpec`, `sanitizeHistory`; SDK import なし)
- (新) `plugins/agent/worker/modelProvider.ts` -- A1 (`createModel`, `providerOptionsFor`, `describeApiError`)
- (削) `plugins/agent/worker/openaiClient.ts`
- (改) `plugins/agent/worker/turnLoop.ts` -- A3
- (改) `plugins/agent/worker/tools/index.ts` -- A2 (`OPENAI_TOOLS` → `buildAiSdkTools`)
- (改) `plugins/agent/worker/tools/types.ts` -- `TurnContext` に `outcomes` / `inflight` / `queue`
- (不変) `plugins/agent/worker/toolOutput.ts` -- `serializeToolOutput` の文字列をそのまま `execute` の戻りに使う
- (改) `plugins/agent/shared/agentTypes.ts` -- A4
- (改) `plugins/agent/calls.ts`, `plugins/agent/index.ts`, `plugins/agent/renderer/useAgentTurnRunner.ts` -- A5
- (新) `plugins/agent/renderer/promptHistory.ts` -- B1
- (改) `plugins/agent/renderer/AgentChatPane.tsx` -- B2
- (改) `plugins/agent/renderer/agentSessionStore.ts` -- コメントの型名のみ
- (改) `plugins/agent/worker/turnLoop.test.ts`, `plugins/agent/worker/tools/index.test.ts` -- §7
- (新) `plugins/agent/shared/modelSpec.test.ts`, `plugins/agent/renderer/promptHistory.test.ts` -- §7

### host (最小)
- (改) `renderer/h3-kit/form/TextAreaField.tsx` -- B3 (`forwardRef`)
- (改) `package.json` (+ `pnpm-lock.yaml`)

### docs
- (新) `docs/plans/260913-ai-agent-ai-sdk-plan.md` (本書) + (改) `docs/plans/_index.md`
- (改) `docs/architecture/ai-agent-plugin.md` -- §2 図、§3.2 (provider 層 = AI SDK、抽象層を自前で持たない理由を更新)、§6 設定表、§7 制約 (prompt history)
- (改) `docs/plans/260912-ai-agent-plugin-plan.md` §10 -- 「provider 中立層なし」「会話履歴はセッション内のみ」に本書への参照を添える

---

## 7. テスト (契約のみ、新規・変更あわせて 6 ファイル)

| # | ファイル | pin する契約 |
|---|---|---|
| T1-T3 | `worker/turnLoop.test.ts` (書き換え) | `MockLanguageModelV4` を `deps.createModel` で、fake tool を `deps.tools` で注入 (`vi.mock` 不要)。現行 3 契約をそのまま: (a) mutating 成功 → `scene.undo.committed === ['AI: ...']`、(b) read-only → rollback、(c) 2 step 目の `doStream` が reject しても 1 step 目の変更は commit (`error` part になるか throw になるかに依存しない: `result.ok === false` と undo log だけを見る)。(a) に追加で `model.doStreamCalls[0].tools` が全 tool を名前順で `strict: true` で持つこと (provider が実際に受け取る形) と、`pushMessage` の順が `tool_call` → `tool_result` であること |
| T4 | `worker/tools/index.test.ts` (1 `it` 差し替え) | `buildAiSdkTools(AGENT_TOOLS, ctx, turn)` の `Object.keys` が全 tool 名 (`OPENAI_TOOLS` の `type/strict` assertion の後継)。schema 形は既存の `AGENT_TOOLS` 側の検査に任せ重複させない |
| T5 | `shared/modelSpec.test.ts` (新) | `parseModelSpec`: `anthropic:claude-opus-5` → anthropic、`gpt-5.6` (prefix 無し) → openai、未知 prefix → error。`sanitizeHistory`: openai の reasoning part を持つ assistant message を anthropic 向けに通すと reasoning part だけ落ち、text / tool-call part は残る |
| T6 | `renderer/promptHistory.test.ts` (新) | `recallUp` / `recallDown` の readline 規則: 空 draft から ↑ で最新、↑↑ で 1 つ前、↓ で戻り、最後の ↓ で stash した下書きに復帰、履歴が無ければ null |

mock の chunk 列 (T1): step 1 = `stream-start` → `tool-input-start/delta/end` → `tool-call { input: '{}' }` →
`finish { finishReason: { unified: 'tool-calls' }, usage }`、step 2 = `stream-start` → `text-start/delta/end` →
`finish { unified: 'stop' }`。`doStream` はカウンタで毎回新しい `simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null })`
を作る (`mockValues` は同じ ReadableStream を返すので消費済みを再利用して壊れる)。usage は provider 形
`{ inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total, text, reasoning } }`。

書かないもの: `streamText` の転送、`jsonSchema()` の写し、↑/↓ の DOM イベント配線 (B2 の発火条件は
`recallUp/Down` の純関数と `TextAreaField` の既存テストで十分)、Settings 行の描画、`describeApiError` の文言。

---

## 8. 実装フェーズ

### P0: 依存とビルド
1. `cd tritium/react-gui && pnpm add -D ai @ai-sdk/openai @ai-sdk/anthropic zod && pnpm remove openai`。
2. `task build_tritium`: worker chunk に `streamText` が inline され、`require("ai")` が無いこと。
   bundle 増分 (`zod` + `@ai-sdk/gateway` が静的に入る。+400-700 KB minified 見込み) を記録する。

### P1: worker の載せ替え (OpenAI のまま動かす)
1. `shared/modelSpec.ts`、`worker/modelProvider.ts`、`tools/index.ts` の `buildAiSdkTools`、`tools/types.ts` の `TurnContext` 拡張。
2. `turnLoop.ts` を `streamText` に (A3)。`agentTypes.ts` の型差し替え。
3. `turnLoop.test.ts` / `tools/index.test.ts` を mock model 版に、`modelSpec.test.ts` 追加。
4. 検証: 既存の OpenAI キーで「1CRN を読み込んで cartoon」が従来どおり動き、undo 履歴 1 件、
   `usage.cachedTokens` が 2 turn 目以降 > 0。**wire で確認するもの**: `tool({ strict: true })` が実際に
   `strict: true` で送られている、top-level `reasoning` が `providerOptions.openai` に他キーがあっても効いている。
   実行中 Stop → 走っていた `fetch_pdb` が txn 内で終わってから commit/rollback される (A2 の `inflight`)。

### P2: Anthropic を通す
1. secret / settings 行 / runner の provider 分岐 (A5)、`withCacheBreakpoint` (A3)。
2. 検証: `anthropic:claude-opus-5` で同じシナリオ。top-level `reasoning` が Anthropic 側で `thinking` / `effort` に
   写っているか `@ai-sdk/anthropic` のリクエストで確認 (写らなければ `providerOptionsFor` で `effort` を足す)。
   2 turn 目で `cacheReadTokens > 0`。
3. 途中で provider を行き来しても会話が続く (`sanitizeHistory` が reasoning part を落とす)。OpenAI の `call_...` /
   Anthropic の `toolu_...` の toolCallId が相手に受理されるか、切替直後の 1 turn を手で確認 (未検証項目)。

### P3: prompt history
1. `promptHistory.ts`、`TextAreaField` の `forwardRef`、`AgentChatPane` の ↑/↓。
2. 検証: 送信 → 再起動 → ↑ で戻る。複数行の下書き内で ↑/↓ が奪われない。IME 変換中の ↑/↓ が候補選択のまま。

### P4: テスト・lint・docs
`npm test`、`tsc` x2、`npm run lint`、`task lint_tritium_style`、`npm run lint:comments`、§6 docs。

---

## 9. 検証手順 (E2E)

1. `task build_tritium` → `task run_tritium` で起動チェーンが通る。
2. Settings > Plugins > AI Agent: Model 候補に両 provider が並び、`anthropicApiKey` 行がある。
3. OpenAI (`openai:gpt-5.6`) で「1CRN を読み込んで cartoon で表示して」→ 従来どおり。
4. `anthropic:claude-opus-5` に切り替え、「chain A を rainbow に」→ tool 呼び出しと streaming が出る。
   Anthropic キー未設定なら「Anthropic API key を Settings で」と名指しの error 行。
5. 同じ会話で provider を行き来しても続く (または P2 で決めた挙動)。
6. prompt を 3 つ送る → ↑↑ で 2 つ前、↓ で最新、↓ で空 (または打ちかけの下書き) に戻る。
   再起動後も ↑ で残っている。複数行の下書きの 2 行目で ↑ を押しても recall されない。
7. Cmd+Enter 送信、IME 変換確定、Stop、実行中 Undo 無効、の従来の挙動が変わっていない。

---

## 10. 既知の制約と後続候補

- **provider 切り替え時に chain of thought は引き継がれない**: 別 provider の reasoning part は
  `sanitizeHistory` が落とす (渡したときの挙動が未文書のため)。text と tool 呼び出しの履歴は残る。
- **`reasoningEffort` の意味は provider で異なる** (OpenAI: Responses の reasoning effort、Anthropic: adaptive
  thinking + effort)。同じ 3 段を top-level `reasoning` で写像するが、体感は揃わない。
- **Anthropic の refusal fallback** (`fallbacks`) は `providerOptions.anthropic.fallbacks` として schema にある。
  今回は使わない (Opus 5 の既定挙動で十分、必要になったら 1 行)。
- **`execute` の失敗は `ok:false` の payload** で、Anthropic の `is_error: true` は使わない (provider 間で
  挙動を揃えるため。§3 A2)。
- **abort で進行中の tool を待つ分だけ Stop の反応が遅れる** (`inflight` の `allSettled`)。`cancelTurn` が
  先にダウンロードを切るので通常は短い。
- **worker bundle が `zod` と `@ai-sdk/gateway` の分だけ増える** (tree-shake 不可。P0 で実測)。
- **history は prompt 文字列のみ** (会話全体は依然セッション内)。
- **未検証**: OpenAI / Anthropic 間で toolCallId (`call_...` / `toolu_...`) が相互に受理されるか (P2 で確認)。


---

## 11. 実装時の差分 (計画 -> 実装)

プランどおりに入った部分は省き、変えた判断だけ残す。

- **`isAbortError` を使わなかった**。`@ai-sdk/provider-utils` は直接の依存ではなく (transitive)、
  そこから import すると宣言していないパッケージに依存することになる。AbortController は
  `turnLoop` 自身が所有していて `cancelTurn` 以外から abort されないので、`signal.aborted` が
  そのまま権威になる。
- **`ProviderOptions` 型を `streamText` の引数から導出した**。`ai` は型を宣言しているが export して
  いない。`@ai-sdk/provider` に手を伸ばすより、`Parameters<typeof streamText>[0]['providerOptions']`
  で取るほうが依存が増えない。
- **`NEWLINE` 定数** (`AgentChatPane`)。キャレット位置の判定で改行を探すが、`'\n'` は編集のたびに
  実改行へ化ける事故が起きたので `String.fromCharCode(10)` に固定した。
- **worker bundle は +815 KB** (計画の見積もり 400-700 KB をやや超過)。`zod` と `@ai-sdk/gateway` が
  静的に入るため。1.45 MB -> 2.27 MB。
- **`AGENT_MODEL_SUGGESTIONS` は手書きのまま**。実装中に「provider からモデル一覧を取れないか」を
  再調査したところ、**Anthropic の `/v1/models` は `capabilities` を返すようになっていた**
  (`thinking.types.adaptive` / `effort` / `structured_outputs` / `max_input_tokens`) が、
  OpenAI は今も `id` / `created` / `owned_by` / `shutdown_date` だけで能力メタデータが無い。
  片方だけ正確な一覧になり、かつ**どちらもキー未設定では何も出せない**ので、今回は見送った。
  後続でやるなら「候補は手書きのまま、キーがある provider だけ Settings の Refresh で上書き」の形
  (worker service 1 本 + settings に動的 options を供給する host 拡張)。
