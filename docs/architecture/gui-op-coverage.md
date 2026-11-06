# GUI 操作と op の対応

GUI の各操作が、op catalog のどの op (またはその組み合わせ) で表せるかの一覧。GUI の操作は、
op を経由せずに worker の service を直接呼ぶ。scene を変える service は、undo transaction の中で、
自分のしたことを op として記録する (`recordOp`)。だから「op で表せる」とは、次の 2 つを満たすことである。

- console / MCP / agent から同じことができる。
- History に記録されて、qax で再生できる。

方針:

- GUI の 1 操作が op 1 つに対応する必要はない。op の組み合わせで表せればよい。
  - 例: MolStruct pane の Zoom は `set_mol_selection` と `focus_selection` を 1 つの step に記録する。
- op は意味の通る粒度で作る。GUI のボタンの都合 (selection を設定してから視点を合わせる、など) を 1 つの op に入れない。
- 視点だけの操作と、scene を変えない操作 (保存・書き出し・レンダリング) は、op はあっても記録しない
  (undo の行ができないため。[action-log.md](action-log.md) §2.3)。
  - 視点の op が記録されるのは、scene を変える操作と同じ step にあるときだけ。
- service と op の細かい対応 (引数の写し方) は [action-log.md](action-log.md) §2.2 に書く。
  ここは GUI の側から引くための表。

関連: [op catalog と console](op-catalog.md)、[action log と qax](action-log.md)、
[op になっていない機能 (backlog)](../plans/261011-op-console-backlog-plan.md) の §2。

確認日: 2026-11-06。GUI の `invokeService` の呼び出し元と、service の `recordOp` を突き合わせた。

## 1. Scene tree

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| 表示 / 非表示 (1 つ・複数選択) | `setNodeVisible` / `bulkSetNodeVisible` | node ごとの `set_visible` |
| 削除 (1 つ・複数選択) | `deleteNode` / `bulkDeleteNode` | node ごとの `delete_node`。style set の行は `delete_style_set` |
| 名前の変更 | `renameNode` | `rename_node`。scene は `set_node_prop name` |
| ドラッグで並べ替え | `reorderSceneNode` | `move_node` (動いた段数 `by`) |
| group への出し入れ | `reorderSceneNode` | renderer の `set_node_prop group` |
| Focus (1 つ・複数選択) | `focusOnNode` / `focusOnNodes` | `focus_node` / `focus_nodes` |
| Paste | `pasteNode` | `paste_node` (Copy した XML ごと記録) |
| Copy | `copyNode` / `copyNodes` | node ごとの `copy_node` (XML を返す。scene を変えないので記録しない) |
| Select Mol | `selectObjectMol` | `set_mol_selection` |
| 新しい renderer group | `createRendererGroup` | `create_group` |
| 行の開閉 | `setNodeUiCollapsed` | 無し (表示の状態。txn の外で書く) |

## 2. Inspector と property

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| property の変更 | `setGenericProp` / `setGenericProps` | `set_node_prop` (rendGroup の改名は `rename_node`、表示切替は `set_visible`) |
| property の Reset | `resetGenericProps` | `reset_prop` |
| view の property | 同上 | 記録しない (View は undo の対象外) |
| 背景色 | `setSceneBgColor` | scene の `set_node_prop bgcolor` |
| render 設定 (AO・AA など) | `setSceneRenderSettings` | `set_render_settings` |

## 3. Selection

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| Selection pane の Apply / builder | `applyMolSelString` | `set_mol_selection` |
| Selection pane の Center | `focusMolSelection` | `focus_selection` (視点だけなので記録しない) |
| Selection pane の Define | `saveSelDef` | `define_selection` |
| MolStruct pane の Select | `applyMolSelString` | `set_mol_selection` |
| MolStruct pane の Center / Zoom | `selectAndFocusMol` | `set_mol_selection` と `focus_selection` を同じ step に |
| 3D view の矩形・投げ縄選択 | `rectSelect` / `lassoSelect` (`applySelectionHits`) | `set_mol_selection` (結果の選択式) |
| 3D view の右クリック (around / invert / sidechain など) | `naviCtxtMenu` | `set_mol_selection` |
| 3D view のクリック選択 | `naviTool` | `set_mol_selection` |
| Sequence panel の選択 | `seqPanelOps` (sequence plugin) | `set_mol_selection` |

