# Action log と qax (CueMol actions XML)

scene に加えた変更を、undo 履歴の 1 項目ごとに「実際に実行した native の op」として記録する
仕組みと、その記録を書き出して再生するファイル形式 qax の仕様。GUI・console (native / PyMOL)・
MCP・agent の、どこから実行した変更も同じ形で記録する。

確認と書き出しには、GUI の Actions view (History pane, §5) と、console の builtin
(`list_actions` / `export_actions`, §4.3) を使う。

関連: [op catalog と console](op-catalog.md)、[PyMOL dialect](console-pymol-dialect.md)、
[local API server](local-api-server.md)。

## 1. 記録の単位: 1 行 = 1 undo transaction

記録の本体は `tritium/react-gui/src/renderer/worker/server/actions/actionLog.ts`。

- 記録は scene ごとに持つ。中身は undo stack と同じ順の行 (`ActionRow`) の並び。
  - 行が持つもの: `label`、`source`、`time`、`entries`、`undone`。
  - `label` は undo stack の説明文と同じ文字列 (`Change property: width`、`cmd: show 1crn` など)。
  - `source` は `gui` / `cmd` / `pym` / `mcp` / `ai` / `qax` のどれか。
  - `entries` はその txn の中で実行した op の並び。各 entry は、op の catalog 名・型付きの引数・
    node 引数の path を持つ。
- 行は `id` も持つ。session 内で一意で、単調に増える (reconcile で作り直した行にも新しい id を
  振る)。GUI の選択と Inspector の対象は、この id で持つ (行番号は redo 側が切れると変わるため)。
- commit で行が 1 つ増え、redo 側の行は消える (C++ の `UndoManager` と同じ)。
- undo / redo では、redo 側にある行に `undone` の印が付くだけで、行そのものは消えない。
- session 内だけの記録で、scene と一緒には保存しない。

### 1.1 commit の検出

TS から txn を開く経路は次の 3 つの helper だけなので、その中に hook (`txnBegin` / `txnEnd`) を置く:

- `withUndoTxn` / `undoTxnResult` (`services/withUndoTxn.ts`)
- `runInTxn` (`catalog/opRuntime.ts`)

C++ の `SCE_SCENE_UNDOINFO` は使わない。この event は nest の内側の commit や空の commit でも
発火するので、txn の数とは一致しない。

- **nest**:
  - frame は scene ごとの stack に積む。
  - 内側の frame が commit したら、その entries を外側の frame へ移す。rollback したら捨てる。
  - C++ も内側の txn を外側に吸収し、label は外側のものが残るので、それと一致する。
- **一番外側の commit**:
  - 開いた時点の `getUndoSize()` より大きくなっていれば行を足す。
  - どちらの場合も、それより後ろの行 (redo 側) は切る。空の commit でも C++ は redo を消すため。
- **rollback**: 行は足さない。

### 1.2 reconcile

undo / redo、`clearUndoData`、scene の読み込み (`clearAllData`) など、commit を経ずに stack が
変わる操作は event を出さない。そこで、次のタイミングで行と C++ の stack を突き合わせる
(`reconcile`):

- 外側の txn を開くとき
- commit した後
- 行を取り出すたび (`actionRows`)

突き合わせの規則:

- C++ 側の説明文 (`getUndoDesc(i)` / `getRedoDesc(i)`) と、先頭から順に比べる。
- 一致しなくなった位置から後ろは、label だけの行 (`source` と `time` は null、entries は空) に
  作り直す。
- `undone` の印は `getUndoSize()` に合わせる。
- scene が無くなっていたら、その記録を消す。

## 2. 何が記録されるか

### 2.1 op (console・MCP・agent・qax の再生)

`invokeOp` (`catalog/opRuntime.ts`) が、成功した op を、開いている txn の行に足す。記録の条件:

- txn が開いていて、かつ別の op の実行中ではないこと。op が中で別の op を呼んだ場合は、外側の
  op だけが記録される。
- 次のどれかに当たること:
  - `op.mutates`
  - 実行中に `markMutated` が呼ばれた
  - `op.replay` が真
- **`replay`** (`catalog/op.ts`): undo stack には載らないが、再生では繰り返す必要がある view の op
  に付けるフラグ。値は真偽値か、引数を受け取る述語。
  - `true`: `rotate_view` / `pan_view` / `apply_camera` / `focus_node`
  - 述語: `set_view` (zoom / slab / distance / center のどれかが非 null、または fitSlab のとき)、
    `set_projection` (perspective が非 null のとき)。引数が無ければ getter なので記録しない。
  - replay の op は、外側の txn が commit したときだけ残る。読むだけの submit は rollback する
    ので、その中で回した view は記録に残らない。
