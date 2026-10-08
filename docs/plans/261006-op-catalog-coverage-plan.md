# op catalog の網羅: GUI の service を op にする

Status: **実装済み** (APBS・morph・surface cutter・アニメーション編集は後に console / MCP 用の op として追加)。
フェーズ 1 で `delete_node` / `rename_node` / `change_renderer_type` を core に足し、
`get_mol_residues` を `analysis`、`load_file` / `export_image` を `files`、`get_coloring_styles` を
`coloring` へ移した。フェーズ 2 以降で toolset `view` / `map` / `molops` / `xtal` / `selection` /
`style` / `coloring` / `files` / `render` / `anim` の op を足した (一覧は
[ai-agent-plugin.md](../architecture/ai-agent-plugin.md) §5)。書き込みは、agent はデスクトップへの
bare 名のみ、console は任意のパス (`catalog/outputFile.ts`)。`render_image` (console `ray`) は
umbreon の in-process job で ray tracing / GI を行い、PyMOL dialect の `ray` / `png` もこれを使う。
未対応: POV-Ray 出力。APBS (`calc_elepot`)・morph (`morph_*`)・surface cutter (`cutsurf`) は console と MCP の op (agent には出さない) として追加した (`../architecture/op-catalog.md`)。アニメーションの編集 (`anim_*`) も同様。
関連: [op catalog と console](../architecture/op-catalog.md)、
[native console / op catalog 計画](261006-native-console-op-catalog-plan.md)。

## 背景

AI agent の tool と native console のコマンドは、どちらも core の op catalog から生成される。
catalog の op は agent の旧 tool 21 本を起点にしたため、**GUI では使えるのに op になっていない
service** が多い。例えば slab だけを変える手段が無く、agent は「分子全体が見えるように slab を
調整して」に `center_view(zoom)` で代用し、中心とズームまで変えた (`viewXform` service を包む
`set_view` を足して解消)。

op を 1 つ書けば agent と console の両方に出る (op 本体は既存の worker service を呼ぶだけ) ので、
ユーザー操作として意味のある service を順に op にする。

## 方針

- **op にする基準**: ユーザーが「〜して」と頼む単位の操作であること。GUI 内部の補助
  (hover、pick、名前の提案、ダイアログの初期値) は op にしない。
- **置き場所**: 頻繁に使い、無いと代用が起きるものは agent の **core** (上限 21、
  `MAX_TOOLS`)。それ以外は **toolset** (`catalog/toolsets.ts`) に入れる。toolset は本数を縛らず、
  説明で選ばせる。core が上限に当たる場合は、使用頻度の低い core を toolset に移してから足す。
- **console には全 op が出る** (toolset に関係なく)。verb は CueMol の語彙で短く付ける。
- 1 PR = 1 分野程度。各 PR で agent の schema snapshot (`schemaPin.test.ts`) を更新し、
  目視確認 (agent と native の両方) を経る。

## 候補

| 分野 | 主な service | op の例 | 置き場所 |
|---|---|---|---|
| scene tree | `deleteNode` / `renameNode` / `focusOnNode` / `copyNode`・`pasteNode` | `delete_node`、`rename_node`、`focus` | core (delete / rename) |
| renderer | `changeRendererType` / `createRendererGroup` / `getRendererStyleEntries`・`applyRendererStyle` / `getMaterialNames` | 表現の切り替え、style の適用 | core (type 変更)、toolset `style` |
| camera (名前付きの視点) | `listCameras` / `saveViewToCamera` / `applyCameraToView` / `createCamera` | 視点の保存と呼び出し | toolset `view` |
| view | `translateView` / `setViewProjection` / `setViewCenterMark` | 平行移動、透視投影 / 平行投影 | `set_view` に統合するか toolset `view` |
| 分子操作 | `superposeMol` / `makeMolSurf` / `deleteMolAtoms` / `changeChainName` / `mergeMol` / `reassignProt2ndry` | 重ね合わせ、分子表面、原子の削除 | toolset `molops` |
| 対称性 | `createSymmMol` / `showSymmRenderer` / `showUnitCellRenderer` | 対称分子・単位胞の表示 | toolset `xtal` |
| 密度マップ | `streamLoadDensityMap` / `listMapRenderers` / `setMapRendererProp` | マップの取得、contour level | toolset `map` |
| selection | `saveSelDef` / `getMolAtoms` | 名前付き selection の作成、原子の一覧 | core (`saveSelDef`) |
| 着色 | `removePaintEntry` / `clearPaintEntries` / `setRendererDefaultColor` / multigrad 系 | paint の取り消し、既定色 | toolset `coloring` |
| file / scene | `saveScene` / `saveObjectToFile` / `listSavableObjects` | scene の保存、構造の書き出し | toolset `file` (書き込みを伴うので、agent ではパスの制限か確認が要る) |
| レンダリング | `renderStart` / `get`・`setSceneRenderSettings` | ray tracing 出力 | toolset `render` |
| アニメーション / morph / APBS | `anim*` / `morph*` / `calcApbs*` | 再生、フレーム追加、静電ポテンシャル | 分野ごとの toolset |

**op にしないもの**: navi 系 (`naviHover` / `measurePick` / `rectSelect` など、マウス操作の補助)、
`propose*` (名前の提案)、`get*Info` (ダイアログの初期値)、`drainLogMessages`、`cancelAllJobs`、
`undo` / `redo` (console では builtin。agent では turn 単位の txn と衝突する)。

## 進め方

1. core の 3 本: `delete_node`、`rename_node`、`change_renderer_type`。core が 21 本に達しているので、
   同時に core の見直し (使用頻度の低いものを toolset へ) を行う。
2. toolset `view` (camera と投影)、`map`、`molops` を使用場面の多い順に。
3. 書き込みを伴う `file` / `render` は、agent に許すパスと確認の扱いを決めてから
   ([260926 計画](260926-mcp-tool-catalog-plan.md) のセキュリティ節と同じ論点)。

## 未確認事項

- `deleteNode` / `changeRendererType` が既に undo txn を自前で張っているか (agent / console の
  txn の中では入れ子として吸収されるが、単独で走る経路との整合を確認する)。
- 名前付き camera の `ui_order` など、GUI が持つ表示順の扱いを op から変えてよいか。