## 4. 分子の編集 (Tools)

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| chain 名の変更 | `changeChainName` | `rename_chain` |
| 残基番号の振り直し | `changeResidueIndex` | `renumber_residues` |
| 原子の削除 | `deleteMolAtoms` | `delete_atoms` |
| 分子の結合 | `mergeMol` | `merge_molecules` |
| 二次構造の再割り当て | `reassignProt2ndry` | `set_secondary_structure` |
| 重ね合わせ | `superposeMol` | `superpose` (auto recenter は `recenter`) |
| 分子表面の作成 / 再計算 | `makeMolSurf` / `regenMolSurf` | `create_surface` / `recalc_surface` |
| 分子表面の切断 | `cutSurfByPlane` | `cut_surface` |
| map からの表面 | `generateRendererSurfObj` | `create_surface_from_map` |
| 対称性 (cell・space group・表示・unit cell) | `symmetryPanelOps` | `set_symmetry` / `show_symmetry` / `show_unit_cell` |
| 対称分子の生成 | `createSymmMol` | `create_symmetry_copy` |
| 相互作用の解析 / 削除 | `analyzeInteractions` / `atomIntrEdit` | `analyze_interactions` / `remove_interaction` |
| 結合の追加 / 削除 (3D view) | `bondEdit` | `add_bond` / `remove_bond` |
| 距離・角度の計測 | `atomintr` | `measure_geometry` / `measure_selections` |
| 原子ラベル | `naviTool` / `atomLabels` | `set_atom_label` / `set_atom_labels` |
| 静電ポテンシャル (APBS) | `apbs/run` | `calc_elepot` |
| morphing の変換・frame の追加 / 削除 | `morphMol` | `convert_to_morph` / `add_morph_frame` / `remove_morph_frame` |

## 5. Renderer・着色・style

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| renderer の作成 (preset を含む) | `createRendererOnObject` | `create_renderer` / `create_preset_renderer` (group 指定は続けて `set_node_prop group`) |
| renderer の種類の変更 | `changeRendererType` | `set_renderer_type` |
| renderer の selection | `setRendererSelection` | `set_renderer_selection` |
| renderer の style | `rendererStyle` | `apply_renderer_style` / `set_renderer_styles` |
| 着色の方式 | `applyColoring` | `set_renderer_coloring` / `set_coloring_prop` / `set_default_color` / `set_node_prop` |
| 静電ポテンシャルの着色 | `applyColoring` / `elepotWriter` | `set_elepot_coloring` / `set_node_prop` |
| paint の行の追加・変更・削除・並べ替え | `paintCrud` | `add_paint` / `add_paint_at` / `set_paint` / `remove_paint` / `move_paint` |
| paint の行の Cut / Paste / Clear | `paintClipboard` | 行ごとの `remove_paint` / `add_paint_at` / `clear_paint` |
| multigrad | `multiGrad` | `set_multigrad_nodes` / `set_node_prop color_mapname` |
| map の property・recenter | `map/props` | `set_node_prop` / `recenter_map` |
| style set の作成・削除・読み取り専用 | `styleOps` | `create_style_set` / `delete_style_set` / `set_style_readonly` |
| style set の色・selection・style の定義と削除 | `styleSetEdit` | `define_color` / `remove_color` / `define_selection` / `remove_selection` / `remove_style` |
| style file の読み込み / 保存 | `styleFile` | `load_style_file` / `save_style_file` (元のファイルへの上書きは記録しない) |
| renderer から style を作る (右クリック > Create Style) | `createStyleFromRenderer` | **無し** (undo の txn も開かない) |