- node 引数 (semantic が object / renderer / node) は、op を **実行する前に** path
  (`obj` / `obj/rend`) に直して控える。こうしておくと、delete / rename した後でも元の名前で書き出せる。
  - 同じ path の node が他にもある場合は path を控えない (uid だけを持つ)。

### 2.2 GUI と PyMOL dialect: service が自分の op を記録する

GUI (dialog・Inspector・scene tree) は op を通らず、worker の service を直接呼ぶ。PyMOL dialect
も service 関数を直接 import して呼ぶ。そこで記録点を service 関数そのものに置き、同じ op で
できる変更は、その op と引数で記録する (`actions/serviceOps.ts` の `recordOp` と、その上に作った
helper)。

- 記録は service の txn の中で行う。txn の外 (Inspector の drag 中の preview / abort など) では
  何も記録されない。
- op の実行中は、service 側では記録しない。op を経由した呼び出しでは op 自体が記録されるので、
  二重にならない。
- PyMOL のコマンドは、呼んだ service の分だけ native の op が並ぶ。たとえば `show sticks` は
  `create_renderer ... name=pym:sticks, selection=...` として記録される。PyMOL の入力文字列は、
  内部データにも qax にも持たない。行の `label` (`pym: ...`) に残るだけ。

対応している service:

