# native console 導入と、op catalog による agent / MCP / console の共通化

Status: **実装済み** (フェーズ 0-3)。仕様は [op-catalog.md](../architecture/op-catalog.md)。
実装中の目視確認で決めた変更は末尾の「実装時の変更」にまとめる。
関連: [MCP / tool catalog 計画](260926-mcp-tool-catalog-plan.md) (D1 と「構成」を本計画で置き換える)、
[pymconsole plugin 計画](260913-pymconsole-plugin-plan.md)、
[AI agent plugin](../architecture/ai-agent-plugin.md)。

## Context
- 現状、同じ操作を次の 3 箇所がそれぞれ持っている:
  - agent tool 21 本 (`plugins/agent/worker/tools/`): 手書きの JSON Schema
  - pymconsole command 77 本 (`plugins/pymconsole/worker/commands/`): PyMOL の文字列引数
  - worker service (ServiceMap に約 226 key)
- 調査で分かったこと: agent も console も、すでに `@renderer/worker/server/services/...` の service 関数を直接呼ぶ adapter になっている。重複しているのは adapter 側の次の 4 つ:
  - 組み合わせ手順
  - scene/ref の解決
  - txn 規則
  - 結果の整形
- 今後、CueMol ネイティブの **native console** を実装する。pymconsole はその **dialect (変種)** という位置づけに作り直す。native console のコマンドは、agent/MCP tool と同じ定義 (op catalog) から**自動生成**する。

### 決定事項 (ユーザー確認済み)
- **構文**: PyMOL と同じ形。`verb arg1, arg2, key=value` (引数はカンマ区切り、コマンドは `;` 区切り)。pymconsole の `splitCommands` / `parseArgs` をそのまま使う。空白区切りにしないのは、CueMol selection (`chain A and resid 10:20`) が空白を含むため。
- **verb**: PyMOL と共通にできるものは同じ verb で実行できるようにする (`load` / `fetch` / `enable` / `zoom` / `set` / `png` ...)。中身は CueMol ネイティブにする。無理に PyMOL に合わせていた次の部分は、native には持ち込まない:
  - `pym:<rep>` 規約
  - PyMOL selection の翻訳
  - PyMOL 設定名の alias
  - PyMOL 語彙のエラー文言
- **selection**: native の selection 引数はすべて **CueMol selection 構文**で受け付ける。`sel/` による翻訳は通さない。
  - 検証は既存の `makeSel` / `validateSelection` / `applyMolSelString` で行う。agent/MCP と同じ経路になる。
  - 名前付き selection も CueMol の名前で参照する。
  - PyMOL 構文の selection を受け付けるのは pymol dialect だけ。
- **名前の対応**: catalog の 1 entry に、tool 名 (`set_visible`) と console verb (`enable` = `visible:true` 固定) を並べて書く。native console はどちらの名前でも実行できる。
- **配置**: console は 1 panel にまとめ、dialect (native / PyMOL) を切り替える。履歴、transcript、Stop、txn 規則は dialect 間で共有する。
- **op 本体**: 新しい `ops/` 層は作らない。既存の worker service 関数 (`services/<domain>/`、`(ctx, typedArgs) => Result`) を op として使う。GUI でも使うものだけを ServiceMap に公開する。
- **UID**: session を跨いで一意な UID は導入しない。ref は名前と `#uid` で解決し、名前が重複していたら失敗させる。
- **やらないこと**:
  - ServiceMap から tool を自動生成すること (service の形が UI 都合で、説明文が無く、数も多すぎる)
  - CmdId との共通化 (renderer 側の UI handler で、層が違う)

## 設計

### 1. op catalog (core: `src/renderer/worker/server/catalog/`)
agent、MCP、console の 3 plugin から使うので core に置く。

```ts
defineOp({
  name: 'set_visible',                 // tool name (snake_case, LLM-facing)
  description: '...',                  // tool description; console help uses its first sentence
  params: { target: nodeRef('...'), visible: boolean('...') },  // ordered = console positional order
  mutates: true,
  expose: { tool: 'core', console: true },   // tool: 'core' | toolset name | false
  verbs: [{ verb: 'enable', fixed: { visible: true } }, { verb: 'disable', fixed: { visible: false } }],
  run(ctx, args /* inferred from params */, oc: OpContext) { return setNodeVisible(ctx, ...) },
})
```