## 6. Camera と視点

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| camera の保存・削除・名前の変更・並べ替え | `cameraOps` / `cameraOrder` | `save_camera` / `delete_camera` / `rename_camera` / `move_camera` |
| camera の適用 | `cameraOps` | `apply_camera` (表示設定を含むときだけ scene が変わるので記録される) |
| camera の表示設定 | `cameraVisFlags` / `cameraOps` | `set_camera_visibility` / `clear_camera_visibility` |
| camera file の読み込み・保存・再読込 | `cameraFile` | `load_camera_file` / `save_camera_file` / `reload_camera` |
| 3D view の回転・平行移動 | `viewXform` | `rotate_view` / `pan_view` (視点だけなので記録しない) |
| View pane (zoom・slab・projection・center mark) | `viewXform` / `viewProjection` | `set_view` / `set_projection` / view の `set_node_prop` (記録しない) |
| 3D view の右クリック > Center at (原子) | `naviCenterAt` | `set_view center` (記録しない) |
| 3D view の右クリック > Center at (対称分子の原子) | `naviCenterAtSymm` | **無し** (symm renderer の原子を指す op が無い。記録はしない) |

## 7. アニメーション

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| 要素の追加・削除・並べ替え | `anim/edit` | `add_anim` / `remove_anim` / `move_anim` |
| 時間・property の変更 | `anim/edit` / `anim/detail` / `anim/genericProps` | `set_anim_time` / `set_anim_prop` / `set_anim_generic_prop` / `reset_anim_prop` |
| frame の移動 (再生) | `setTrajectoryFrame` など | `set_frame` (再生なので記録しない) |

## 8. File と出力

| GUI 操作 | worker 側 (service 名、または `services/` 以下のファイル) | op |
|---|---|---|
| File > Open (object) | `loadObject` | 形式ごとの `load_pdb` / `load_mmcif` / `load_mtz` / `load_ccp4` / `load_msms` / `load_namd` / `load_amber`。それ以外は `load_file` (dialog が読んだ reader を `reader` に入れる) |
| File > Open (scene) | `loadScene` | `load_file` (`.qsc`)。scene の読み込みは undo に載らないので記録しない |
| Get PDB / EMDB | `streamLoadFromUrl` / `streamLoadDensityMap` | `fetch_pdb` / `fetch_url` / `fetch_emdb` / `fetch_map`。File Open dialog の形式オプションは `fetch_pdb` に入る (`load_pdb` / `load_mmcif` と同じ名前) |
| object の Save as | `saveObjectToFile` | `save_object` (scene を変えないので記録しない) |
| scene の Save / Save as | `saveScene` | `save_scene` (writer のオプション `embedAll` / `version` / `compress` / `base64` 付き。記録しない) |
| scene の Export (png / pov / stl / mqo) | `exportScene` | `export_scene` / `export_image` (記録しない)。Umbreon の画像は format に無い |
| Rendering ウィンドウ (静止画) | `renderStart` | `render_image` (Umbreon の GI / NPR。記録しない) |
| Rendering ウィンドウ (動画・POV-Ray) | `renderStart` | **無し** |
| 新しい scene / tab | `createNewSceneAndView` / `createViewInScene` | **無し** (op は今の scene に対して動く) |
| MD trajectory を開く・block の編集 (mdtools) | `loadTrajectory` ほか | **無し** (plugin から op を足す仕組みが無い) |

## 9. op にしないもの

- 一覧・候補を出すだけの service (原子・material・style set の中身・camera の表示設定・PDB の検索など)。
  UI の表示のためで、scene を変えない。agent / MCP から要るものは、必要になったら読み取りの op にする。
- 環境設定 (ラベルの既定値、マウス操作、GPU pick、APBS の既定値)。アプリ全体の設定で、scene に属さない。
- `undo` / `redo` は op にしない ([op-catalog.md](op-catalog.md))。
