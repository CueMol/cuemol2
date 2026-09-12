# AI Agent plugin (tritium) (日本語)

自然言語の指示から LLM が既存の worker service を呼んでシーンを組み立てる
チャット panel。`tritium/react-gui/src/plugins/agent/` の built-in plugin
([tritium plugin](tritium_plugin/_index.md))。**既定オフ**で、Settings > Plugins から
opt-in する。

UXP に無い新機能なので migration ADR ではなくここに置く。着手前の計画は
[`../plans/260912-ai-agent-plugin-plan.md`](../plans/260912-ai-agent-plugin-plan.md)。

---

## 1. 何を解決するか

tritium には 235 個の worker service (`fn(ctx, args) -> Result`) があり、シーン操作・
選択・レンダラ生成・解析・画像出力が全て構造化引数で呼べる。この資産の入口は今のところ
メニューとパネルしかなく、「1CRN を読み込んで cartoon で表示し、リガンド周辺 5 A を
stick で出す」のような複合操作は人が順に辿るしかない。

この plugin は同じ service 群を **LLM が呼ぶ**入口にする。ユーザーは日本語でも英語でも
やりたいことを書き、agent が順に service を呼んで、途中経過を streaming で返す。

---

## 2. 全体像

```
renderer                                       Web Worker                          main
+-- plugins/agent/renderer --------------+   invokePluginService   +-- plugins/agent/worker ----+
| AgentRoot (PluginRoots 配下, UI なし)    | ----------------------> | plugin.agent.runTurn       |
|  useAgentTurnRunner                    |   { quiet: true }       |  turnLoop: streamText()    |
|   - agentProgress.subscribe            | <---------------------- |   modelProvider -> OpenAI  |
|   - useSuppressUndoRedo(running)       |   [plugin-channel.      |                  / Anthropic|
|   - parseModelSpec(model) -> provider  |    agent.progress, u]   |   -> tools/* = 既存 service |
|   - agentApiKeys[provider].get() -- IPC|                         |  1 turn = 1 undo txn       |
|   - usePluginPrefs('agent')            |                         | plugin.agent.cancelTurn    |
| agentSessionStore (module singleton)   |                         +----------------------------+
| AgentChatPane (SidePanel 配下)          |                                      |
|   ^/v = promptHistory (localStorage)   |          main: SECRET_GET/SET/STATUS
+----------------------------------------+ -------> (safeStorage; OPENAI_API_KEY /
                                                     ANTHROPIC_API_KEY fallback)
```

- **LLM 呼び出しとツール実行は worker 内**。ツールは `fn(ctx, args)` の直接呼び出しで、
  IPC 往復が無い。turn 全体を 1 つの undo txn で包めるのも worker service 内だからこそ。
- **会話履歴は renderer が所有**し、毎 turn 引数で渡す。worker は turn 中の
  `AbortController` 以外に状態を持たない (`streamFetchToReader` と同じ形)。
- **API キーは main が保持**。renderer は送信時に読んで `runTurn` の引数に載せるだけで、
  React state にもディスクの設定ファイルにも残さない。provider ごとに 1 本ずつ持ち、
  モデルが名指しした側だけを読む。
- **LLM 層は Vercel AI SDK** (`ai` v7 + `@ai-sdk/openai` + `@ai-sdk/anthropic`)。
  worker bundle は IIFE なので両 provider と `zod` が静的に入る (約 +815 KB)。

---

## 3. 設計判断

### 3.1 1 turn = 1 undo txn、そして「変更したら必ず commit」

```
scene.startUndoTxn(`AI: <指示の先頭 40 字>`)
try { LLM loop -- mutating tool が成功したら turn.mutated = true }
finally { turn.mutated ? commitUndoTxn() : rollbackUndoTxn() }
```

Cmd+Z 一回で「AI に頼んだこと」が丸ごと戻るのが狙い。ツール内部の `undoTxnResult` /
`withUndoTxn` は C++ 側が入れ子を最外側に吸収するのでそのまま使える。

**mutating tool が 1 つでも成功していれば、cancel でも API エラーでも commit する。**
C++ の `rollbackTxn` は pending の編集を実際に revert するので、途中で止めた turn を
rollback すると**ユーザーが既に見た変更が巻き戻る**。read-only だけの turn は逆に
rollback する (空 txn の commit は redo スタックを消すため)。