| service | 記録する op |
|---|---|
| `setGenericProp` / `setGenericProps` (`props/write.ts`) | `set_node_prop`。rendGroup は renderer として、scene / view は nodeId を null にして書く。group の改名は `rename_node`、group の表示切替は `set_visible` |
| `resetGenericProps` と、reset の write | `reset_prop` (path は scene なら `prop`、view なら `view.prop`、node なら `obj/rend.prop`。path が引けなければ `#uid.prop`) |
| scene tree の delete / rename (`sceneTree/sceneOps.ts`) | `delete_node` / `rename_node`。scene の改名は `set_node_prop name` |
| `focusOnNode` | `focus_node` |
| `setNodeVisible` (`sceneTree/sceneTree.ts`) | `set_visible` |
| `applyMolSelString` | `set_mol_selection`。selection への center / zoom (`centerMolSelection` / `zoomMolSelection`) は `center_view` |
| `superposeMol` | `superpose`。transform (xformMat) として保つときは `keepAsProperty` |
| `createRendererOnObject` | `create_renderer` (type・name・selection・`centerView`)。group 指定があれば、続けて `group` の `set_node_prop`。preset は `create_preset_renderer` (preset・group 名・`centerView`) |
| `changeRendererType` | `set_renderer_type` |
| `loadObject` (File > Open) | 形式ごとの load の op (`load_pdb` / `load_mtz` / `load_ccp4` / `load_msms` / `load_namd` / `load_amber`、どれでもなければ `load_file`) に、dialog の形式のオプションと renderer の選択 (type・selection・`rendererName`・`preset`・`centerView`・`mapCenterPolicy`) を入れる。reader は op が自分で選ぶ (dialog で別の reader を選んだときは、再生で形式が合わず断られることがある) |
| `viewXform` (回転・平行移動) | 0 でない軸ごとの `rotate_view`、`pan_view` |
| map の property (`map/props.ts`) | renderer への `set_node_prop`。Re-centre は `recenter_map` (中心は再生したときの view の中心) |
| 背景色 (`scene/sceneBgColor.ts`、メニューの背景色) | scene の `set_node_prop bgcolor` (色名のまま)。Color proofing は切り替えた後の `use_colproof` (と既定の `icc_filename`) の `set_node_prop` |
| `applyRendererStyle` (Style サブメニュー) | `apply_renderer_style` |
| scene tree のまとめて表示・非表示 / 削除 (`sceneTree/bulkSceneNodeOps.ts`) | node ごとの `set_visible` / `delete_node` (削除は破棄の直前に記録) |
| `applyRendererStyleList` (Edit Style ダイアログ) | `set_renderer_styles` (style の並び全体を `,` 区切りで) |
| coloring scheme の property (`coloring/applyColoring.ts` の `setColoringProp`。Color pane の CPK / Rainbow / B-factor の欄) | `set_coloring_prop` (対象の renderer か object、property 名、値)。style から借りた着色なら、先にその node 専用の着色に切り替えてから書く (GUI と同じ) |
| 着色 (`coloring/applyColoring.ts`、`colorTargets.ts`、`multiGrad.ts`) | `set_renderer_coloring` / `set_elepot_coloring` / `set_default_color`。coloring の target・elepot の property・multigrad の color map は `set_node_prop`。着色と paint の op は対象を `nodeId` + `nodeType` (`renderer` / `object`) で取るので、Color pane で object を対象にした変更も記録する (style と elepot は renderer のみ)。CPK の dark / light gray は CPK と `set_coloring_prop col_C` の 2 つ。既定の paint 表と multigrad への切り替えは `set_renderer_coloring` の mode `paint-type-paint` / `paint-type-multigrad`、multigrad の node の編集は `set_multigrad_nodes` (`"値 色; 値 色"`)。style は Paint の style と CPK の style (`DefaultCPKColoring` ほか。`list_coloring_styles` が両方を出す) |
| paint の表 (`coloring/paintCrud.ts`、`paintClipboard.ts`) | `set_paint` / `remove_paint` (複数行は 1 行ずつ) / `move_paint` / `clear_paint`。行の挿入と貼り付けは行ごとの `add_paint_at` (挿入位置 `at`。`add_paint` と違い molecule の selection を変えない)。番号は 1 始まり |
| 分子の編集 (`molops/`) | `rename_chain`、`renumber_residues`、`delete_atoms`、`merge_molecules`、`set_secondary_structure`、`create_surface` / `recalc_surface` (`backend` 付き)、`cut_surface`、`set_symmetry`、`show_symmetry`、`show_unit_cell`、`create_symmetry_copy` (operator の番号は表示範囲で変わるので 4x4 の行列で記録)、`analyze_interactions` (dialog の設定をすべて: 最小距離、最大の数、label set、2 つ目の object / selection) |
| morph (`morph/morphMol.ts`) | `add_morph_frame` / `remove_morph_frame` / `convert_to_morph` |
| APBS (`apbs/run.ts`) | `calc_elepot`。pot file を読む txn で記録する。温度・誘電率・水素の扱いも引数に入れる |
| 選択 (`select/`、3D view の右クリックメニュー、矩形・lasso 選択) | `set_mol_selection` (最終的な selection の文字列)。名前付き selection の保存は `define_selection` |
| renderer (`rend/`) | `create_group`、`create_surface_from_map`、`set_renderer_selection`、`remove_interaction` |
| アニメーション (`anim/`) | `add_anim` / `remove_anim` / `move_anim` / `set_anim_time` / `set_anim_prop`。一覧に無い property (Inspector の generic tab) は `set_anim_generic_prop`、reset は `reset_anim_prop` (まとめての reset も)。要素は名前 (一意のとき) か 1 始まりの番号で指す (uid は再生で変わるので使わない) |
| camera (`camera/`) | `save_camera` (名前は前後の空白を除いて保存する) / `delete_camera` / `rename_camera` / `move_camera`。visibility 付きの camera の適用は `apply_camera` |
| 並べ替え (scene tree・paint の表・アニメーション・camera) | `move_node` / `move_paint` / `move_anim` / `move_camera` を、行き先を `by` (動いた段数) で記録する。番号 (`to`) で記録すると、長さの違う一覧で再生したときに別の位置に入るため。動かす要素の指し方 (paint の番号など) は再生先で別の要素を指し得るが、GUI の操作から意図は分からないので、切り出した action を利用者が直す前提にする |
| style set の selection 定義 (`style/styleSetEdit.ts`) | `define_selection`。scene の既定の set 以外は `styleSet` (set の名前。scene の set を global より先に引く) |
| ファイルと map の取得 (`file/streamLoadFromUrl.ts`、`map/streamLoad.ts`) | RCSB の標準の URL は `fetch_pdb` (名前と renderer の選択付き)、それ以外の URL は `fetch_url` (URL・reader・名前)。map は `fetch_map` (`source` が RCSB_CIF か EBI_MTZ) |
| 計測ツールと結合の編集 (`navi/`) | `measure_geometry` / `add_bond` / `remove_bond`。2 つの object にまたがる計測は `measure_geometry` の `atomObjects` (2 つ目以降の原子の object)。selection どうしの計測 (PyMOL の `distance` など) は `measure_selections`。原子は `A.20.CA` (chain.resid.atom) の形で書く |
| 原子名ラベル (`navi/naviTool.ts`、navigate tool のクリック) | `set_atom_label` (切り替えた後の on / off)。C++ の `NameLabelRenderer` のラベルの追加・削除・書式の変更は undo に載る |
| render settings (`renderSettings/`) | `set_render_settings` (`"key=value; ..."`) |
| Sequence panel の残基の選択 (`plugins/sequence/worker/seqPanelOps.ts`) | `set_mol_selection` (選んだ後の selection の文字列) |

表に無い service の txn は、label だけを持つ行になる。`list_actions` ではこの行に
`# no op recorded for this edit` と出し、qax には `<note>` として書く。dev build (`__DEV_UI__`) では、
GUI の txn が undo の行を増やしたのに op が 1 つも無いとき、`[actionLog] no op recorded: <label>` を
console に出す (記録の漏れを見つけるため)。