**param DSL**
- 型の語彙は **`.qif` の property 型に合わせる**。今の agent の `str` / `int` / `bool` / `enumStr` / `nullable` を置き換える。
  - スカラー型: `boolean` / `integer` / `real` / `string` / `enum(values)`。optional は `optional(T)`。
  - JSON Schema への変換: `real` -> `number`、`integer` -> `integer`、`enum` -> `string` + `enum`。enum は qif と同じく文字列 ID で扱う。
  - TS の型は `number` / `string` / `boolean` / 文字列 union に推論し、`run` の `args` に型を付ける。integer と real の違いは、runtime の schema と console での変換 (整数チェック) にだけ現れる。
- `object<X>` は **意味型**に対応させる:

  | qif の型 | 意味型 | JSON Schema 側 | console 側 |
  |---|---|---|---|
  | `MolSelection` | `selection` | CueMol 構文の string | bind の段階で `validateSelection` を通す。completion は名前付き selection と chain |
  | `AbstractColor` | `color` | string | CueMol の色指定 |
  | `Vector` | `vec3` | number[3] | `x,y,z` |
  | `Object` / `MolCoord` / `Renderer` | `objRef` / `rendRef` / `nodeRef` | 既存 tool と同じ形 (uid の integer。nodeRef は `nodeId` + `nodeType`) | 名前または `#uid` を scene から解決する。completion は `completion/sources.ts` を流用 |
  | `Scene` / `View` | (引数にしない) | - | OpContext から取る |
  | (なし) | `path` | string | cwd を基準に解決する。completion は file |

- 汎用の `set` / `get` (op `set_node_prop` / `get_node_props`) では、値の型を**対象 property の qif 型**で決める。`getPropsJSON` が返す `spec.type_name` を使って変換と検証を行う。
- **zod は使わない**。console が文字列から変換できるのは、上の型の範囲だけである。DSL をこの範囲に制限しておくことが、自動生成が成り立つ条件になる。

**生成するもの (adapter)**
- `toToolSchema(op)`: strict JSON Schema を作る。optional は nullable にする。
- `buildAiSdkTools(...)`: 今の `plugins/agent/worker/tools/index.ts` から移す。
- `toConsoleCommands(op)`: `name` と各 `verb` から、それぞれ console command を作る。
  - params の順を位置引数の順にする。
  - 型に従って変換する。
  - `fixed` の引数は console から渡せない。
  - help は usage と description から作る。

**toolset**
- agent は `expose.tool === 'core'` (今の 21 本) だけを使う。`MAX_TOOLS` のテストは維持する。
- native console には `console: true` のものをすべて出す。
- console 専用の op (`cd` / `pwd` / `ls` / `log*` / `run` / `undo` / `redo` / `quit`) は `tool: false` にする。

### 2. opRuntime (core: `catalog/opRuntime.ts`)
- `OpContext = { sceneId, viewId, markMutated, print?, warn?, noteStream, streamId, cwd? }` とする。`TurnContext` と `CmdContext` の共通部分にあたる。
- txn を 1 つ張る helper `runInTxn(scene, label, body)` を置く。規則は次のとおり:
  - 変更があれば commit する。途中で失敗しても commit する。
  - 変更がなければ rollback する。
  - `turnLoop.ts` と `runCommand.ts` の両方をこの helper の上に乗せ替える。
- 直列化 (`runQueued`) と結果の整形 (`normalizeServiceResult` / `serializeToolOutput`) も、ここへ移す。

### 3. console 基盤と dialect
- `plugins/pymconsole/` を `plugins/console/` に改名し、id も `console` にする。既定で off の plugin なので、古い設定と履歴は引き継がない。
- `runCommand.ts` を、dialect によらない runtime に一般化する。対象は submission = 1 txn、Stop、script のネスト制限、log、undo/redo の standalone 実行、`EntrySink`。
- dialect によって変わる部分は interface に切り出す:
  ```ts
  interface ConsoleDialect {
    id: 'native' | 'pymol'
    prompt: string            // 'CueMol>' / 'PyM>'
    txnPrefix: string         // 'cmd:' / 'pym:'
    scriptExt: RegExp         // .cml / .pml
    split(text): SplitCommand[]          // shared splitCommands; pymol adds python-line refusal
    commands(): ConsoleCommand[]         // registry for lookup / completion / help
    parseMode(cmd): ArgMode
  }
  ```