**実行中は Undo / Redo を止める** (`useSuppressUndoRedo`)。外側の txn が開いている間に
undo を走らせると、ユーザーが見ていない中途半端な状態に戻ってしまう。

既知の制約: **turn 実行中にユーザーが手で行った編集は同じ txn に吸収される**。lock は
undo の*実行*を止めるだけで編集は止めない。恒久策は C++ `UndoManager` に「直近 N txn を
統合」API を足すか、`Scene.qif` に `isInTxn` を露出して turn 開始時に他の txn が開いて
いたら拒否する案 (どちらも別プラン)。

### 3.2 loop は worker、provider 差は Vercel AI SDK に吸収させる

`turnLoop.ts` が `streamText` + `stopWhen: isStepCount(16)` で回す。履歴は毎回 `messages` として
渡す stateless な形 (OpenAI 側は `store: false`)。

worker の unhandled rejection は致命的 (`worker_launcher` が `__worker_crash__` を post し
transport が worker を破棄する) なので、**全ての await を try の中に置き**、
`for await` を途中で break しない。`result.responseMessages` / `result.usage` は
**成功経路でだけ await する** -- abort や error の後は遅れて settle するか reject する。

**provider 中立の層は自前で書いていない。** 当初は「2 つ目が要るまでは早すぎる」として OpenAI
直叩きにしていたが、Anthropic を足す段になって、自前の抽象より AI SDK に載せるほうが小さいと
判断した (`docs/plans/260913-ai-agent-ai-sdk-plan.md`)。SDK が吸収するのはリクエスト形・
ストリームイベント・履歴の表現で、こちらに残る provider 依存は `worker/modelProvider.ts` の
3 関数 (`createModel` / `providerOptionsFor` / `describeApiError`) と `shared/modelSpec.ts` の
2 関数だけ。**`turnLoop.ts` に provider 名は出てこない。**

`createModel` が DI の継ぎ目で、テストは `MockLanguageModelV4` を渡して turn 全体を回せる。

**モデル文字列が provider を決める**: Settings の Model は `openai:gpt-5.6` /
`anthropic:claude-opus-5` の `provider:model`。prefix 無しは OpenAI と読む (この plugin が
1 provider だった頃に保存された値を壊さないため)。provider 用の select を別に作らないのは、
モデルと provider が食い違う状態を作れてしまうから。

**`streamText` に素のモデル文字列を渡してはいけない** -- `'anthropic/claude-opus-5'` のような値は
Vercel AI Gateway 経由にルーティングされる。必ず `createModel` で `LanguageModel` を作る。

**reasoning effort は top-level の `reasoning`** に渡し、`providerOptions` 側には
reasoning 関連を一切書かない。理由は両 provider で同じ「SDK は未設定のキーだけ埋める」:

- OpenAI: `providerOptions.openai.reasoningEffort` を書くと top-level が無視される (merge されない)。
- Anthropic: SDK が **モデルごとに**使える thinking 設定を選ぶ (adaptive + effort が使えるモデルは
  それ、使えないモデルは `{ type: 'enabled', budgetTokens }`)。`thinking` を自分で埋めるとこの分岐が
  丸ごと飛ぶ。実際、adaptive を決め打ちしていたため Claude Haiku 4.5 への全リクエストが
  "adaptive thinking is not supported on this model" で落ちていた。

`modelProvider.test.ts` がこの「書かない」契約を pin している (実リクエストを投げるまで見えないため)。

**Anthropic の prompt cache** は送信直前に最後の message へ `cacheControl` を付けて取る
(`withCacheBreakpoint`)。breakpoint はそこまでの prefix 全部 (tools -> instructions -> 履歴) を
対象にし、次 turn では同じ message が履歴に残るので prefix が一致する。tools に付ける案は tools
ブロックしかキャッシュしない (instructions は tools の後) ので不適。履歴に保存するのは
`cacheControl` の付いていない素の message -- OpenAI 側の履歴をバイト同一に保つため。

**provider をまたぐ履歴**: reasoning part は自分の provider しか読めない状態 (OpenAI の encrypted
content、Anthropic の thinking signature) を `providerOptions` の自分のキーに持つ。相手に渡した
ときの挙動は未文書なので、`sanitizeHistory` が**別 provider の reasoning part を落とす**。
text と tool 呼び出しは残るので、会話は続く。
### 3.3 ツールカタログは手書き

