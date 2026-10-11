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
  expose: { tool: 'core' | ToolsetId | false, console: boolean, mcp?: boolean },
  aliases?: [{ name, fixed?, defaults?, order?, summary? }],
  group,                       // help の分類 (OP_GROUPS)
  outsideTxn?(args): boolean,  // txn の外で走らせる (例: .qsc の load)。console の文字列でも JSON の値でも呼ばれる
  format?(data): string[],     // console での表示 (無ければ汎用の key: value 表示)
  run(ctx, args, oc: OpContext),
})
```

- `OpContext` は `sceneId` / `viewId` / `callId` / `markMutated` / `noteStream` / `streamId` と、
  UI を持つ呼び出し元だけが渡す `openScene`、中断を伝える `cancelled()`、書き込み先の制限
  `fileAccess` (`'any'` = console、既定は desktop のみ。`catalog/outputFile.ts`)。
- `invokeOp` が唯一の実行入口: selection 引数を実行前に検査し (どの呼び出し元でも同じ)、throw を
  失敗に変え、成功した `mutates` op で `markMutated` を呼ぶ。
- 引数の読み方: console は文字列を、MCP と agent は JSON を、それぞれ型に読んでから同じ `checkArg`
  (`catalog/argValues.ts`) で検査する。整数に 1.5、真偽値に `maybe` は、どちらから来ても断る。
  文字列の真偽値・数値は `parseBoolText` / `parseNumberText` (空は数値にしない) で読み、property 値・
  アニメーションの property・reader のオプション・PyMOL dialect も同じ関数を使う。
- 入力ファイルのパスは `callerPath` (`catalog/outputFile.ts`) で絶対パスにする: `~` は home、相対は
  desktop から (console は自分の cwd で解決済み)。出力の `outputPath` と同じ基準。
- 一覧の番号は 1 から (`worker/shared/numbered.ts` の `numbered` / `pickByNumber` / `checkPosition` /
  `findBySpec`)。よく出る失敗の文言は `catalog/errors.ts`。
- `runInTxn` が txn 規則: 変更があれば (途中で失敗しても) commit、無ければ rollback
  (空 commit は redo を消すため)。agent の 1 turn、console の 1 submit がそれぞれ 1 txn。
  `outsideTxn` の op は `runExclusive` で txn の外で走らせるが、その間も `txnBusy()` は busy を返す
  (scene の保存・open の途中に他の編集が割り込まないように)。

## 4. AI agent への公開

- `expose.tool: 'core'` は常に渡す (上限 21、`MAX_TOOLS`)。
- toolset に属する op は、モデルが `enable_toolsets` で有効にした次の step から渡す
  (`prepareStep` / `activeTools`)。有効化は会話の間続き、履歴から復元する。
- 詳細は [ai-agent-plugin.md](ai-agent-plugin.md) §3.3 / §5。
- tool の規則と selection の早見表は `catalog/guide.ts` (`TOOL_RULES`、`SELECTION_CHEAT_SHEET`) に
  あり、agent の system prompt と MCP の `instructions` が共有する。結果の JSON 化は
  `catalog/toolOutput.ts` の `serializeToolOutput`。

## 4.1 MCP への公開

- `expose.tool !== false` の op を全て MCP の tool として公開する (toolset の段階なし)。
  `expose.mcp: true` は agent には出さず MCP にだけ出す: `outsideTxn` の op (agent の turn は全体が
  1 txn なので実行できない) と、console で使える Tools 系・アニメーション編集の op (agent の tool 一覧は
  短く保つが、MCP client は自分で選ぶ)。
  1 call = 1 undo txn (`MCP: <name>`)、`fileAccess: 'any'`。
- agent の turn・console の submit・MCP の call は `txnBusy()` で排他し、busy なら待たずに断る。
- 詳細は [local-api-server.md](local-api-server.md)。

## 5. Console

**runtime**: 1 submit = 1 txn (label は dialect の接頭辞 `cmd:` / `pym:`)、失敗で以降を中止、
lone `undo` / `redo` と `outsideTxn` のコマンドは txn の外、script は最大 8 段のネスト、Stop で
ダウンロードも中断。
terminal からは thin client `tritium_cli` で同じ runtime を使える (作業ディレクトリは client 側。
[local-api-server.md](local-api-server.md) §5)。

**native dialect** (既定。prompt `CueMol>`):

- コマンドは `CONSOLE_COMMAND_OPS` から生成する。op 名 (`set_visible`) と各 alias (`show` / `hide`)
  の両方で呼べる。alias は 1 つの op を呼ぶ別名で、引数を固定 (`fixed`。引数一覧に出ず、指定できない)・
  既定 (`defaults`)・並べ替え (`order`) できる。ユーザー定義のコマンド列とは別物。
- 引数は PyMOL と同じくカンマ区切り (`zoom 1crn, chain A and resid 10:20`)。selection が空白を
  含むため、空白区切りは採らない。括弧と引用符の中のカンマは区切りにしない (`parser/parseArgs.ts`)。
- 引数の割り当て規則は dialect ごと (`ConsoleDialect.argRule`、`parser/bindArgs.ts` の `assignArgs`):
  - native は **Python の呼び出しと同じ**: 位置引数は先頭から順に埋まり、名前付き (`name=value`) の後には書けない。
    同じ引数を 2 回書くとエラー。
  - PyMOL dialect は PyMOL のまま: 位置引数は名前付きも数えた全体の番号の引数に入り、重複は後勝ち、LEGACY 展開あり。
- 主な alias: `show` / `hide`、`select`、`zoom` / `center`、`turn`、`view` / `slab` / `fit_slab`、
  `load` (`.qsc` は panel が開く) / `fetch`、`set` / `get` (property path)、`props`、`scene`、
  `count`、`delete` / `rename` / `retype`、`render` (ray tracing / GI。Stop で中断)、
  `save` / `write`、`save_view` / `restore_view` / `cameras`、`projection` / `pan` / `focus`、
  `contour`、`define`、`style`。
- console と MCP にだけ出す op (`tool: false, mcp: true`。agent には出さない): Tools メニューの dialog に当たる
  `calc_elepot`・`cut_surface`・`list_morph_frames` / `add_morph_frame` / `remove_morph_frame`、
  アニメーション編集の `list_anims` / `add_anim` / `set_anim_prop` など。
- console 自前の builtin: `cd` / `pwd` / `ls` / `run` / `open_log` / `close_log` / `log` /
  `undo` / `redo` / `help`、scene (タブ) の `list_scenes` (短縮形 `scenes`) / `create_scene` /
  `switch_scene` / `close_scene` ([local-api-server.md](local-api-server.md) §5.2)。script の拡張子は `.cml`。
- `quit` / `exit` (両 dialect 共通。`runtime/quitCommand.ts`。`exit` は引数を取らない `quit`): app を終了する。worker は
  scene コマンドと同じく `requestScene({ op: 'quit', force })` で panel に渡し、`runSubmission` が
  `IPC.APP_QUIT` で main (`main/appQuit.ts`) に頼む。Cmd+Q と同じ保存確認を出し、`force` (`true` /
  `--force` / `-f`) なら確認なしで終了する。後続のコマンドは捨てる。script (`run` / `@file`) 内では使えない。
- `help` は対象ごとの見出し (op の `group`、`OP_GROUPS`) に分けて一覧し、`help <subject>`
  (`help animation` など) でその見出しだけを出す。
- 結果は op の `format`、無ければ `formatData` (key: value、名前の列は折り返し、最大 40 行)。
- **Tab 補完** (`completion/complete.ts`。設計は [計画](../plans/261009-console-completion-plan.md)):
  - 入力途中の行を実行時と同じ規則で読む (`scanArgs` の partial、`assignArgs`)。書きかけの括弧の中は 1 つの引数。
  - その位置に書けるものを全部出す: 次の位置の引数の値と、まだ書いていない引数の `name=` を、見出しを分けて一覧する。
    `name=` を書いた後はその引数の値。native で名前付きの後は `name=` だけ。
  - 値の候補源は param の意味型から (`fromCatalog.ts` の `completionOf`): enum 値、object / renderer / node 名、
    selection (scene と app の名前)、色、renderer type (object、renderer、読み込むファイルの reader、分子)、
    property path (階層ごと)、property 値、ファイル (path 型)。前の引数は名前で受け取る (`SourceContext.bound`)。
  - 候補は文字列か `CompletionItem { text, then }`。確定後に付ける区切りは候補ごと: `name=`・`obj.`・ディレクトリは
    何も付けず、値は引数が残っていれば `, `。何も入力していないときに候補が `name=` 1 つだけなら、書かずに一覧する。
  - 照合は引数全体を先に、それで始まる候補が無ければ最後の単語 (空白・カンマ・括弧の後)。
  - 候補が無いときのファイル名 fall back は PyMOL dialect だけ (`ConsoleDialect.fileFallback`)。native は path 型の引数だけがファイルを出す。

**PyMOL dialect** (prompt `PyM>`): 従来の pymconsole のコマンド。PyMOL の名前・引数・選択式
(CueMol 式へ翻訳) と `pym:<rep>` 規約はこの dialect の中に閉じる。
`ray` は native の `render_image` で一時ファイルに描き、undo 位置とカメラを署名として覚える。
直後の `png` (幅・高さ指定なし) は、署名が変わっていなければその画像を書き出す。`png ..., ray=1`
はその場で ray tracing する。

**panel**: toolbar の CueMol / PyMOL 切り替え、または `native` / `pymol` と打つと切り替わる。
選択は plugin preference (`console.dialect`)、履歴は dialect ごと (PyMOL は旧 key を引き継ぐ)。

## 5.1 コマンド名の規約

op 名 (= console のコマンド名、MCP と agent の tool 名) と alias は次の規約で付ける。
`plugins/console/worker/dialects/native/naming.test.ts` が動詞と `help` の分類を検査する。
経緯と対応表は [計画](../plans/261009-command-naming-plan.md)。

- **op 名は `動詞_目的語`** (snake_case): `list_cameras`、`add_paint`。`名詞_動詞` (`anim_add`) や
  名詞だけ (`scenes`) の op 名は付けない。目的語が自明な固有の動作は動詞だけ (`superpose`、`animate`)。
- **動詞の語彙**:

  | 動詞 | 意味 |
  |---|---|
  | `list` | 複数のものを一覧する (目的語は複数形) |
  | `get` | 1 つのものの状態や値を読む |
  | `set` / `reset` | 既にあるものの属性を書き換える / 既定値に戻す |
  | `create` / `delete` | scene の node (object・renderer・group・camera・scene) を作る / 消す |
  | `add` / `remove` | あるものの中の項目 (bond・paint・アニメーション要素・morph frame・相互作用) を足す / 除く |
  | `move` / `rename` | 並べ替える / 名前を変える |
  | `clear` | 中身を全部消す |
  | `apply` | 名前の付いたもの (style・camera) を当てる |
  | `load` / `save` | CueMol のファイルを読み書きする |
  | `export` | 画像や他の形式に書き出す |
  | `fetch` | ネットワークから取ってくる |
  | `calc` / `recalc` | 計算して結果を作る / 作り直す |
  | `show` / `hide` | 表示する / 隠す (この意味だけ。情報の表示には使わない) |

  固有の動詞 (`superpose`、`measure`、`merge`、`cut`、`rotate`、`pan`、`focus`、`center`、
  `recenter`、`analyze`、`render`、`animate`、`renumber`、`define`、`count`、`capture`、`quit` / `exit` など) は、
  上の動詞と意味が重ならないものに限って使う。`make` / `gen` / `new` (→ `create`)、
  `compute` / `regen` (→ `calc` / `recalc`)、`change` / `update` (→ `set`)、一覧の `get` (→ `list`) は使わない。
- **目的語**: `scene`、`object`、`renderer`、`group`、`camera`、`view`、`prop(s)`、`selection`、
  `paint`、`anim`、`morph_frame`、`map_contour`、`surface`。分子に限るものは `mol` を付ける
  (`set_mol_selection`) が、chain / residue には付けない (`list_chains`)。
- **alias** (console だけの短縮形。MCP と agent には出さない):
  - 1 語の動詞 (`load`、`save`、`write`、`delete`、`select`、`focus`、`turn`、`render`、`count`)。
  - 名詞だけの alias は「引数なしで表示、引数ありで設定」するものに限る (`scenes`、`cameras`、`props`、
    `scene`、`view`、`slab`、`projection`、`style`、`contour`)。作成や書き出しに名詞の alias は付けない。
  - PyMOL の語 (`ray`、`png`) は PyMOL dialect が持ち、native には入れない。

## 6. 未対応 (範囲外)

- GUI 用 service のうち op になっていないものは agent / console から使えない。op 化の対象と
  状況は [網羅計画](../plans/261006-op-catalog-coverage-plan.md)。APBS、morph、アニメーションの
  編集、POV-Ray 出力は未対応。
- MCP server、アクションの記録と再生、undo 履歴 UI は別計画
  ([260926 計画](../plans/260926-mcp-tool-catalog-plan.md) の D4 以降、
  [261006 計画](../plans/261006-native-console-op-catalog-plan.md) の「将来」)。

### Tools 系の op (`ops/apbsOps.ts`, `ops/toolOps.ts`。console と MCP)

- `calc_elepot`: APBS の job (pdb2pqr -> apbs、外部プロセス) を dialog と同じ service で
  起動し、終わるまで待つ (`waitForApbsJob`、Stop で kill)。実行ファイルのパスと既定の force field は
  Settings の値を `ApbsConfigProvider` が worker に送っておいたもの (`setApbsDefaults`、
  `services/apbs/defaults.ts`)。他の値は dialog の既定 (温度 298.15、誘電率 78.54 / 2.0)。
- `cut_surface`: view の前面 slab 面で分子表面を切る (Mol surface cutter)。
- `list_morph_frames` / `add_morph_frame` / `remove_morph_frame`: 分子の morphing frame の一覧・追加 (PDB ファイル
  または scene の分子から。普通の分子は先に MorphMol に変換され uid が変わる)・削除。再生の設定は
  Animation panel。
- `set_secondary_structure` は再計算に dialog の `ignoreBulge` / `helixGapAngle` も取る。

### アニメーション編集の op (`ops/animOps.ts`。console と MCP)

Animation panel と element inspector が使う service をそのまま呼ぶので、undo の単位も panel と同じ。
再生・停止・時刻移動は既存の `animate`。

- `list_anims`: 長さ・再生状態・loop・開始カメラと、要素ごとの番号 (1 から)・名前・型・`#uid`・
  絶対時刻 (相対時刻と追従先)。時刻の参照が解決しないときはその理由。
