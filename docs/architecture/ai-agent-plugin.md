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
|  useAgentTurnRunner                    |   { quiet: true }       |  turnLoop                  |
|   - agentProgress.subscribe            | <---------------------- |   OpenAI Responses API     |
|   - useSuppressUndoRedo(running)       |   [plugin-channel.      |   -> function_call          |
|   - agentApiKey.get() -- IPC           |    agent.progress, u]   |   -> tools/* = 既存 service |
|   - usePluginPrefs('agent')            |                         |  1 turn = 1 undo txn       |
| agentSessionStore (module singleton)   |                         | plugin.agent.cancelTurn    |
| AgentChatPane (SidePanel 配下)          |                         +----------------------------+
+----------------------------------------+                                      |
                       |                                          main: SECRET_GET/SET/STATUS
                       +----------------------------------------> (safeStorage; OPENAI_API_KEY fallback)
```

- **LLM 呼び出しとツール実行は worker 内**。ツールは `fn(ctx, args)` の直接呼び出しで、
  IPC 往復が無い。turn 全体を 1 つの undo txn で包めるのも worker service 内だからこそ。
- **会話履歴は renderer が所有**し、毎 turn 引数で渡す。worker は turn 中の
  `AbortController` 以外に状態を持たない (`streamFetchToReader` と同じ形)。
- **API キーは main が保持**。renderer は送信時に読んで `runTurn` の引数に載せるだけで、
  React state にもディスクの設定ファイルにも残さない。

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

### 3.2 loop は worker、provider 依存は 2 ファイルに閉じる

`turnLoop.ts` が Responses API を stateless に使う (`store: false`)。履歴は毎回
`input` 配列として渡し、`function_call` が無くなるまで繰り返す (最大 16 ラウンド)。

worker の unhandled rejection は致命的 (`worker_launcher` が `__worker_crash__` を post し
transport が worker を破棄する) なので、**全ての await を try の中に置き**、
`for await` を途中で break しない。

provider 依存は `openaiClient.ts` (client の生成) と `turnLoop.ts` の event 分岐だけ。
ツール宣言は JSON Schema のままなので他 provider でも再利用できる。**provider 中立の
抽象層は作っていない** -- 2 つ目が要るまでは早すぎる。

`openaiClient.ts` の `AgentOpenAIClient` は SDK 全体ではなく `turnLoop` が使う分だけを
書いた型。これが DI の継ぎ目で、テストは数行の fake で turn 全体を回せる。

### 3.3 ツールカタログは手書き

TS 型 -> JSON Schema の自動生成は workspace に無く、`strict: true` で API 側が入力形を
保証するので、クライアント側バリデータも持たない (`strict` は全 property を `required` に
列挙 + `additionalProperties: false`、optional は `["string","null"]` で表す)。

各ツールは「LLM 向けの入力」を既存 service の args に変換し、結果を
`normalizeServiceResult()` で正規化する。**service の結果は 3 方言が混在**していて
(`Result<T>` / 素の `{ok}` / `{ok, error?, count?}`)、理由の無い失敗がそのまま渡ると
モデルは同じ呼び出しを延々と再試行する。だから失敗には必ず理由を付ける。

出力は `serializeToolOutput()` で JSON 化 (配列 200 件で truncate、8 KB で cap)。
Responses API の function output に `is_error` は無いので `ok:false` を JSON に埋め、
system prompt で「`ok:false` は失敗」と教える。

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

composer の送信は `TextAreaField` の `onSubmit` (Enter 送信 / Shift+Enter 改行)。
**自前で `key === 'Enter'` を見てはいけない**: 日本語入力では変換確定の Enter が来るので、
変換のたびに書きかけが送信される。kit 側が `isImeKey()` で除外している。

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
| `get_named_selections` | no | `getSelDefs` |
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
| `analyze_interactions` | yes | `analyzeInteractions` |
| `export_image` | no (シーン不変。ファイルは書く) | `getSceneExportInfo` -> `exportScene` |

19 件。OpenAI の推奨は「1 turn で 20 未満」。

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

Settings > Plugins > AI Agent (OpenAI) に 3 行:

| 設定 | kind | 既定 | 保存先 |
|---|---|---|---|
| Model | `text` | `DEFAULT_AGENT_MODEL` | `UiState.pluginPrefs.agent.model` |
| Reasoning effort | `select` (`default`/`low`/`medium`/`high`) | `low` | `UiState.pluginPrefs.agent.reasoningEffort` |
| OpenAI API key | `secret` | -- | OS キーチェーン (`safeStorage`)、`OPENAI_API_KEY` fallback |

モデル ID は流動的なので**自由入力**にし、既定は `shared/agentTypes.ts` の
`DEFAULT_AGENT_MODEL` 1 箇所。存在しない ID は 404 として panel にそのまま出る。

キーは `safeStorage` で暗号化して electron-store に base64 で入れる。**暗号化できない
環境 (keyring の無い Linux セッション等) では保存を拒否**し、環境変数を使うよう案内する
(平文では保存しない)。状態行には `....ab12` と末尾 4 文字だけ出し、値そのものは
ログにもエラー文言にも出さない。

---

## 7. 既知の制約

- **turn 実行中の手動編集が agent の undo txn に吸収される** (§3.1)。
- **メニュー / コマンドから panel を開けない**: `activeView` が `MainLayout` のローカル
  state。`LayoutProvider` へ移して `UiState.sidebarActiveView` (現状 dead) を活かし、
  host の api に view を切り替える口を足すのは別タスク。
- **会話履歴はセッション内のみ** (再起動と plugin の OFF/ON で消える)。
- **Markdown 表示なし** (依存追加を避けた)。必要なら後続で検討。
- `{ quiet: true }` は `tritium/CLAUDE.md` の表で「pointer-rate stream 専用」とされていた
  用途からの逸脱。数分の turn が Busy pill と wait cursor を占有するのを避けるためで、
  進捗は panel 自身が出す。