- **引数の大きさの上限**: op の引数が JSON で `MAX_RECORDED_ARGS_BYTES` (64 KB、`actions/serviceOps.ts`)
  を超えたら、その op は記録しない。代わりに `dropped` の付いた note
  (`not recorded: <op> (<大きさ>, over the 64 KB limit)`) を残す。qax が数 MB になるのを避けるため
  (object の貼り付けの XML は座標を含む)。History の行は `<label>: not recorded: ...` と出し、この
  step を含む選択はマクロにできない。
- **view の property**: C++ は View の property の undo を持たないので、Inspector の view の property
  は txn を開かずに書く (空の commit が Redo を消すため)。記録もしない (§2.3)。

### 2.3 記録できていないもの (既知)

- PyMOL dialect のうち、service を通らずに C++ を直接変更するもの。例: `show sticks` の
  `applyStyles`、`label`、`set_view` の回転、`orient`、`center`、`frame`。そのコマンドの行には、
  service を通った部分の op だけが入る。
- 対応する op が無いもの: camera の visibility flag と camera ファイルの
  読み書き、style set の作成・削除・読み書きと色・style の編集、node の貼り付け、MD trajectory (mdtools plugin の service で、plugin から op を足す仕組みが無い)。全体の一覧と対応の順序は
  [261013-action-record-coverage-plan.md](../plans/261013-action-record-coverage-plan.md)。
- 記録しても再生で同じにならないもの: URL からの取得は、相手のファイルが変われば変わる。番号で指す要素 (paint の行など) は、再生先の一覧が違えば別の要素を指す。
- **視点の変更は記録しない** (意図して): View / Camera の変化は C++ の undo の対象ではなく、History は
  undo の履歴だから。3D view のマウス操作、View pane、projection、camera の適用 (visibility なし)、
  focus、console の `turn` / `zoom` などは、op を記録しても undo の行ができないので残らない。
  アニメーションの loop と start camera (`AnimMgr`) も undo に載らないので同じ。op 自体は console・
  MCP・手で書いた qax では使える。
- reconcile で作り直した行は、op の中身を失う (label だけになる)。

## 3. qax 形式 (v1)

拡張子は `.qax`、ルート要素は `<cuemol-actions version="1">`。JSON 版は作らない。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cuemol-actions version="1">
  <action label="Change property: width" source="gui" time="2026-10-11T01:02:05.000Z">
    <op name="set_node_prop">
      <arg name="nodeType">renderer</arg>
      <arg name="nodeId" path="1crn/cartoon1" uid="12"/>
      <arg name="prop">width</arg>
      <arg name="value">2.5</arg>
    </op>
  </action>
  <action label="cmd: measure">
    <op name="measure_distance">
      <arg name="atoms">
        <atom chain="A" resid="10" name="CA"/>
        <atom chain="B" resid="12A" name="N"/>
      </arg>
    </op>
    <op name="rotate_view"/>
  </action>
  <action label="Paint" source="gui">
    <note>no op recorded for this edit</note>
  </action>
  <action>
    <cmd>zoom 1crn, chain A</cmd>
  </action>
</cuemol-actions>
```

マクロは、引数 (`<param>`) を取る名前付きの op の並び。`<action>` と同じファイルに並べられる:

```xml
<cuemol-actions version="1">
  <macro name="cartoon-hide" label="Cartoon &amp; hide" description="...">
    <param name="target" type="MolCoord" label="Target"/>
    <op name="create_renderer">
      <arg name="objId" param="target"/>
      <arg name="rendererType">cartoon</arg>
      <arg name="name">p_cartoon</arg>
    </op>
    <op name="set_visible">
      <arg name="nodeId" param="target" sub="p_cartoon"/>
      <arg name="nodeType">renderer</arg>
      <arg name="visible">false</arg>
    </op>
  </macro>
