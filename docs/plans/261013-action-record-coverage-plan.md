# 記録できない操作をなくす (action log の op 網羅) 計画

## Context

History pane と Actions pane (PR #674 / #675) は、undo の各 step に記録された op を使う。op が記録されない
step は「no op recorded」の行になり、qax への保存・マクロ・再生に使えない。
rainbow の hue が docs の既知リストに無いまま漏れていたので、undo txn を開く全箇所
(service 約 130 か所)・txn を開かない変更・PyMOL dialect を数え上げた (約 50 か所が記録なし、約 30 か所が一部だけ)。その結果と、潰す順序をまとめる。

ユーザーと決めたこと:
- **視点だけの変更は記録しない**。History は undo の履歴で、View / Camera の変化は C++ の undo の対象ではないため (下の「対象にしないもの」)。
- **貼り付け**: clipboard の XML を op の引数に入れ、再生できるようにする。ただし qax が膨らまないように、大きすぎる引数は記録せず、「記録していない」と分かる印を残す (下の「記録する引数の大きさの上限」)。
- **ファイルへの書き出し** (style set / camera の Save / Save as): op にして記録する (`render_image` と同じ扱い)。

## 着手前
- この plan を `docs/plans/261013-action-record-coverage-plan.md` に置き、`docs/plans/_index.md` に 1 行足す。
- backlog (`261011-op-console-backlog-plan.md` §1) の「記録の対応表の拡充」の行は、この plan へのリンクにする。
- フェーズごとに 1 PR。マージしてから次のフェーズのブランチを切る (stacked PR にしない)。

## 共通の方針
- 記録点は今までどおり service の txn の中 (`actions/serviceOps.ts` の `recordOp` と helper)。op を足すときは
  `catalog/ops/*.ts` に定義し、service の `run` から同じ service を呼ぶ (GUI と op が同じ経路になる)。
- toggle は「切り替えた後の値」で記録する (再生が前の状態に依存しないように)。
- uid で持っている値 (camera の vis flag の対象など) は、記録時に path に直す。
- **記録する引数の大きさの上限** (`recordOp` で一律に行う。貼り付けに限らない):
  - 1 つの op の引数の、文字列の合計が上限を超えたら、op は記録しない。代わりに、その行に
    「記録していない」印の note を入れる (`kind: 'note'`、`dropped: { op, bytes }`)。
  - History ではこの行を「no op recorded」と同じく op の無い行として出し、理由
    (`not recorded: paste_object (1.8 MB, over the 64 KB limit)`) を表示文と tooltip に出す。qax には `<note>` で書く。
    マクロへの保存では、この行を含む選択は「再生できない step がある」として断る。
  - 上限は 64 KB (定数 1 つ、`actions/serviceOps.ts`)。目安: renderer / group / style / camera の XML は数 KB から
    数十 KB に収まり、object (原子座標を含む) の XML は小さな蛋白でも数百 KB を超える。つまり object の
    貼り付けは、ほぼいつも印だけになる。実装時に実物の大きさを測って、上限を確かめる (目視確認で調整)。
- **再発防止**: `actionLog.ts` の `txnEnd` で、undo stack が伸びたのに op が 1 つも無い gui の行を、dev build で
  `console.warn('[actionLog] no op recorded: <label>')` する。テストは 1 件 (警告が出る / 出ない) だけ足す。

## 数え上げの結果と対応 (フェーズ順)

### Phase 1: 既存の op で表せるもの・引数を足すだけのもの (使う頻度が高い)

| 操作 (service) | 今の状態 | 対応 |
|---|---|---|
| Interaction analysis ダイアログ (`analyzeInteractions`) | **ダイアログの初期値 (min 2.5、最大 30) では何も記録されない**。2 つ目の object / selection、label set も対象外 | `analyze_interactions` に `minDist` / `maxLabels` / `label` / `obj2Id` / `selection2` を足す |
| selection に center / zoom (`applyMolSelString` の `centerMolSelection` / `zoomMolSelection`) | 記録なし | `center_view` (zoom あり / なし) |
| map の再センタリング (`map/props.ts` の `redrawMapCenter`) | 記録なし | `recenter_map` |
| Sequence panel の残基の選択 (`seqPanelOps` の toggle / range) | 記録なし | `set_mol_selection` (結果の selection 文字列) |
| Color proofing (`toggleSceneColorProofing`) | 記録なし | scene の `set_node_prop use_colproof` (と `icc_filename`) |
| CPK の dark / light gray (`setRendererColoring`) | 記録なし | `set_renderer_coloring paint-type-cpk` と `set_coloring_prop col_C` |
| 一覧に無い coloring style (`setRendererColoring` の style-*) | 記録なし | 一覧の判定をやめ、`set_renderer_coloring mode=style` で記録する |
| surface の backend 指定 (`makeMolSurf` / `regenMolSurf`) | auto 以外は記録なし | `create_surface` / `recalc_surface` に `backend` |
| superpose の useprop (`superposeMol`) | 記録なし | `superpose` に `keepAsProperty` |
| APBS の温度・誘電率・内部電荷 + 水素 (`apbs/run.ts`) | 既定値以外は記録なし | `calc_elepot` に `temperature` / `waterDielec` / `protDielec` / `useHydrogen` |
| style set の selection 定義 (`setStyleSetSelection`) | scene の最初の書き込める set だけ | `define_selection` に `styleSet` |
| camera の保存 (`saveViewToCamera`) | 前後に空白のある名前は記録なし | 名前を trim してから記録 |
| アニメーションの loop / start camera (`anim/transport.ts`) | txn も記録も無い | C++ で undo に載るかを確かめる。載るなら txn を開いて `set_anim_options` を記録する。載らなければ視点と同じく対象外 |
| view の property を Inspector で変える (`props/write.ts`) | View だけの書き込みでも txn を commit するので、undo の行は増えないのに **Redo が消える** | view だけの書き込みは txn を開かない (記録もしない) |

### Phase 2: renderer の作成とファイルの読み込みのオプション

| 操作 | 今の状態 | 対応 |
|---|---|---|
| New Renderer の preset (`createRendererOnObject`) | **preset は記録なし**。`centerView` / `mapCenterPolicy` も落ちる | `create_renderer` に `preset` / `centerView` / `mapCenterPolicy` |
| File > Open (`loadObject` / `recordLoadFile`) | path・type・selection・名前だけ。format のオプション (MTZ の列、CCP4 の mapType、PDB の flag など)、reader、renderer 名、preset、map の中心の扱いが落ちる | 形式ごとの既存 op (`load_pdb` / `load_mtz` / `load_ccp4` / `load_msms` / `load_namd` / `load_amber`) で記録し、`rendererName` / `preset` / `mapCenterPolicy` を足す |
| Get PDB (`streamLoadFromUrl`) | RCSB の標準 URL で名前が id と同じときだけ | `fetch_pdb` に `name` / `assembly` / `source`。それ以外の URL は新しい `fetch_url {url, reader, name, ...}` |
| density map の取得 (`map/streamLoad`) | RCSB の validation map だけ | `fetch_map` に `source` (RCSB / EBI) |
| MD trajectory を開く (`loadTrajectory`)、block の追加・削除・並べ替え (`trajectory.ts`) | 記録なし | 新しい `load_trajectory` / `add_traj_block` / `remove_traj_block` / `move_traj_block` (mdtools plugin の op) |

### Phase 3: op が無い scene の編集

| 操作 | 対応 (新しい op) |
|---|---|
| paint の行の挿入 (`addPaintEntry`)・貼り付け (`pastePaintEntries`) | `add_paint` に挿入位置 `at` を足す (selection を変えないようにする)。貼り付けは行ごとの `add_paint` |
| 既定の paint 表と multigrad への切り替え (`setRendererColoring`) | `set_renderer_coloring` に `paint` / `multigrad` の mode |
| multigrad の node の編集 (`setMultiGradNodes`) | `set_multigrad_nodes {nodeId, nodeType, nodes}` |
| 原子のクリックでラベル (`naviClickAtom`) | `set_atom_label {objId, atom, on}`。C++ の `addLabel` が undo 情報を持たないので、まず C++ 側で undo に載せる (gtest を先に書く) |
| unit cell だけの表示 (`showUnitCellRenderer`) | `show_unit_cell {objId}` |
| symmetry copy の作成 (`createSymmMol`) | `create_symmetry_copy {objId, matrix, name, rendererType, ...}` (operator の番号は表示範囲に依存するので 4x4 行列で記録) |
| MorphMol への変換 (`convertToMorphMol`) | `convert_to_morph {objId}` |
| scene tree の並べ替え (`reorderSceneNode`) | `move_node {nodeId, nodeType, to}` (位置で指す)。group の出入りは `set_node_prop group` |
| アニメーション要素の property の reset・一覧に無い property (`anim/genericProps`) | `reset_anim_prop {element, props}`、`set_anim_prop` を任意の property に広げる |
| render settings (`setSceneRenderSettings`) | `set_render_settings {values}` |
| 計測: selection どうし (`appendMeasureLabelBySel`)・2 つの object にまたがる pick (`appendMeasureLabel`) | `measure_geometry` の `atoms` を原子ごとに object を持てる形にし、selection の形も受ける |

### Phase 4: style set・camera・ファイル・貼り付け

| 操作 | 対応 (新しい op) |
|---|---|
| style set の作成・削除・read only (`styleOps`、scene tree の style の削除) | `create_style_set` / `delete_style_set {name, scope}` / `set_style_readonly` |
| style set のファイルの読み込み・保存 (`styleFile`) | `load_style_file {path}` / `save_style_file {styleSet, path?}` |
| Style Editor の色・selection・style の削除と色の定義 (`styleSetEdit`) | `define_color` / `remove_color` / `remove_selection` / `remove_style` (`styleSet` 付き) |
| camera の vis flag の編集・クリア (`cameraVisFlags` / `clearCameraVisFlags`) | `set_camera_visibility {name, entries(path)}` / `clear_camera_visibility {name}` |
| camera ファイルの読み込み・保存・再読み込み (`cameraFile`) | `load_camera_file` / `save_camera_file {name, path?}` / `reload_camera` |
| scene tree の貼り付け (object / renderer / group / style / camera。`clipboard/paste.ts`) | `paste_object` / `paste_renderers {target}` / `paste_style` / `paste_camera`。引数に clipboard の XML を入れる (名前の付け直しは再生時に同じ規則で行う)。上限を超える XML (object はほぼこれ) は印だけを残す |

### Phase 5: PyMOL dialect の残り

| コマンド | 対応 |
|---|---|
| `show` / `as` の `applyStyles` | `applyRendererStyleList` の service を通して `set_renderer_styles` |
| `label` / `hide labels` | 新しい `set_atom_labels {objId, selection, format | null}` (Phase 3 の C++ の undo 対応が前提) |
| `distance` / `angle` / `dihedral`、`distance mode/cutoff` | Phase 1 と Phase 3 の `analyze_interactions` / `measure_geometry` |
| `set_color`、`delete <sel>` / `set_name <sel>` | Phase 4 の `define_color` / `remove_selection` |
| `fetch` (name 指定、`1abcA`、`type=pdb1`)、`load http...` | Phase 2 の `fetch_pdb` の `name` / `assembly`、`fetch_url` |
| `isomesh` / `isosurface` の map の中心 | `recenter_map` |
| `frame` / `rewind` (`obj.frame=`) | trajectory の frame の op (`set_node_prop frame` で足りるか確かめる) |
| `pym:<rep>` という renderer 名 | `load_file` / `fetch_pdb` に `rendererName` (Phase 2) |

## 対象にしないもの
- **視点だけの変更**: 3D view のマウス操作、View pane、projection、center mark、camera の適用 (visibility なし)、
  focus、Center here、Sequence panel の center、console の `turn` / `move` / `zoom` / `orient` / `center` など、
  PyMOL の `set_view` / `reset` / `view k, recall`。
  - 今の挙動 (undo stack が伸びたときだけ行を作る) のままにする。op 自体は残るので、console・MCP・
    手で書いた qax や preset (`three-views` など) では使える。History から保存したマクロには視点が入らない。
  - camera の保存・削除や、selection を変える center (`center_view`) のように、undo に載る変更を伴うものは記録する。
- 同じ property を続けて変えた行をまとめること: 1 行 = 1 undo step の対応を保つため、まとめない。
- 原子が 0 個の selection で全原子を消す (`deleteMolAtoms`): 意図して記録しない。
- 名前で一意に指せない原子の結合の編集 (`bondEdit`): all-or-nothing のまま。
- 右クリックの atom モードの選択の `aid N`: 同じファイルなら再生できるので、今は変えない。
- hover、アニメーションの再生、tree の開閉、アプリの設定 (scene のデータではない)。

## docs
- フェーズごとに `docs/architecture/action-log.md` §2.2 (記録する op の表) と §2.3 (記録できないもの) を更新する。
  §2.3 には、視点の変更を記録しない理由を書く。
- 新しい op は `docs/architecture/op-catalog.md` の該当の節に足す。
- フェーズを実装したら、この plan からそのフェーズを消す。全部済んだら plan と `_index.md` の行を消す。

## 検証 (フェーズごと)
1. `task build_tritium` / `task run_tritium` (起動前に前のアプリが残っていないか確かめる)。
2. 対象の GUI 操作をして、History の行が op の表示文になり、`list_actions` (`task run_tritium_cli`) に op が出ることを確かめる。
   再生は、その行を Save to Actions して別の scene で Run する。dev の `[actionLog] no op recorded` の警告が出ないことも見る。
3. ユーザーの目視確認。
4. 確定後にテスト (契約だけ): 足した op の引数を service の記録が `readToolArgs` で読めること (`actionLog.test.ts` の既存の
   形に 1 件ずつ)、view だけの property の書き込みで Redo が消えないこと、上限を超えた引数の op が印の note になること、C++ の label の undo は gtest。
   `npm test`、tsc (web / node)、`npm run lint`、`lint:comments`、`task lint_tritium_style`、agent の schema snapshot の更新。
5. commit、PR、CI が通ったら `gh pr merge --merge`。