- `ConsoleCommand` は `PymCommand` を一般化したもので、bind の結果に型を付ける。
- **native dialect**: すべて `toConsoleCommands(catalog)` で生成する。手書きのコマンドは無い。
- **pymol dialect**: 77 本を `ConsoleCommand` として残し、PyMOL 合わせの部分 (`sel/`、`pym:<rep>`、alias) はこの dialect の中に閉じる。
  - 依存の向きは pymol dialect -> catalog/ops に限る。逆向きは ESLint の import 制限で禁止する。
- **panel**: `ConsolePanel` に dialect の selector を置き、選択は `usePluginPrefs` に保存する。
  - `pymol` / `native` コマンドでも切り替えられるようにする。
  - 履歴は dialect ごとに分ける。

### 将来の拡張に向けて今回守る前提
アクションの記録と再生、undo 履歴パネル、MCP は範囲外とする。ただし、後から足せるように次の 3 点を守る。
1. **op の実行入口は opRuntime の 1 箇所に限る。** 後で journal の記録点と、入れ子の深さ管理をここに足すため。
2. **ref の意味型は、後から context 参照 (アクティブな object、現在の selection) を足せる形にする。**
3. **引数から canonical な command 文字列への逆変換 (formatter) を後で足せるように、params の順序と型情報を catalog に残す。** formatter そのものは今回は実装しない。

## フェーズ (それぞれ 1 PR、merge commit)
0. **計画ドキュメント**
   - `docs/plans/261006-native-console-op-catalog-plan.md` を作成し、`docs/plans/_index.md` に行を追加する。
   - `docs/plans/260926-mcp-tool-catalog-plan.md` の D1 と「構成」は本計画で置き換える (supersede) と明記する。MCP の部分 (D4) は有効のまま残す。
1. **catalog + opRuntime** (挙動は変えない)
   - 最初に、生成した JSON Schema が今の手書き schema と一致することを pin するテストを書く。
   - agent の 21 tool を `defineOp` に書き換え、AI SDK tool を catalog から生成する。
   - 組み合わせ手順は `services/<domain>/` に移す。
2. **console 基盤の一般化** (挙動は変えない)
   - 改名し、`ConsoleDialect` を導入して、pymconsole を pymol dialect として動かす。
   - 既存の `runCommand.test.ts` が pass し続けることで確かめる。
3. **native dialect**
   - `toConsoleCommands`、意味型の解決、completion と help の生成、dialect の切り替え UI を実装する。
   - 最初に出す op は、agent の 21 本、console 専用 op、基本 verb の native 版 (`load` / `fetch` / `enable` / `disable` / `zoom` / `center` / `set` / `get` / `png` / `select`)。
   - pymol dialect のうち、意味が同じ verb (`load` / `fetch` / `png` / `cd` / `pwd` / `ls` / `log*` / `undo` / `redo`) は、生成コマンドを再利用する形に切り替える。

**範囲はここまで。** 次のものは別の計画にする:
- pymol dialect の残りの重複を op に乗せ替える作業
- MCP server
- アクションの記録と再生、undo 履歴パネル (UndoInfo の meta)
- undo 履歴の永続化

## 主に触るファイル
- 新規 `src/renderer/worker/server/catalog/`: `defineOp.ts`、`params.ts`、`toToolSchema.ts`、`toConsoleCommands.ts`、`opRuntime.ts`、`ops/*.ts`
- `plugins/agent/worker/tools/*` と `toolOutput.ts`: catalog に移す。agent 側には `buildAiSdkTools` の呼び出しだけを残す。
- `plugins/agent/worker/turnLoop.ts`: `runInTxn` を使うようにする。
- `plugins/pymconsole/` を `plugins/console/` に改名し、次を変える:
  - `worker/runCommand.ts` (一般化)
  - `worker/dialects/{native,pymol}/`
  - `worker/parser/bindArgs.ts` (型付き)
  - `worker/completion/sources.ts`
  - `renderer/ConsolePanel.tsx`