</cuemol-actions>
```

### 3.1 要素

| 要素 | 意味 |
|---|---|
| `<action label? source? time?>` | 1 つの txn。属性はどれも省略できる。`source` は記録元 (再生には使わない) |
| `<op name>` | op catalog の op を 1 回呼ぶ。子は `<arg>` だけ |
| `<arg name [path] [uid]>` | op の引数を 1 つ。値は下の規則で書く |
| `<atom chain resid name/>` | `atoms` 型の引数の 1 原子 |
| `<cmd>` | native console のコマンド行。人が手で書くための逃げ道で、記録器はこれを出力しない |
| `<note>` | 実行しない記録 |
| `<macro name label? description?>` | 引数を取る名前付きの op の並び (§3.3)。名前はファイルの中で一意 |
| `<param name type label?>` | マクロの引数。`<macro>` の本体より前に書く。`type` は qif の class 名 (`MolCoord`、`Object` など)。catalog の semantic 名は使わない |

- 構造は汎用のものだけを決めていて、op ごとのスキーマ (XSD) は無い。どの op がどんな引数を
  取るかは catalog が正本で、検証は再生のときに行う。
- 違う version、ルート要素の違い、未知の要素、壊れた XML はすべてエラーになる。

### 3.2 `<arg>` の値の書き方

値の書き方は、catalog の `ParamKind` / `ParamSemantic` で決まる (`actions/qax/values.ts`):

| 種類 | 書き方 |
|---|---|
| `boolean` | text の `true` / `false` |
| `integer` / `real` | text の 10 進表記 |
| `string` / `enum` | text (XML エスケープ。quote の問題は起きない) |
| `vec3` | text の `x y z` |
| `atoms` | 子要素 `<atom>` の並び |
| node (semantic が object / renderer / node) | 属性 `path` (記録時の `obj` / `obj/rend`) と `uid` (記録した session での uid)。マクロの中では `param` (引数の object) と、その下の renderer 名 `sub` でも書ける |
| null | `<arg>` ごと書かない |

- 書く順序は、catalog の param の宣言順。
- 読むときは `path` を優先し、`uid` は `path` が無いときだけ使う。session をまたぐと uid は
  安定しないため。
- 読んだ値は MCP / agent と同じ `readToolArgs` に渡すので、型の読み方は tool call と一致する。

### 3.3 マクロ

- **束縛** (`actions/qax/run.ts` の `bindMacroItems`): `param` だけの arg は、引数に束縛した
  object の path (`obj`) に、`sub` もあれば `obj/<sub>` になる。あとは `<action>` と同じく
  `resolveRef` で解決する。`sub` は、マクロの中で作った renderer を後の op から指すために使う。
- **検査** (`codec.ts`): マクロ名の重複、宣言の無い param への束縛、`param` の無い `sub`、
  `<action>` の中の `param` はエラー。`param` の arg は他の値 (text・`path`・`uid`) を持てない。
- **実行できる形** (`macroShape`): 引数なし (`none`) か、object の引数 1 つ (`target`。Actions
  pane で選んでいる object を束縛する)。引数が 2 つ以上のマクロは読めるが、`unsupported` として
  実行しない (引数を聞く UI がまだ無いため)。
- **型の判定**: 束縛する object は、`type` の class か、その派生 (`MolCoord` なら `AnimMol` など)
  でなければならない (`catalog/refs.ts` の `isObjectOfClass`)。
- **実行**: 1 回の実行が 1 undo txn (label はマクロの label)。`<cmd>` は console の外では実行できない
  ので断る (`QaxExec.runLine` が無い呼び出し側)。
- console の `run x.qax` は `<action>` だけを再生し、マクロは呼ばない。

### 3.4 実装の置き場所と C++ への移行

- `actions/qax/model.ts`: plain なデータモデル (`QaxDoc`)。
- `actions/qax/codec.ts`: `parseQax(text)` / `writeQax(doc)`。
  - 読み込みには `@xmldom/xmldom` を使う。worker には `DOMParser` が無いため。
  - 書き出しは、1 要素 1 行に字下げした手書きの writer。2 つの log の diff を読みやすくするため。
- `actions/qax/values.ts`: 引数の encode / decode。catalog の param 定義を引数で受け取る。
- `actions/qax/run.ts`: 要素の実行とマクロの束縛 (console と Actions pane が共有)。これだけは op
  catalog を使う。

`model` / `codec` / `values` の 3 つは worker の service にも catalog にも依存しないので、将来はコマンド系とあわせて C++ に
移す。golden file `tritium/react-gui/src/renderer/__test__/fixtures/qax/v1.qax` で形式を pin して
あり、C++ 版も同じファイルで検証できる。

## 4. console

### 4.1 再生 (`run x.qax` / `@x.qax`)

- 1 行に `run x.qax` か `@x.qax` だけが書かれている場合 (`runCommand.ts` の
  `runQaxStandalone`):
  - action ごとに 1 txn として実行する。
  - txn の label には、記録された `label` を使う。無ければ `qax: <file>`。行の source は `qax`。
  - 再生後の undo 履歴には、記録元と同じ粒度の行が並ぶ。
  - 最初に失敗した action で止まる。それより前の action は残る。
- 長い submit の一部や script の中から読んだ場合は、その submit の 1 txn の中で実行する
  (他の script と同じ扱い)。
- 各要素の実行は core の `actions/qax/run.ts` (`runQaxItems`) が行い、console の
  `runtime/runQax.ts` はそれに console の context を渡す adapter:
  - `<op>`: 次の順に処理する。
    1. `findOp` で op を引く。
    2. 引数を `qaxToInput` で読む。node は、今の scene で `resolveRef` を使って解決する。
    3. `outsideTxn` に当たる op (scene の open / save) は断る。
    4. `readToolArgs` で型付きの引数にする。
    5. `invokeOp` で実行する。
  - `<cmd>`: native の parser で 1 行として実行する (console だけが渡す `runLine`)。
  - `<note>`: 飛ばす。
- qax を実行できるのは native dialect だけ。PyMOL dialect は qax ファイルを断る。
- `.qax` 以外のファイルを `run` した場合は、今までどおりコマンド行のテキストとして読む。
- `tritium_cli x.qax` は、そのファイルを `run "<絶対パス>"` として送る。`-c` と stdin はコマンド行
  のまま。

### 4.2 log (`open_log` / `log` / `close_log`)

`runtime/qaxLog.ts` が担当する。native の log は qax で書く。

- 内容は入力した文字列ではなく、action log から取る。source が `cmd` / `pym` / `qax` の行が
  1 つ増えるたびに、`<action>` を 1 つ足す。中身は、その submit で実行した op。
- 何も変えなかった submit は undo の行を作らないので、log にも残らない。
- 毎回ファイル全体を書き直す。いつ読んでも整形式の XML になっている。
- `open_log file, a` を指定すると、既存のファイルを読み込んで、その後ろに足す。
- `log text` は `<note>` として書く。同じ submit で編集もした場合、note はその submit の action
  より前に入る。
- PyMOL dialect の `.pml` log (`commandLog.ts`。入力した文字列の記録) は別物。PyMOL の行がした
  ことは、native の op として qax の log にも入る。

### 4.3 確認と書き出し (`list_actions` / `export_actions`)

native の builtin で、どちらも group は `edit`。

- `list_actions`: 行を古い順に出す。各行は次の形:
  - 番号 (1 始まり)、`[source]`、label。undone の行には `(undone)` が付く。
  - その下に、各 op を native のコマンド行で表したもの (`catalog/cmlFormat.ts`)。
    - 引数はすべて `name=value` の形で書く。
    - node は控えておいた path で書く。path が無ければ `#uid` で書く。
    - この表示は確認用で、ファイル形式ではない。
