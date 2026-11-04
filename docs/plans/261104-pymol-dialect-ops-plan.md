# PyMOL dialect のコマンドを op catalog 経由にする (op 化) プラン: 残り

## Context

PyMOL dialect (`tritium/react-gui/src/plugins/pymol-console/worker/commands/`) の書き込みを、ChX と同じく
op catalog の op (`runOp`) で行う形にそろえている。表示・色・設定・selection・label・object の
コマンドは移した (仕様は `../architecture/console-pymol-dialect.md` §1 の「op の使い方」)。
残りは、op が足りないか op に引数が足りない領域で、今も worker service や C++ wrapper を直接呼んでいる:
`load` / `fetch` / `save` / `png` / map / 計測 / view / movie。

得られるもの:
- 記録も undo もされない wrapper の直接書き込み (zoom / orient / set_view / frame / save) が無くなる。
- 足りない op を catalog に足すので、MCP / agent / native console からも同じ操作ができる。

**目標**: PyMOL の commands から、書き込みを行う service / wrapper の import を無くす。残すのは、op にしない
読み取り専用の補助 (op-catalog.md §3.1) と console 自身の機能だけ。console 自身の機能は
`cd` / `pwd` / `ls` / `run` / log / `undo` / `redo` / `quit` / `get` / `get_view` / `count_*` / `get_names` / `refresh`。
この状態を eslint で固定する。

**変えないもの**: PyMOL の名前・引数・文言・selection の翻訳 (`sel/`)・`pym:<rep>` 規約。文言を保つため、
読み取り専用の事前検査は dialect に残す (`no such chain`、`matched no atoms` など)。

## 1. 方針

- 書き込みは `helpers.ts` の `runOp` で行い、`run` は `async` にする (移した領域と同じ)。
- **パス**: `opContextOf` の `fileAccess: 'any'` の下でも、`outputPath` / `callerPath` は相対パスを Desktop から解決する。
  dialect は今と同じく `cc.cwd` で絶対パスにしてから op に渡す。
- **記録**: 視点の op は native と同じ条件 (`replay`) で記録される。今は記録されない `zoom` / `orient` /
  `set_view` / `frame` が記録されるようになる。

## 2. コマンドと op の対応

既存の op で書けるもの:

| コマンド | 使う op |
|---|---|
| `load` (URL)、`fetch` | `fetch_url`、`fetch_pdb`、`fetch_map`、`fetch_emdb` (`name` は明示する)、chain 指定は `delete_atoms` |
| `load` (`.qsc`) | `load_file` の scene の分岐 (`outsideTxn`) |
| `save` (`.qsc` / 画像 / pov / stl)、`png` | `save_scene`、`export_scene` |
| `isolevel` | `set_map_contour` |
| `distance` / `angle` / `dihedral` | `measure_selections` (`label` には名前か既定の名前を渡す)、`analyze_interactions` |
| `zoom <object>`、`turn`、`move` | `focus_node`、`rotate_view`、`pan_view` |
| `center` | 重心を読み取りで求めて、`set_view center` |
| `view store` / `recall` / `clear` | `save_camera`、`apply_camera`、`delete_camera` |
| `align` / `super` / `pair_fit` | `superpose` (`algo`: `USalign` / `LSQ`。RMSD の表示は今の読み取りのまま) |
| `mplay` / `mstop` / `rewind` | `animate` (`play` / `pause` / `seek 0`) |

op を足すか、既存の op を広げる必要があるもの (catalog に足し、console と MCP に出す。agent に出すかは §3.1 の基準で決める):

| 用途 | 変更 | 理由 |
|---|---|---|
| `zoom <selection>` | 新しい op `fit_selection {objId, selection, zoom}`。`mutates: false`、`replay: true`。`fitView2` と、重心への移動を使う | `center_view` は object の selection を書き換え、undo の行も作る。PyMOL の `zoom` は selection を変えない |
| `orient` | 新しい op `orient_view {objId, selection}` (`mol.orientView`)。`mutates: false`、`replay: true` | 対応する op が無い |
| `reset`、PyMOL の `set_view` | `set_view` に `rotation` (quaternion) を足し、`replay` の条件にも入れる。`setViewXform` (`services/view/viewXform.ts`) の書き込み順を distance -> slab に直す。投影方式は既存の `set_projection` op で戻す | `set_view` が回転を書けない。今の `setViewXform` は slab を先に書くが、C++ の `View::setSlabDepth` は slab を「その時点の distance の 2 倍」までに切り詰める。そのため、遠い視点を戻すと slab が欠ける。今の PyMOL `set_view` (`viewCommands.ts` の `writeCam`) は distance を先に書いており、投影方式も戻している |
| `frame`、`rewind` の frame | 新しい op `set_frame {objId, frame}`。`mutates: false`、`replay: true` | 今は wrapper に直接書いている。txn を開かない扱い (action-log.md §2.3) を保つ |
| `save x.pdb` / `.sdf` / `.mol` / `.pqr` | `save_object` に `selection` と `format` (writer) を足す。さらに、object の参照元 (`src`) を書き出したファイルに付け替えるかどうかを `link` 引数 (既定 true) で選べるようにする。`selection` を指定したときは常に付け替えない。PyMOL の `save` は `link: false` で呼ぶ | 今は writer を直接操作している。部分の書き出しと、形式を拡張子と別に指定する手段が op に無い。`saveObjectToFile` (`services/file/objectSave.ts`) は `convToLink = true` 固定なので、そのまま使うと、chain A だけを書き出した後に object 全体の参照元がその部分ファイルに変わる。scene を保存して開き直すと、残りの原子が失われる。今の PyMOL は `convToLink = false` |
| `load ... format=` | `load_file` に `reader` を足す | `load_<fmt>` op が無い reader がある |
| `isomesh` / `isosurface` | `create_renderer` に `mapCenterPolicy` を足す。続けて `recenter_map`、`set_map_contour`、`set_node_prop` (`bndry_*`) | 今は `'auto'` に固定されている。現状でも記録が `auto` で残る不一致があり、この変更で直る |