TS 型 -> JSON Schema の自動生成は workspace に無く、`strict: true` で API 側が入力形を
保証するので、クライアント側バリデータも持たない (`strict` は全 property を `required` に
列挙 + `additionalProperties: false`、optional は `["string","null"]` で表す)。

`buildAiSdkTools` が turn ごとに `tool({ inputSchema: jsonSchema(...), strict: true, execute })` の
record を組む。`execute` は **throw しない** -- 失敗は `ok:false` を payload に載せる契約を保つ。
throw すると SDK が payload を自前のエラーテキストに置き換えるうえ、`is_error` を持つのは
Anthropic だけなので provider 間で挙動が割れる。

`execute` は turn ごとの promise chain で**直列化**する。SDK は同じ step の tool を並行に呼ぶが、
ダウンロードの後にレンダラ生成が来る順序が変わると、transcript と単一 undo txn の説明と食い違う。
進行中の `execute` は `turn.inflight` に積み、loop が `Promise.allSettled` してから txn を閉じる
(abort した stream は走っている tool を待たずに閉じるため)。

transcript の `tool_result` は **`execute` からではなくストリームの part から** push する。
`execute` から出すと、panel がまだ `tool_call` を処理していない時点で結果が届き得て、
結び付ける先が無い結果は捨てられ「running...」のまま残る。

各ツールは「LLM 向けの入力」を既存 service の args に変換し、結果を
`normalizeServiceResult()` で正規化する。**service の結果は 3 方言が混在**していて
(`Result<T>` / 素の `{ok}` / `{ok, error?, count?}`)、理由の無い失敗がそのまま渡ると
モデルは同じ呼び出しを延々と再試行する。だから失敗には必ず理由を付ける。

出力は `serializeToolOutput()` で JSON 化 (配列 200 件で truncate、8 KB で cap)。
`execute` はこの**文字列をそのまま返す** -- SDK は文字列を text output として扱い、
OpenAI の `function_call_output` / Anthropic の `tool_result` にそのまま載せるので、
モデルが見るバイト列は provider を問わず同じ。`ok:false` を JSON に埋め、
system prompt で「`ok:false` は失敗」と教える。

**スキーマは全 provider の strict モードが受ける共通部分だけを使う** (`type` / `description` /
`properties` / `required` / `additionalProperties` / `items` / `enum`)。Anthropic の strict は
数値・文字列の制約を受け付けず、配列は `minItems: 0 | 1` しか許さない。しかも tool 定義は
**毎リクエストに 19 本すべて載る**ので、1 本のスキーマが不正だとモデルが何を呼ぶつもりでも
リクエスト全体が 400 になる (実際 `measure_geometry` の `minItems: 2` が、測定と無関係な
プロンプトまで Anthropic で止めた。OpenAI は通っていた)。`tools/index.test.ts` が
キーワード集合を pin している。件数のような制約は description に書き、`run` で検証する。

登録順は **name 昇順で固定** (prompt caching の prefix を安定させるため)。
`tools/` 配下は `*.service.ts` と命名しない -- worker の glob に拾われる。

### 3.4 プロンプト

`instructions` は静的テキスト 1 本 (バイト一致でキャッシュに乗せる): 役割、原則
(ID は snapshot の値のみ使う / 選択式は `check_selection` で検証してから使う /
`ok:false` は失敗・2 回続いたら諦めて報告する / 曖昧なら訊く / 最後に 1〜3 文で報告)、
そして **選択式チートシート**。

チートシートは静的な転記。語彙の正本は `h3-kit/selection/selectionGrammar.ts`
(worker から import できない renderer モジュール) と `data/default_style.xml`
(C++ が起動時に読む) にあるため、ずれうる。`tools/index.test.ts` が全キーワードと
組み込み named selection 9 種の出現を検査して pin している。

動的な **scene snapshot** は system prompt に入れず、毎 turn の user item の先頭に
`<scene_state>...</scene_state>` として付ける。変わるものを末尾に置くのが prompt cache の
前提だから。同じ形が `get_scene_state` ツールとしても使える。

### 3.5 panel は module store を持つ

plugin の `Root` (`PluginRoots` 配下) と pane (`SidePanel` 配下) は**別の subtree**なので、
Root の React Context は pane に見えない。side pane は activity view の切り替えで unmount
もされる。よって会話状態は `agentSessionStore.ts` の module singleton
(`useSyncExternalStore`) に置き、turn を回す `useAgentTurnRunner` は Root に置く。