- `export_actions file[, first[, last]]`: 番号で指定した範囲を qax で書き出す。
  - 既定は全部。first だけを指定すると、その 1 行だけを書き出す。
  - 拡張子 `.qax` が無ければ足す。
  - op の無い行は `<note>` になる。

## 5. GUI: Actions view と History pane

activity bar の **Actions** view (built-in。`shell/ActivityBar.tsx`、`shell/SidePanel.tsx` の
`VIEW_PANES.actions`) に、**History** pane (`renderer/features/actions/ActionHistoryPane.tsx`) を
置き、その下に **Actions** pane (§5.6) を置く。action log と undo は core の機能なので、plugin では
なく built-in にしている。

### 5.1 一覧

- active scene の行を、古い順に `ListboxTree` で出す (scene tree と同じ部品)。scene のタブを
  切り替えると、その scene の履歴に切り替わる。
- 一番上に疑似行 **Initial state** を置く (全部 undo した状態への移動先)。
- 行に出すのは表示文 (§5.4) と source。undone の行は `is-undone` で薄く、今の位置 (最後に有効な
  行、または Initial state) は `is-current` で区別する。
- 表示文は行の幅で省略 (`...`) される。省略された行は、hover で全文を kit の `Tooltip` に出す
  (list-kit の `TruncatedText`。ラベルの右側、省略されていない行には出さない)。
- op が 2 つ以上ある行だけを展開でき、子行は op ごとの表示文になる。
- 行の id は `initial` / `s:<step id>` / `e:<step id>:<op index>`。
- 取得は `useActionSteps` (`useLiveFetch` + `SEM_SCENE` の listener) と、§5.5 の push。

### 5.2 操作

操作はすべて `CmdId` 経由 (`ActionsShowStep` / `ActionsGoToStep` / `ActionsSave` / `ActionsCopy`、
handler は `features/actions/useActionCommands.ts`)。

- click / Shift / Cmd: 選択 (保存とコピーの範囲)。子行を選ぶと、その親の step として扱う。
- **Inspector に出す**: step の行は double-click / Enter、op の子行は click。**状態は動かさない**。
  ユーザーとの取り決めで、double-click で undo stack を動かすのは危険なので避けている。
- **Go to step**: toolbar のボタンとコンテキストメニューだけで行う、明示的な状態移動。その step
  の直後の状態まで `pickUndo` / `pickRedo` する。移動量は純関数 `goToStep` (`goToStep.ts`) が
  出し、実行の直前に行を取り直してから計算する。undo/redo lock (agent の turn 中など) の間は無効。
- **Save as qax**: `IPC.DIALOG_ACTIONS_SAVE` (既定名 `actions.qax`、filter `.qax`) で保存先を選び、
  worker の `exportActionSteps` が step id で選んだ行を書く。console の `export_actions` と同じ
  `writeRowsFile` を使う。