- `add_anim type [, name] [, before]`: `spin` / `camera` / `show` / `hide` / `slidein` / `slideout` /
  `mol` / `wait`。直前の要素に追従する (panel の追加と同じ)。
- `remove_anim` / `move_anim element, to` / `set_anim_time element, startMs, endMs` (追従先からの相対 ms)。
- `set_anim_prop element, prop, value`: inspector で書ける property (`name`、`timeRefName`、`disabled`、
  `quadric`、`angle`、`axis` (`"0 1 0"`)、`endcam`、`ignore*`、`rend`、`hide`、`fade`、`tgtAlpha`、
  `direction`、`distance`、`mol`、`startValue`、`endValue`)。値は property の型に変換する。
- `set_anim_options [loop] [, startCamera]`。
- 要素は `list_anims` の番号、`#uid`、名前で指定する (同名が複数なら番号か uid を求める)。
  `list_morph_frames` などの番号も同じく 1 から。
- 追加できない型 (`RealPropAnim` / `RendXformAnim`、ファイル由来) の generic property は未対応。

### GUI の編集操作の op (`ops/editOps.ts` ほか。console と MCP)

dialog・context menu・panel が使う service をそのまま呼ぶ (undo の単位も GUI と同じ)。一覧は 1 から番号を振る。