### 2.1 レビュー (`261104-pymol-dialect-ops-review.md`) への対応

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 [P1] | `save_object` に `selection` を足すだけでは、部分保存で object の参照元が部分ファイルに変わる | **有益** (scene の保存と再読込で原子を失う。データの損失で、気付きにくい。`objectSave.ts` が `convToLink = true` 固定、PyMOL が `false` であることを確認した) | `save_object` に `link` を足し、`selection` があるときは付け替えない。PyMOL は `link: false`。テストで `src` が変わらないことを pin する (§2、§4) |
| 3 [P2] | `set_view` に回転を足すだけでは、投影方式と slab が戻らない | **有益** (PyMOL の `get_view` -> `set_view` という往復の基本の用途で、今は戻るものが戻らなくなる退行。`setViewXform` が slab を先に書くこと、`View::setSlabDepth` が distance の 2 倍で切り詰めることを確認した。直すのは書き込み順の入れ替えと、既存の op の呼び出し 1 つ) | `setViewXform` を distance -> slab の順に直し (native の `set_view` にも効く)、投影方式は `set_projection` で戻す。テストを、カメラの復元全体の pin にする (§2、§4) |

## 3. 主な変更ファイル

- `plugins/pymol-console/worker/commands/`: `fileCommands.ts` (load / fetch)、`saveCommands.ts`、`mapCommands.ts`、
  `measureCommands.ts`、`viewCommands.ts`、`fitCommands.ts`、`miscCommands.ts`、`movieCommands.ts`
- `renderer/worker/server/catalog/ops/`:
  - `viewOps.ts`: `set_view` の `rotation`、`fit_selection`、`orient_view`
  - `moreOps.ts`: `save_object` の拡張、`set_frame`
  - `fileOps.ts`: `load_file` の `reader`
  - `rendererOps.ts`: `create_renderer` の `mapCenterPolicy`
- `renderer/worker/server/services/view/viewXform.ts`: `setViewXform` の書き込み順 (distance -> slab)
- `renderer/worker/server/services/file/objectSave.ts`: `saveObjectToFile` に selection と `convToLink` の指定を通す
- `tritium/react-gui/eslint.config.mjs`: pymol-console の service import を、読み取り専用の許可リストにする (ChX と同じ書き方)
- 既存のテスト (`fileCommands.test.ts`、`mapCommands.test.ts`、`measureCommands.test.ts`、`saveCommands.test.ts` など):
  service の mock を、呼んだ op の名前と引数を確かめる形にする (移した領域と同じく catalog の `invokeOp` を mock する)

## 4. テスト (最小集合)

- 既存の PyMOL テストを書き換える。期待するのは「呼んだ op の名前と引数」。文言の期待値は変えない。
- 新しい op と、広げた op の引数ごとに 1 件:
  - `fit_selection` が object の selection を変えないこと
  - PyMOL `set_view` によるカメラの復元: 回転・遠い distance と、その distance でしか入らない slab・投影方式が、すべて元に戻ること
    (distance -> slab の順と `set_projection` の pin。回転だけのテストにはしない)
  - `set_frame` が txn を開かないこと
  - `save_object` の `selection`: 部分を書き出した後も、object の `src` が変わらないこと
  - `load_file` の `reader`
  - `create_renderer` の `mapCenterPolicy`

## 5. 検証

1. `cd build_scripts && task build_tritium`。前のアプリが残っていないか確かめて (`pgrep -fl "tritium/node_modules/.pnpm/electron"`) から、`task run_tritium` で起動マーカーまで進むことを確かめる。
2. `task run_tritium_cli -- --dialect pymol -c '...'` で領域ごとにまとめて流す。History pane の行を展開し、子行に op が 1 行ずつ出ることを確かめ、ユーザーに目視確認を依頼する。
   - 例: `fetch 1crn; zoom resi 10-20; orient; frame 1; save /tmp/x.pdb, chain A; isomesh m, map, 1.0`
3. 確定後: `npm test`、`npx tsc -p tsconfig.web.json --noEmit`、`npx tsc -p tsconfig.node.json --noEmit`、eslint、`task test_tritium_cli`。
4. qax の再生: PyMOL で作った表示を History pane で qax に保存し、native で再生して同じになることを 1 回確かめる。

## 6. ドキュメント

- マージ時に、済んだ部分を architecture 側に書き起こし、この plan を消す:
  - `console-pymol-dialect.md` §1「op の使い方」: 残りの対応を足し、「まだ service を直接呼んでいるもの」を消す。
  - `op-catalog.md`: §5 の PyMOL dialect の段落の「まだ service を直接呼ぶ」を消し、§6 以降の op 一覧に新しい op を足す。
  - `action-log.md`: §2.2 の「PyMOL の一部のコマンドは service を直接呼ぶ」を消し、§2.3 (`frame` / 視点の扱い) を直す。