- **Copy as commands**: `actionStepLines` が選んだ行を native のコマンド行にし、clipboard に書く。
  op の無い行は `# <label>` になる。Edit > Copy にも `useClipboardScope('action-history')` で対応する。
- **Save to Actions**: 選んだ step を User Actions (§5.6) に保存する。`SaveActionDialog` で名前と、
  「Run on the selected object (save as a macro)」を選ぶ。step がマクロにできるとき
  (`canSaveAsMacro`) はチェックが最初から ON、できないときは無効にして理由を出す。下の説明文は
  チェックの状態に合わせて変わる。
  - マクロにしないときは、記録したときの path のまま `<action>` として書く (Save as qax と同じ)。
  - マクロにするときの書き換えは `actions/macro.ts` の `stepsToMacro`: 選んだ step の op を古い順に
    1 つのマクロ (引数 `target`、型は object の class) にし、その object の path を
    `param="target"`、その下の renderer を `param="target" sub="<名前>"` にする。
  - マクロにできないのは、次の選択: 2 つの object にまたがる、uid でしか指せない node がある、範囲の
    外で作られた renderer を指す。範囲の中で作られたとみなすのは、それより前の `create_renderer` /
    `create_group` が名前を指定して作ったものだけ。こうしておくと、マクロは作るところから一式に
    なり、別の object でも確実に動く。
  - 参照が 1 つも無い step は、引数なしのマクロになる。
- 選んだ step が履歴から消えていたら (redo 側が切れたなど)、保存とコピーは `not-found` で失敗する。

### 5.3 Inspector の step 表示

`InspectorTarget` の `{ kind: 'actionStep', sceneId, stepId, entryIndex? }`
(`state/inspector/InspectorProvider.tsx`、category `Action`)。中身は
`features/inspector/ActionStepInspector.tsx` で、読むだけ。

- 他の Inspector ページと同じ部品で組む (`FlatSection` の見出しと、`PropertyField` + readonly の
  `TextField` の行。`docs/migration/ui-style-guide.md` §0)。
- **Step** 欄: Undo label (C++ の説明文)、From (source)、Time、State (done / undone)。op が複数なら
  Ops 行 (個数)。
- **Op** 欄 (op が 1 つの step と、op の子行): Name、Command (コマンド行)、引数ごとの行。op が
  複数の step は op を列挙せず、各 op は子行から見る。
- header の名前は step (または op) の表示文で、本文では繰り返さない。
- step が履歴から消えたら、閉じずに「This step is no longer in the undo history.」を出す。

### 5.4 表示文

undo の各 step の短い説明。History pane の行と、toolbar の Undo / Redo の dropdown が使う。
本体は `worker/server/actions/describe.ts`。

- op が自分で言う (`Op.describe(args, name)`、`name(param)` は node 引数を記録した path で、
  無ければ `#uid` で返す)。`describe` を持つのは、GUI の記録で出る op と使う頻度が高い op の
  15 個 (`set_node_prop`、`set_visible`、`load_file` など)。
- `describe` の無い op は `<op 名を語に直したもの>: <主な引数>` (`Clear paint: #7`)。atoms 引数と、
  `...Type` の enum 引数は省く。
- op が複数の step は `<先頭> (+N more)`。op が無い step は C++ の説明文のまま。
- 80 文字で切る。
- C++ の説明文は書き換えない (reconcile が説明文で行を突き合わせるため)。表示文は表示だけに使う。
- `getUndoState` は `undoDescs` / `redoDescs` と同じ並びの `undoTexts` / `redoTexts` を返す。その
  位置の行の label が説明文と一致しなければ、説明文で埋める。
- native の Edit メニューは固定の `Undo` / `Redo` のまま。

### 5.5 push channel

C++ は undo / redo で event を出さないので、変更の通知は worker の action log が出す。

- undo / redo / `clearUndoData` の service は、実行の後に `syncActionRows` を呼ぶ。reconcile して
  行が動いていれば、`onActionsChanged` の listener に scene id を渡す (commit のときも同じ)。
- `WorkerService.initCueMol` が、これを `ACTIONS_CHANGED_CHANNEL` (`'actions-changed'`、
  `worker/shared/actionTypes.ts`) で renderer に push する。payload は scene id。
- renderer 側は `AsyncCueMol.subscribeActionsChanged`。History pane、step の Inspector、
  `useUndoRedoState` (toolbar) がこれで取り直す。console の `undo` のように scene event を出さない
  経路でも、toolbar の表示が古いまま残らない。

### 5.6 Actions pane (同梱の preset と User Actions)

`features/actions/ActionLibraryPane.tsx`。見出しは **Actions** (コード上の名前は `Library*`)。
worker の service は `services/actions/library.ts`。

