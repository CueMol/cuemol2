# 記録できない操作をなくす (action log の op 網羅) 計画

## Context

History pane と Actions pane (PR #674 / #675) は、undo の各 step に記録された op を使う。op が記録されない
step は「no op recorded」の行になり、qax への保存・マクロ・再生に使えない。
rainbow の hue が docs の既知リストに無いまま漏れていたので、undo txn を開く全箇所
(service 約 130 か所)・txn を開かない変更・PyMOL dialect を数え上げた (約 50 か所が記録なし、約 30 か所が一部だけ)。その結果のうち、残りと潰す順序をまとめる。
既存の op で表せるもの・引数を足すだけのもの、renderer の作成とファイルの読み込みのオプション、op が無かった scene の編集 (旧 Phase 1-3) は実装済みで、
仕様は `../architecture/action-log.md` §2.2。

ユーザーと決めたこと:
- **視点だけの変更は記録しない**。History は undo の履歴で、View / Camera の変化は C++ の undo の対象ではないため (下の「対象にしないもの」)。
- **貼り付け**: clipboard の XML を op の引数に入れ、再生できるようにする。ただし qax が膨らまないように、大きすぎる引数は記録せず、「記録していない」と分かる印を残す (上限は実装済み)。
- **ファイルへの書き出し** (style set / camera の Save / Save as): op にして記録する (`render_image` と同じ扱い)。

フェーズごとに 1 PR。マージしてから次のフェーズのブランチを切る (stacked PR にしない)。

## 共通の方針
- 記録点は今までどおり service の txn の中 (`actions/serviceOps.ts` の `recordOp` と helper)。op を足すときは
  `catalog/ops/*.ts` に定義し、service の `run` から同じ service を呼ぶ (GUI と op が同じ経路になる)。
- toggle は「切り替えた後の値」で記録する (再生が前の状態に依存しないように)。
- uid で持っている値 (camera の vis flag の対象など) は、記録時に path に直す。
- 大きすぎる引数 (64 KB 超) は `recordOp` が印の note にする (実装済み。`../architecture/action-log.md` §2.2)。
  貼り付けの op は、この上限に任せてよい。object の XML の実際の大きさは Phase 4 で測り、上限を見直す。

## 数え上げの結果と対応 (フェーズ順)

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
| `label` / `hide labels` | 新しい `set_atom_labels {objId, selection, format | null}` (C++ の `NameLabelRenderer` はラベルの変更を undo に載せる) |
| `distance mode/cutoff` | `analyze_interactions` (引数は揃っている。PyMOL 側から 2 つ目の object / selection と label set を渡す)。selection どうしの `distance` / `angle` / `dihedral` は `measure_selections` で記録済み |
| `set_color`、`delete <sel>` / `set_name <sel>` | Phase 4 の `define_color` / `remove_selection` |
| `fetch` (name 指定、`1abcA`、`type=pdb1`)、`load http...` | `fetch_pdb` の `name`、`fetch_url` (op はある。PyMOL 側の記録を確かめる) |
| `isomesh` / `isosurface` の map の中心 | `recenter_map` |
| `frame` / `rewind` (`obj.frame=`) | trajectory の frame の op (`set_node_prop frame` で足りるか確かめる) |
| `pym:<rep>` という renderer 名 | `load_*` / `fetch_pdb` の `rendererName` (op はある。PyMOL 側の記録を確かめる) |

## 後回し (この plan の範囲外)
- MD trajectory (mdtools plugin): 開く (`loadTrajectory`) と block の追加・削除・並べ替え (`trajectory.ts`)。
  op catalog は core のものだけで、plugin から op を足す仕組みが無い。その仕組み (plugin の manifest に ops を
  書くと catalog・console・MCP に出る) を作るときに、`load_trajectory` / `add_traj_block` / `remove_traj_block` /
  `move_traj_block` を足す。

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