- `reset_prop path` (inspector の Reset。`node.*` で Reset all = 変更済みで既定値のある property を 1 txn で)、
  `clear_undo` (Edit > Clear undo data。txn の外で実行)
- `renumber_residues molId, shift|start, value [, selection] [, renumber]`、`add_bond` / `remove_bond molId, A/20/SG A/45/SG`、
  `set_symmetry molId, a, b, c, alpha, beta, gamma, spaceGroup`
- `create_group objId [, name]`、`create_surface_from_map rendId` (map の isosurf のみ)、`recalc_surface surfId [, density]`
- `list_interactions` / `remove_interaction rendId, number` (距離・角度・二面角の個別削除)
- `list_paint` / `set_paint` / `remove_paint` / `move_paint` (paint の各エントリー。原子は最初に一致したエントリーの色)
- `set_elepot_coloring rendId [, map] [, low] [, high]` (molsurf / dsurface を静電ポテンシャルで色付け)
- `recenter_map rendId` (map を view の中心で描き直す)、`export_scene path [, format] [, width] [, height] [, transparent] [, dpi]`
  (png / pov / stl / mqo)
- camera: `rename_camera`、`move_camera name, to`、`save_camera` / `apply_camera` の `withVisibility`
  (表示・非表示も保存・適用。適用時は txn を commit する)
