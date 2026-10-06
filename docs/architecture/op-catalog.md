# Op catalog と console (native / PyMOL dialect)

CueMol を名前で操作する呼び出し元 (AI agent の tool、console のコマンド、将来の MCP server) が
共有する「操作の定義」の仕様。経緯と判断は
[`../plans/261006-native-console-op-catalog-plan.md`](../plans/261006-native-console-op-catalog-plan.md)。

## 1. 構成

```
core   renderer/worker/server/catalog/
         params.ts        param DSL (.qif 型 + 意味型)
         op.ts            Op / OpContext / OpVerb / OpExposure
         opRuntime.ts     invokeOp (唯一の実行入口)、runInTxn、txnLabel
         toolSchema.ts    JSON Schema 生成 (toolSchema) と JSON 引数の読み込み (readToolArgs)
         toolsets.ts      toolset の定義
         refs.ts          名前 -> uid、property path の解決
         consoleFormat.ts console 用の整形 helper
         ops/*.ts         op 本体 (既存 worker service を呼ぶ adapter)
plugin agent/worker/tools/      op -> AI SDK tool、enable_toolsets
plugin console/worker/
         runtime/         dialect 非依存の実行系 (1 submit = 1 txn、Stop、script、log)
         parser/          PyMOL 由来の引数パーサ (両 dialect 共用)
         completion/      Tab 補完 (候補源は dialect が持つ)
         dialects/native/ op catalog から生成するコマンド + console 自前の builtin
         dialects/pymol/  PyMOL 語彙のコマンド 77 本、selection 翻訳 (sel/)
```

op 本体は新しい層を作らず、既存の worker service 関数を呼ぶ。GUI と同じ service を通るので、
GUI でできる操作は op を 1 つ書けば agent と console の両方に出る。

依存の向き (ESLint で強制): `worker/server` は plugin を import しない。console の runtime と
native dialect は `dialects/pymol` を import しない (例外は dialect 表 `dialects/index.ts`)。

## 2. param DSL

| 種別 | 宣言 | JSON Schema | console での書き方 |
|---|---|---|---|
| `.qif` スカラー | `boolean` / `integer` / `real` / `string` / `enumOf(values)` | boolean / integer / number / string / string+enum | `true`/`false`/`on`/`off`、数値、文字列 |
| 省略可能 | `optional(p)` | `[type, "null"]` | 省略 (既定値 `''`) |
| object uid | `objectId` / `moleculeId` / `rendererId` | integer | `1crn`、`#12` |
| node uid | `nodeId(desc, typeParam)` | integer + 種別 enum | `1crn`、`1crn/cartoon1`、`#12` (種別も解決される)。object と renderer の区切りは `/` だけ (object 名がファイル名由来で `.` を含むため) |
| selection | `selection` | string | CueMol 選択式をそのまま (bind 時に `validateSelection`) |
| colour / path | `color` / `path` | string | 色名・`#rrggbb` / cwd 基準のパス |
| renderer type | `rendererType` | string | 補完は対象 object の作成可能 type |
| property | `propName` / `propValue` / `propPath` | string | `propPath` は `obj/rend.prop` / `obj.prop` / scene の `prop` (node の後ろに `.` で property) |
| 座標 | `vec3` | number の配列 (3 要素は読み込み時に検査) | `x y z` |
| 原子列 | `atoms` | `{chain, resid, atomName}` の配列 | `A/20/CA A/21/CA` |

`run` の引数型は DSL から推論される。console が文字列から変換できる種別だけに限っているのが、
コマンドを自動生成できる条件。

## 3. Op

```ts
defineOp({
  name, description, params, mutates,
  expose: { tool: 'core' | ToolsetId | false, console: boolean },
  verbs?: [{ verb, fixed?, defaults?, order?, summary? }],
  outsideTxn?(raw): boolean,   // console で txn の外・単独行で走らせる (例: .qsc の load)
  format?(data): string[],     // console での表示 (無ければ汎用の key: value 表示)
  run(ctx, args, oc: OpContext),
})
```

- `OpContext` は `sceneId` / `viewId` / `callId` / `markMutated` / `noteStream` / `streamId` と、
  UI を持つ呼び出し元だけが渡す `openScene`。
- `invokeOp` が唯一の実行入口: throw を失敗に変え、成功した `mutates` op で `markMutated` を呼ぶ。
- `runInTxn` が txn 規則: 変更があれば (途中で失敗しても) commit、無ければ rollback
  (空 commit は redo を消すため)。agent の 1 turn、console の 1 submit がそれぞれ 1 txn。

## 4. AI agent への公開

- `expose.tool: 'core'` は常に渡す (上限 21、`MAX_TOOLS`)。
- toolset に属する op は、モデルが `enable_toolsets` で有効にした次の step から渡す
  (`prepareStep` / `activeTools`)。有効化は会話の間続き、履歴から復元する。
- 詳細は [ai-agent-plugin.md](ai-agent-plugin.md) §3.3 / §5。

## 5. Console

**runtime**: 1 submit = 1 txn (label は dialect の接頭辞 `cmd:` / `pym:`)、失敗で以降を中止、
lone `undo` / `redo` と `outsideTxn` のコマンドは txn の外、script は最大 8 段のネスト、Stop で
ダウンロードも中断。

**native dialect** (既定。prompt `CueMol>`):

- コマンドは `CONSOLE_COMMAND_OPS` から生成する。op 名 (`set_visible`) と各 verb (`show` / `hide`)
  の両方で呼べる。verb の `fixed` 引数は引数一覧に出ない (指定できない)。
- 引数は PyMOL と同じくカンマ区切り (`zoom 1crn, chain A and resid 10:20`)。selection が空白を
  含むため、空白区切りは採らない。`key=value` も使える。
- 主な verb: `show` / `hide`、`select`、`zoom` / `center`、`turn`、`view` / `slab` / `fit_slab`、
  `load` (`.qsc` は panel が開く) / `fetch`、`set` / `get` (property path)、`props`、`png`、
  `ls_scene`、`delete` / `rename` / `retype`。console 自前の builtin: `cd` / `pwd` / `ls` / `run` / `log_open` / `log_close` /
  `log` / `undo` / `redo` / `help`。script の拡張子は `.cml`。
- 結果は op の `format`、無ければ `formatData` (key: value、名前の列は折り返し、最大 40 行)。
- 補完は param の意味型から: enum 値、object / renderer / node 名、名前付き selection、色、
  renderer type (前の object 引数から)、property path (階層ごと)、property 値 (enum / boolean)。
  path 以外の自由文字列はファイル名に fall back しない。

**PyMOL dialect** (prompt `PyM>`): 従来の pymconsole のコマンド。PyMOL の名前・引数・選択式
(CueMol 式へ翻訳) と `pym:<rep>` 規約はこの dialect の中に閉じる。

**panel**: toolbar の CueMol / PyMOL 切り替え、または `native` / `pymol` と打つと切り替わる。
選択は plugin preference (`console.dialect`)、履歴は dialect ごと (PyMOL は旧 key を引き継ぐ)。

## 6. 未対応 (範囲外)

- GUI 用 service のうち op になっていないものは agent / console から使えない。必要になった順に
  op を足す (`set_view` は `viewXform` service をそのまま包んで足した例)。
- MCP server、アクションの記録と再生、undo 履歴 UI は別計画
  ([260926 計画](../plans/260926-mcp-tool-catalog-plan.md) の D4 以降、
  [261006 計画](../plans/261006-native-console-op-catalog-plan.md) の「将来」)。