- **一覧**: 2 つの group。
  - **Presets**: 同梱の `data/default_actions.qax` のマクロ。sysconfig.xml と同じ share の `data/`
    に install する (packaged は `resources/cuemol2/share/data`、dev は repo の `data/`)。
  - **User Actions**: `userData/actions/*.qax` (main の `APP_PATH` の `actionsDir`、無ければ作る)。
    マクロ 1 つだけのファイル (Save to Actions と Copy to User Actions が作る形) は、直下に 1 行で
    出す。それ以外は、ファイルの行の下にマクロと「recorded actions」を出す。
  - 行のラベルは `TruncatedText`、hint に description。読めないファイルと実行できない形の行は
    薄く出し、理由を出す。
- **Target**: pane の上に、マクロを当てる object を出す。scene tree の選択から求める (renderer /
  rendGroup なら親の object、重複は除く)。選択が無く、scene に object が 1 つだけならそれ。
- **Run**: toolbar とコンテキストメニューだけ (double-click では実行しない。History pane と同じ)。
  target が要るのに無いとき、undo/redo lock 中、実行できない形のときは無効。
  - マクロ: 1 undo txn。target が複数なら object ごとに 1 回ずつ実行し、全体で 1 txn
    (label は `<label> (N objects)`)。失敗した object は飛ばして続け (それまでに実行した op は
    残る)、最後に飛ばした object と理由を一覧で出す。全部失敗したら rollback する。
  - ファイルの recorded actions: console の `run x.qax` と同じく action ごとに 1 txn、最初の失敗で
    止まる。
  - op の `fileAccess` は `any` (ユーザーが選んで実行するので、preset の `render_image` などが書く
    場所を制限しない)。
- **コンテキストメニュー**: Run、Copy to User Actions (preset をユーザーのファイルに複製する)、
  Rename... (ファイル名と、マクロ 1 つだけのファイルならマクロの name / label も変える)、
  Move to Trash (`IPC.SHELL_TRASH_PATH`)、Open in Editor、Reveal in Finder。書き換え・名前の
  変更・削除は User Actions のファイルだけ。
- 保存・複製・名前の変更・削除の後は、一覧を自動で読み直す。toolbar の Refresh でも読み直せる。

同梱の preset (12 個): Cartoon + ligand、Ligand site、B-factor cartoon、Transparent surface、
Electrostatic surface (APBS、By SAS)、Ligand contacts、Symmetry mates、White / Black background、
Render image、360 degree spin、Front, side and top cameras。既存の op で表せないので入れていない
もの: chain ごとの色、初期表示 (simple) に戻す、輪郭線 (対象の renderer を一括で指す op が無い)、
重ね合わせ (object が 2 つ要る)。

## 6. テスト

| ファイル | pin している契約 |
|---|---|
| `tritium/react-gui/src/renderer/__test__/actionLog.test.ts` | nest した txn が 1 行になる / rollback と空の commit では行が増えない / undo・redo への追従と redo 側の切り捨て / stack の clear と scene 破棄後の reconcile / op を実行前の path で 1 回だけ記録し、replay の op は commit 時だけ残す / service の記録が、op 側の `readToolArgs` で読める引数になっている |
| 同上 (GUI 向け) | `getUndoState` の表示文 (`describe`、fallback、`(+N more)`、op の無い行は説明文) / undo の service の後に actions-changed を通知する / step id で選んだ行の qax 書き出しと、消えた step の拒否 |
| `tritium/react-gui/src/renderer/__test__/actionLibrary.test.ts` | step をマクロにして保存・読み込みし、別の object に束縛すると、その object と renderer の path になる / 2 object、範囲外の renderer の拒否 / 複数の target で 1 txn、型の違う object を飛ばして failures に返す |
| `tritium/react-gui/src/renderer/__test__/defaultActions.test.ts` | 同梱の preset が読め、実行できる形で、全 op の引数を catalog が受け付ける |
| `tritium/react-gui/src/renderer/__test__/actionHistoryPane.test.tsx` | 行の click / double-click / 子行の click は Inspector に出すだけで、Go to step を出さない / `goToStep` の undo・redo の量 |
| `tritium/react-gui/src/renderer/__test__/qaxCodec.test.ts` | golden file (マクロを含む) の round-trip / 全 `ParamKind` と node 引数が、ファイルを経由して `readToolArgs` で同じ値に戻る / version 違い、未宣言の param、`<action>` の中の param、重複したマクロ名の拒否 |
| `tritium/react-gui/src/plugins/console/worker/runtime/runCommand.test.ts` | 1 行だけの qax は 1 action = 1 txn で、記録された label で実行する。失敗した action で止まる。長い submit の中では 1 txn にまとまる。PyMOL dialect では断る |