- `animate` に `pause` を追加し、`timeMs` は seek のときだけ必要

### view property と reader のオプション

- **view property** (View > View property の inspector と同じ generic property bridge):
  - `list_node_props` / `set_node_prop` の `nodeType` に `view` を足した。nodeId は不要で、呼び出し元の view を指す。
  - console では `props view`、`get view.stereoMode`、`set view.centerMark, axis` と書く。property path の補完は先頭で `view.` を出す。
  - `view.` で始まる path は、`view` という名前の object が無いときだけ view を指す (`refs.ts` の `resolvePropPath`)。
  - View の property には既定値が無いので (View.qif の default はコメントアウト)、`reset_prop view.xxx` は断る。
- **ファイルの読み込みと reader のオプション** (`catalog/fileLoad.ts`、`ops/loadFormatOps.ts`):
  - reader の選び方は GUI と同じ規則 (`shared/openFileKind.ts` の `classifyOpenFile`。File > Open・drop と共有):
    scene reader の拡張子なら scene として開く。拡張子を受け持つ reader がちょうど 1 つならそれ、2 つ以上か
    無ければ中身で決める (sniff)。その後は `OpenObjByPath` と同じく、選んだ reader の既定のオプションで `loadObject`。
  - `load_file` (`load`) の引数は `path` / `rendererType` / `selection` / `name` だけで、オプションは reader の既定値。
  - オプションを変えるときは形式ごとの op (console / MCP、agent には出さない)。引数名は `fileOpenTypes.ts` の
    option 型と同じで、null は reader の既定値。形式の違うファイルは断る (`load_mtz f.pdb` → not an MTZ file)。
    - `load_pdb` (PDB / mmCIF): `loadModel`、`loadAnisou`、`loadAltConf`、`loadSegid`、`build2ndry`、`autoTopology`
    - `load_mtz`: `columnF`、`columnPhi`、`columnWeight`、`resolutionLimit`、`gridSpacing` (列を指定するとその列を使う)
    - `load_ccp4`: `normalize`、`truncateMin`、`truncateMax` (指定すると切り捨てる)、`mapType`、`subsample`
    - `load_msms` (`vertFile`)、`load_namd` (`psfFile`)、`load_amber` (`coordFile`)