- 実装の後、`docs/architecture/ai-agent-plugin.md` の §3.3 と §5 を catalog を参照する形に更新する。

## テスト (最小集合)
- catalog: 生成した tool schema を pin する。既存の `tools/index.test.ts` を移し、`MAX_TOOLS` も含める。
- `toConsoleCommands` の binding を 1 件。次をまとめて確かめる:
  - 位置引数と `key=value` を qif 型で変換すること (integer/real の区別を含む)
  - `fixed` は上書きできないこと
  - 名前で ref を解決すること
  - CueMol selection が翻訳されずに届くこと
- 汎用 `set`: property の qif 型で値を変換することを 1 件。
- opRuntime: commit/rollback の規則を 1 件。
- dialect: 同じ runtime の上で、prompt と txn label が dialect ごとに切り替わることを 1 件。既存の `runCommand.test.ts` は pymol dialect のテストとして残す。

## 検証
1. 各フェーズで `cd build_scripts && task build_tritium` を実行し、続けて `task run_tritium` で起動する。ログが `launch worker OK` から `shader program created OK` まで進むことを確かめる。
2. ユーザーに目視確認 (E2E) を依頼する:
   - agent の既存 tool が動くこと
   - PyM dialect の既存コマンドが動くこと
   - native dialect の `load` / `enable` / `zoom` / `set` が動き、completion と help が出ること
   - 1 回の submit を 1 回の Cmd+Z で取り消せること
3. 挙動が確定してから、次を実行する:
   - `npm test`
   - `npx tsc -p tsconfig.web.json --noEmit` と `tsconfig.node.json`
   - `task lint_tritium_style`

## 実装時の変更 (目視確認で決めたもの)

- **構文はカンマ区切りのみ**。`set x v` の空白区切りを一時入れたが、selection が空白を含むため
  文脈依存の特例になり、取り下げた。
- **`enable` / `disable` -> `show` / `hide`**。native では CueMol の renderer = 表現なので
  PyMOL の `show`(表現の追加) と衝突しない。
- **property は path で書く**: `set obj/rend.prop, value` / `obj.prop` / scene の `prop`。console 専用 op
  `set_prop` / `get_prop`。object と renderer の区切りは `/` だけ (当初 `obj.rend` も受け付けたが、
  object 名がファイル名由来で `.` を含む (`1ox1.pdb`) ため曖昧になり、`/` に統一した)。
- **builtin**: `cd` / `pwd` / `ls` / `run` / `log*` / `undo` / `redo` / `help` は op ではなく
  native dialect の builtin (console 自身の機能で、agent / MCP は使わない)。
- **PyMOL dialect は生成コマンドを再利用しない**。PyMOL の `load` / `fetch` / `png` は引数と
  文言が PyMOL 固有で、置き換えると互換が崩れるため。
- **`.qsc` の `load`**: `OpContext.openScene` と op の `outsideTxn` を追加し、panel が開く。
- **結果の表示**: JSON ではなく op の `format`、無ければ汎用の key: value 表示。
- **意味型の追加**: `rendererType` / `propName` / `propValue` / `propPath` / `vec3`。
  path 以外の自由文字列の補完はファイル名に fall back しない。
- **agent の toolset (C 方式)**: core 21 本 + toolset `analysis` (`measure_geometry` /
  `analyze_interactions` / `export_image`)。`enable_toolsets` + `prepareStep` / `activeTools`。
  provider の tool search (`deferLoading`) は将来の最適化。
- **追加した op**: `rotate_view` (`turn`)、`set_view` (`view` / `slab` / `fit_slab`。GUI と同じ
  `viewXform` service)、`get_prop` / `set_prop`、`save_png` (`png`)。
- **既存の不具合の修正**: `create_renderer` の既定名がダイアログ先頭 type 由来だった
  (`unusedRendererName`)、`analyze_interactions` が既定で炭素を含めていた (`includeCarbon`)。