plugin を実行中に無効化すると Root が unmount されるので、その cleanup で
`cancelTurn` を送り、store を reset する。

composer の送信は `TextAreaField` の `onSubmit`。**自前で `key === 'Enter'` を見てはいけない**:
日本語入力では変換確定の Enter が来るので、変換のたびに書きかけが送信される。kit 側が
`isImeKey()` で除外している。

**既定は Enter = 改行、Cmd/Ctrl+Enter = 送信** (`submitKey: 'modifier-enter'`)。Enter 送信は
IME を除いてもなお誤送信が多い -- 数語で終わらない文章では、改行のつもりの Enter が
そのまま送信になる。Slack と同じく設定で切り替えられ (Settings > Plugins > AI Agent の
"Pressing Enter")、`'send the message'` を選ぶと Slack 既定の Enter 送信 / Shift+Enter 改行
になる。既定を Slack と逆にしているのは、失うもの (書きかけ) が取り戻せない側だから。
ショートカットは composer の Send ボタン横に出す (改行する field からは推測できないため)。

**送信済みの prompt は ↑/↓ で呼び戻せる** (`promptHistory.ts`)。シェルと同じ readline の規則で、
↑ で過去へ、↓ で戻り、いちばん下で書きかけの下書きが返ってくる。localStorage に直近 50 件
(`cuemol.agent.promptHistory`、LRU で同文は先頭へ移動)。**キャレットが先頭行 / 最終行にあるときだけ**
発火するので、複数行の下書きの中では矢印がキャレット移動のまま。IME 変換中も素通し (候補選択)。
記録は送信時で、失敗した turn の prompt も残す -- 言い直すために呼び戻すのが典型だから。

**transcript の行は縮まない** (`.agent-transcript > * { flex-shrink: 0 }`)。スクロールする flex 列の
中では子が既定で縮むので、会話が pane より長くなると行が潰れ、tool 行は縞になって disclosure
caret が押せなくなる。長さを吸収するのはスクロールバーの役目。

**Clear chat** はヘッダの actions に置く。transcript と会話履歴の**両方**を捨てる -- 消した会話が
以後の答えを誘導し続けるのはおかしい。`agentSession.reset()` ではなく `clear()` を使う:
`reset()` は runner も落とすので、Root が次に handler を張り直すまで composer が死ぬ。
turn 実行中は無効 (先に Stop する)。

---

## 4. host 側に足した汎用の受け皿

この plugin のために core へ入れたものは、全て **plugin id を書かない汎用機構**。
詳細は [tritium_plugin/api.md](tritium_plugin/api.md) と
[tritium_plugin/internals.md](tritium_plugin/internals.md)。

| 機構 | なぜ要ったか |
|---|---|
| push channel レーン (`definePluginChannel`) | streaming の delta を流す先。`WorkerTransport` の分岐は built-in 4 本が手配線で、plugin は足せない |
| `PluginServiceClient.invoke` の `opts` | 数十秒〜数分の turn を busy 表示から外す (`{ quiet: true }`) |
| plugin prefs (`usePluginPrefs` / `UiState.pluginPrefs`) | model 名と reasoning effort の保存先。plugin ごとの設定置き場が無かった |
| settings 寄与点 (`contributes.settings`) | その設定を Settings に出す口。`SettingControl` に `text` と `secret` を追加 |
| 汎用 secrets IPC (`definePluginSecret` / `main/secretStore.ts`) | API キーを設定ファイルに置かないため。`safeStorage` の利用は初 |
| undo/redo lock (`useSuppressUndoRedo`) | §3.1 |

ついでに shared へ移したもの: `worker/shared/pdbUrls.ts` (RCSB の座標 URL。getpdb plugin の
renderer にあり worker から import できなかった)、`worker/shared/fileOpenDefaults.ts`
(ダイアログ無しで `FileOpenOptions` を組むための純関数群)。

---

## 5. ツール一覧

`objId` / `rendId` / `nodeId` は `get_scene_state` が返す uid。`selection` は CueMol 選択式。
sceneId / viewId は `TurnContext` から補うのでモデルには見せない。

