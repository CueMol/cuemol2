# Action log と qax (CueMol actions XML)

scene に加えた変更を、undo 履歴の 1 項目ごとに「実際に実行した native の op」として記録する
仕組みと、その記録を書き出して再生するファイル形式 qax の仕様。GUI・console (native / PyMOL)・
MCP・agent の、どこから実行した変更も同じ形で記録する。

確認と書き出しには、今は console の builtin (`list_actions` / `export_actions`) を使う。
記録を一覧する GUI (Action pane) はまだ無い。

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
- node 引数 (semantic が object / molecule / renderer / node) は、op を **実行する前に** path
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
| `applyMolSelString` | `set_mol_selection` |
| `superposeMol` | `superpose` (`useprop` のときは記録しない) |
| `createRendererOnObject` | `create_renderer` (type・name・selection のみ)。group 指定があれば、続けて `group` の `set_node_prop`。preset は記録しない |
| `changeRendererType` | `set_renderer_type` |
| `loadObject` | `load_file` (path・renderer type・selection・object 名のみ) |
| `viewXform` (回転・平行移動) | 0 でない軸ごとの `rotate_view`、`pan_view` |
| map の property (`map/props.ts`) | renderer への `set_node_prop` |

表に無い service の txn は、label だけを持つ行になる。`list_actions` ではこの行に
`# no op recorded for this edit` と出し、qax には `<note>` として書く。

### 2.3 記録できていないもの (既知)

- PyMOL dialect のうち、service を通らずに C++ を直接変更するもの。例: `show sticks` の
  `applyStyles`、`label`、`set_view` の回転、`orient`、`center`、`frame`。そのコマンドの行には、
  service を通った部分の op だけが入る。
- paint と coloring の変更 (対応する op が無い)。
- GUI の renderer 作成の、type・name・selection 以外のオプション。ファイル読み込みの reader
  オプション。
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

### 3.1 要素

| 要素 | 意味 |
|---|---|
| `<action label? source? time?>` | 1 つの txn。属性はどれも省略できる。`source` は記録元 (再生には使わない) |
| `<op name>` | op catalog の op を 1 回呼ぶ。子は `<arg>` だけ |
| `<arg name [path] [uid]>` | op の引数を 1 つ。値は下の規則で書く |
| `<atom chain resid name/>` | `atoms` 型の引数の 1 原子 |
| `<cmd>` | native console のコマンド行。人が手で書くための逃げ道で、記録器はこれを出力しない |
| `<note>` | 実行しない記録 |
| `<macro>` / `<param>` | 名前付きの action と引数のために予約している。v1 の reader は読むと拒否する |

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
| node (semantic が object / molecule / renderer / node) | 属性 `path` (記録時の `obj` / `obj/rend`) と `uid` (記録した session での uid) |
| null | `<arg>` ごと書かない |

- 書く順序は、catalog の param の宣言順。
- 読むときは `path` を優先し、`uid` は `path` が無いときだけ使う。session をまたぐと uid は
  安定しないため。
- 読んだ値は MCP / agent と同じ `readToolArgs` に渡すので、型の読み方は tool call と一致する。

### 3.3 実装の置き場所と C++ への移行

- `actions/qax/model.ts`: plain なデータモデル (`QaxDoc`)。
- `actions/qax/codec.ts`: `parseQax(text)` / `writeQax(doc)`。
  - 読み込みには `@xmldom/xmldom` を使う。worker には `DOMParser` が無いため。
  - 書き出しは、1 要素 1 行に字下げした手書きの writer。2 つの log の diff を読みやすくするため。
- `actions/qax/values.ts`: 引数の encode / decode。catalog の param 定義を引数で受け取る。

この 3 つは worker の service にも catalog にも依存しないので、将来はコマンド系とあわせて C++ に
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
- 各要素の実行 (`runtime/runQax.ts`):
  - `<op>`: 次の順に処理する。
    1. `findOp` で op を引く。
    2. 引数を `qaxToInput` で読む。node は、今の scene で `resolveRef` を使って解決する。
    3. `outsideTxn` に当たる op (scene の open / save) は断る。
    4. `readToolArgs` で型付きの引数にする。
    5. `invokeOp` で実行する。
  - `<cmd>`: native の parser で 1 行として実行する。
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

## 5. テスト

| ファイル | pin している契約 |
|---|---|
| `tritium/react-gui/src/renderer/__test__/actionLog.test.ts` | nest した txn が 1 行になる / rollback と空の commit では行が増えない / undo・redo への追従と redo 側の切り捨て / stack の clear と scene 破棄後の reconcile / op を実行前の path で 1 回だけ記録し、replay の op は commit 時だけ残す / service の記録が、op 側の `readToolArgs` で読める引数になっている |
| `tritium/react-gui/src/renderer/__test__/qaxCodec.test.ts` | golden file の round-trip / 全 `ParamKind` と node 引数が、ファイルを経由して `readToolArgs` で同じ値に戻る / version 違いと `<macro>` の拒否 |
| `tritium/react-gui/src/plugins/console/worker/runtime/runCommand.test.ts` | 1 行だけの qax は 1 action = 1 txn で、記録された label で実行する。失敗した action で止まる。長い submit の中では 1 txn にまとまる。PyMOL dialect では断る |