| tool | mutates | 呼ぶ service |
|---|---|---|
| `get_scene_state` | no | `getSceneTree` + `getSelDefs` |
| `set_visible` | yes | `setNodeVisible` |
| `get_mol_chains` | no | `getMolChains` |
| `get_mol_residues` | no | `getMolResidues` (200 件 cap + `total` / `truncated`) |
| `check_selection` | no | `validateSelection` + `getSelHitCount` |
| `set_mol_selection` | yes | `applyMolSelString` |
| `center_view` | yes | `centerMolSelection` / `zoomMolSelection` |
| `get_renderer_types` | no | `getNewRendererOptions` |
| `create_renderer` | yes | `createRendererOnObject` |
| `set_renderer_selection` | yes | `setGenericProp` (`propName: 'sel'`) |
| `get_renderer_props` | no | `getGenericProps` |
| `set_renderer_prop` | yes | `getGenericProps` -> `setGenericProp` |
| `get_coloring_styles` | no | `getPaintColoringStyles` |
| `set_renderer_coloring` | yes | `setRendererColoring` |
| `fetch_pdb` | yes (async) | `streamLoadFromUrl` |
| `load_file` | yes | `getCompatibleRendererNames` -> `loadObject` |
| `measure_geometry` | yes | `MolCoord.getAtom` + `helpers/atomintr` の `appendMeasureLabel` |
| `analyze_interactions` | yes | `analyzeInteractions` |
| `export_image` | no (シーン不変。ファイルは書く) | `getSceneExportInfo` -> `exportScene` |

19 件。OpenAI の推奨は「1 turn で 20 未満」で、どの provider でも妥当な上限。

`get_named_selections` は当初あったが外した。毎 turn の `<scene_state>` が
`namedSelections` を既に載せており、同じものを取りに行くだけの往復だったため。

`measure_geometry` は後から足した。UI の measure ツール
(`services/navi/measure.ts`) は**マウスで原子を拾う状態機械**で、画面座標の
hit test が前提なので、名前で原子を指定するモデルからは呼べない。そのため
「A10 と A20 の CA の距離」に対して agent は数値を返せず、一番近い
`analyze_interactions` (接触線の描画) に流れていた。新しい tool は
`MolCoord.getAtom(chain, resid, atomName)` で原子を引き、数値を返しつつ
measure ツールと**同じ** atomintr ラベルを描く (`appendMeasureLabel` を共有。
2 つ目の実装を持つと同じ操作が別の renderer に描かれ始める)。

torsion の符号は `qlib/VectorHelper.cpp` の `Vector4D::torsion` に合わせてある。
返す数値の隣に C++ が描いたラベルが出るので、片方だけ手系が逆だと最悪 -- しかも
もっともらしく見える。外積の順序 (`Vjk x A`) がその要。

description に必ず書いている曖昧点:

- uid は不透明な整数。名前から推測せず `get_scene_state` で取る
- `residueIndex` は文字列 (挿入コード付きがある)
- `center_view` は選択の適用も行う (副作用)
- `set_renderer_coloring` の style 名は `get_coloring_styles` のものだけ有効
- `fetch_pdb` / `load_file` は新しい object と既定 renderer を作る
- `export_image` はディスクにファイルを書く (保存先は Desktop 固定、basename のみ受ける)

`set_renderer_selection` が `setRendererSelection` ではなく `setGenericProp` を使うのは、
前者が定型の 6 種 (`all` / `visible` / ...) しか受け付けず任意の選択式を書けないため。

---

## 6. 設定と API キー

Settings > Plugins > AI Agent に 4 行:

| 設定 | kind | 既定 | 保存先 |
|---|---|---|---|
| Model | `combo` (両 provider の候補 7 件 + 自由入力、`provider:model`) | `openai:gpt-5.6` | `UiState.pluginPrefs.agent.model` |
| Reasoning effort | `select` (`default`/`low`/`medium`/`high`) | `low` | `UiState.pluginPrefs.agent.reasoningEffort` |
| Pressing Enter | `select` (`start a new line` / `send the message`) | `start a new line` | `UiState.pluginPrefs.agent.enterKey` |
| OpenAI API key | `secret` | -- | OS キーチェーン (`safeStorage`)、`OPENAI_API_KEY` fallback |
| Anthropic API key | `secret` | -- | 同上、`ANTHROPIC_API_KEY` fallback |

モデル id は候補リスト付きの自由入力 (`AGENT_MODEL_SUGGESTIONS`: OpenAI 4 件 + Anthropic 3 件、
それぞれ provider と用途を label に添える)。既定は `DEFAULT_AGENT_MODEL` 1 箇所。
存在しない id は 404 として panel にそのまま出る。

**キーは provider ごと**に持ち、turn はモデルが名指しした provider のものだけ読む。
未設定のときの error 行は「どちらのキーを、どの行に」入れるかを名指しする -- 2 つある以上、
「invalid API key」だけでは直せない。

**API から実リストを取る形にはしていない。** 2 つの provider で事情が違う:

- **OpenAI** の `/v1/models` は `id` / `created` / `owned_by` / `shutdown_date` だけで
  **能力のメタデータが無い**。embedding・音声・画像・moderation 用も同じ配列に混ざるので、
  「turn を回せるテキストモデル」への絞り込みは id 文字列のヒューリスティックにしかならず、
  新しい命名が出れば漏れる。
- **Anthropic** の `/v1/models` は `capabilities` を返す (`thinking.types.adaptive` /
  `effort` / `structured_outputs` / `max_input_tokens`)。こちらは正確に絞り込める。

片方だけ正確な一覧になり、しかも**どちらもキー未設定では何も出せない** -- 「何を入れれば
いいか分からない」場面はまさにキーを入れる前なので、そこで空になるのでは解決しない。
候補を手で挙げるほうが確実に解き、流動性は自由入力が吸収する。後続でやるなら
「候補は手書きのまま、キーがある provider だけ Settings の Refresh で上書き」の形。

キーは `safeStorage` で暗号化して electron-store に base64 で入れる。**暗号化できない
環境 (keyring の無い Linux セッション等) では保存を拒否**し、環境変数を使うよう案内する
(平文では保存しない)。状態行には `....ab12` と末尾 4 文字だけ出し、値そのものは
ログにもエラー文言にも出さない。

---

## 7. 既知の制約

- **CueMol の機能のうち tool にしていないものは、モデルには存在しない**。system prompt は
  機能一覧を持たず tool の説明だけを渡すので、機能を増やす唯一の経路は tool の追加。
  逆に、呼べない機能を prompt に書くと「できます」と言って失敗する。モデルが「できない」と
  答えた操作を集めると、追加すべき tool の一覧がそのまま得られる。ラベル編集、カメラの保存、
  結合編集、重ね合わせなどは UXP から移植済みだが未 tool 化。
- **turn 実行中の手動編集が agent の undo txn に吸収される** (§3.1)。
- **provider 切り替え時に chain of thought は引き継がれない**: 別 provider の reasoning part は
  `sanitizeHistory` が落とす (渡したときの挙動が未文書のため)。text と tool 呼び出しの履歴は残る。
- **Claude モデル間の切り替えで thinking block の署名が合わないと turn が落ちうる**。
  以前は `thinking.blockBinding.prefixMismatchBehavior: 'drop_block'` で吸収していたが、
  `thinking` を書くと SDK のモデル別解決が飛ぶので外した (§3.2)。`sanitizeHistory` が落とすのは
  「別 **provider** の reasoning」までで、同じ Anthropic 内のモデル差までは見ていない。
- **未検証**: OpenAI の `call_...` と Anthropic の `toolu_...` という tool call id が、
  会話の途中で provider を切り替えたときに相手側で受理されるか。
- **`reasoningEffort` の意味は provider で異なる** (OpenAI: Responses の reasoning effort、
  Anthropic: adaptive thinking + effort)。同じ 3 段を top-level `reasoning` で写像するが、
  体感は揃わない。
- **worker bundle が約 815 KB 増えた** (1.45 MB -> 2.27 MB)。`zod` は `@ai-sdk/provider-utils` が
  静的に import する必須 peer dep で、`jsonSchema()` しか使わなくても tree-shake できない。
  `@ai-sdk/gateway` も `ai` から静的に入る。
- **メニュー / コマンドから panel を開けない**: `activeView` が `MainLayout` のローカル
  state。`LayoutProvider` へ移して `UiState.sidebarActiveView` (現状 dead) を活かし、
  host の api に view を切り替える口を足すのは別タスク。
- **会話そのものはセッション内のみ** (再起動と plugin の OFF/ON で消える)。localStorage に残るのは
  送信した prompt の文字列だけ (§3.5) で、モデルの答えや tool の結果は残らない。
- **Markdown 表示なし** (依存追加を避けた)。必要なら後続で検討。
- `{ quiet: true }` は `tritium/CLAUDE.md` の表で「pointer-rate stream 専用」とされていた
  用途からの逸脱。数分の turn が Busy pill と wait cursor を占有するのを避けるためで、
  進捗は panel 自身が出す。
