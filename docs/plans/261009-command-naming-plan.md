# コマンド名 (op 名) の規約と一斉リネーム

## Context

- op catalog の op は 100 個近くになった (console builtin と MCP の scene tool を含む)。
- 追加のたびに名前をその場で決めてきたので、形がそろっておらず覚えにくい。
  - 語順が混在している: `list_cameras` (動詞_名詞)、`anim_list` (名詞_動詞)、`scenes` / `morph_frames` / `reader_options` (名詞だけ)。
  - 同じ意味に別の動詞を使っている: 作成が `create` / `make` / `gen` / `new`、計算が `calc` / `regen`、書き換えが `set` / `change` / `update`、一覧が `get` / `list`。
  - 同じものに別の名前が付いている: console の `scenes` と MCP の `list_scenes`。
  - alias の付け方にも規則がない: `surface` は作成、`png` は保存、`props` は表示で、名詞だけ見ても何をするか分からない。
- native console・MCP・`tritium_cli` は、まだどのリリースにも入っていない。
  - 最後のリリース v2.3.20.539 の時点では、op catalog も `plugins/console` も存在しない。
  - 旧名との互換を考えなくてよい今のうちに、規約を決めて一斉にそろえる。
- AI agent はリリース済みだが、tool 名は毎回 catalog から生成され、会話履歴はメモリにしか残らない。そのため、名前を変えても壊れるものは無い。

## 規約

### R1. op 名は `動詞_目的語` (snake_case)

- すべての op 名を動詞で始める。名詞だけの名前は、op 名としては使わない (alias は R4)。
- 目的語は、その op が扱う「もの」の名前にする。目的語が自明な固有の動作 (`superpose`、`animate`) は、動詞だけでよい。
- 語順を `名詞_動詞` にしない。`anim_add` は `add_anim` にする。
  - これで失われる「同じ対象の op が Tab 補完で並ぶ」性質は、R5 の `help` の分類で補う。

### R2. 動詞の語彙を固定する

| 動詞 | 意味 | 例 |
|---|---|---|
| `list` | 複数のものを一覧する。目的語は複数形 | `list_cameras`、`list_scenes` |
| `get` | 1 つのものの状態や値を読む | `get_scene_state`、`get_prop` |
| `set` / `reset` | 既にあるものの属性を書き換える / 既定値に戻す | `set_view`、`set_renderer_type` |
| `create` / `delete` | scene の node (object・renderer・group・camera・scene) を作る / 消す | `create_renderer`、`delete_camera` |
| `add` / `remove` | あるものの中の項目 (bond・paint の項目・アニメーション要素・morph の frame・相互作用) を足す / 除く | `add_bond`、`remove_paint` |
| `move` / `rename` | 並べ替える / 名前を変える | `move_camera`、`rename_node` |
| `clear` | 中身を全部消す | `clear_paint`、`clear_undo` |
| `apply` | 名前の付いたもの (style・camera) を当てる | `apply_camera` |
| `load` / `save` | CueMol のファイルを読み書きする | `load_file`、`save_scene` |
| `export` | 画像や他の形式に書き出す | `export_image`、`export_scene` |
| `fetch` | ネットワークから取ってくる | `fetch_pdb` |
| `calc` | 計算して結果を作る (`recalc` は作り直す) | `calc_elepot`、`recalc_surface` |
| `show` / `hide` | 表示する / 隠す。**この意味だけ** (PyMOL と同じ)。情報の表示には使わない | `show_symmetry` |

- 上の表にない固有の動詞 (`superpose`、`measure`、`merge`、`cut`、`rotate`、`pan`、`focus`、`center`、`recenter`、`analyze`、`render`、`animate`、`renumber`、`define`、`count`) は使ってよい。ただし、表の動詞と意味が重ならないものに限る。
- 次の同義語は使わない: `make` / `gen` / `new` (→ `create`)、`compute` / `regen` (→ `calc` / `recalc`。短いほうを採る)、`change` / `update` (→ `set`)、`get` で一覧 (→ `list`)。

### R3. 目的語の語をそろえる

- 次の語を使う: `scene`、`object`、`renderer`、`group` (renderer group)、`camera`、`view`、`prop` / `props`、`selection`、`paint` (paint の項目)、`anim` (アニメーション要素)、`morph_frame`、`map_contour`、`surface`。
- 分子に限るものは `mol` を前に付ける (`set_mol_selection`)。分子にしか無いもの (chain・residue) には付けない (`list_chains`)。

### R4. alias (console だけの短い名前)

- alias は console の短縮形で、MCP と agent には出さない (今と同じ)。
- 1 語の動詞で、op 名の動詞か、それと同じ意味の語にする (`load`、`save`、`write`、`delete`、`rename`、`select`、`focus`、`turn`、`pan`、`define`、`render`)。
- 名詞だけの alias は「値の表示と設定」型に限る。
  - 引数なしで現在の値や一覧を表示し、引数があればそれを設定する。
  - 該当するもの: `scenes`、`cameras`、`props`、`view`、`slab`、`projection`、`style`、`contour`。
  - **名詞だけのコマンドは表示 (引数があれば設定)** を、規約として `help` とドキュメントに書く。
- 作成・書き出し・計算など、副作用のある動作には名詞の alias を付けない (`surface` と `png` を外す)。
- PyMOL の語 (`ray`、`png`) は PyMOL dialect の担当とし、native には入れない。

### R5. `help` を分類つきにする

- `help` の一覧を、対象ごとの見出し (Scene / Objects / Renderers / Colouring / Selections / View & Camera / Properties / Molecule editing / Maps / Animation / Files / Console) に分けて出す。
- 分類は op の定義に `group` を 1 つ足して持たせる。builtin の command も同じ field を持つ。
- `help anim` のように分類名を渡すと、その分類だけを出す。

## 対応表

変更するものだけを載せる。ここに無い op (`create_renderer`、`set_view`、`list_cameras`、`add_bond`、`superpose` など約 60 個) は、名前も alias もそのまま残す。

### op 名の変更

| 現在 | 新しい名前 | 理由 |
|---|---|---|
| `anim_list` | `list_anims` | R1 の語順 |
| `anim_add` / `anim_remove` / `anim_move` | `add_anim` / `remove_anim` / `move_anim` | R1 |
| `anim_time` | `set_anim_time` | R1 |
| `anim_set` | `set_anim_prop` | R1。何を set するかを目的語で示す |
| `anim_options` | `set_anim_options` | R1 |
| `morph_frames` | `list_morph_frames` | R1 (名詞だけ) |
| `morph_add` / `morph_remove` | `add_morph_frame` / `remove_morph_frame` | R1 |
| `reader_options` | `list_reader_options` | R1 (名詞だけ) |
| `get_node_props` | `list_node_props` | R2 (一覧は `list`)。`set_node_prop` と対になる |
| `get_renderer_types` | `list_renderer_types` | R2 |
| `get_coloring_styles` | `list_coloring_styles` | R2 |
| `get_mol_chains` | `list_chains` | R2、R3 |
| `get_mol_residues` | `list_residues` | R2、R3 |
| `make_surface` | `create_surface` | R2 (`make`) |
| `gen_surface_obj` | `create_surface_from_map` | R2 (`gen`)。何から作るかを示す |
| `regen_surface` | `recalc_surface` | R2 (`regen`) |
| `color_by_elepot` | `set_elepot_coloring` | R2。`set_renderer_coloring` と同じ「色付けの方式を設定する」系に並べる |
| `change_renderer_type` | `set_renderer_type` | R2 (`change`) |
| `change_resid` | `renumber_residues` | R2 (`change`)。動作をそのまま表す |
| `update_paint` | `set_paint` | R2 (`update`) |
| `paint_selection` | `add_paint` | R2。paint の項目を 1 つ上に足す動作なので `list_paint` / `set_paint` / `move_paint` / `remove_paint` / `clear_paint` と並べる |
| `save_selection` | `define_selection` | R2 (`save` はファイル)。alias の `define` と同じ動詞 |
| `check_selection` | `count_selection` | 実際の動作 (一致する原子数を数える) を表す |
| `scenes` (builtin) | `list_scenes` | MCP の名前とそろえる。alias `scenes` を付ける |
| `new_scene` (builtin、MCP) | `create_scene` | R2 (`new`) |
| `log_open` / `log_close` (builtin) | `open_log` / `close_log` | R1 の語順 |

- agent の tool 名も変わるのは、`get_node_props`、`get_renderer_types`、`get_coloring_styles`、`get_mol_chains`、`get_mol_residues`、`make_surface`、`change_renderer_type`、`paint_selection`、`save_selection`、`check_selection` の 10 個。

### alias の変更

| op | 現在の alias | 新しい alias | 理由 |
|---|---|---|---|
| `get_scene_state` | `ls_scene` | `scene` | 「表示」型の名詞 alias (R4)。`ls` はファイル一覧の builtin と紛らわしい |
| `create_surface` | `surface` | なし | 作成に名詞 alias は付けない (R4) |
| `save_png` | `png` | なし | 下の D3 を参照 |
| `render_image` | `ray` | `render` | PyMOL の語は native に入れない (R4) |
| `list_scenes` | (なし) | `scenes` | builtin `scenes` の置き換え |
| `count_selection` | (なし) | `count` | |

## 決定事項

- **D1. 語順**: `動詞_目的語` に統一する。`名詞_動詞` の利点 (Tab 補完で同じ対象の op が並ぶ) は、R5 の分類つき `help` で補う。
- **D2. 旧名との互換**: 考えない。旧名は残さず、alias としても置かない。native console・MCP・`tritium_cli` は未リリースで、agent は tool 名を毎回生成しているため。
- **D3. `save_png` と `export_image`**: `export_image` 1 つにまとめる。`outputPath` に寄せ、agent はこれまでどおりデスクトップに名前だけで保存し、console と MCP はパスを指定できる。
- **D4. 名詞だけのコマンド**: R4 の規約 (引数なしで表示、引数ありで設定) のもとで認める。タイプ量を減らすため。
- 計算の動詞は `compute` ではなく、短い `calc` / `recalc` を使う。
- PR は 1 本にする。リネーム (第 1 段) の後に、同じブランチで MCP / console の実装の見直し (第 2 段) を行う。

## 実装

1. op の `name` と `aliases` を対応表のとおりに変える (`catalog/ops/*.ts`、`plugins/console/worker/dialects/native/builtins.ts`、`plugins/mcp/renderer/sceneTools.ts`)。
2. 名前が文中に出てくる箇所を直す。
   - op の description にある他の op への言及 (「call get_scene_state」など)
   - `catalog/guide.ts` (`MCP_INSTRUCTIONS`)
   - agent の system prompt と toolset の説明
3. `help` の分類 (R5): `defineOp` に `group` を足し、builtin にも持たせる。一覧の出し方を変え、`help <分類>` を足す。
4. D3 の統合: `save_png` を外し、`export_image` を `outputPath` に寄せて console と MCP にも出す。
5. 規約の本文を `docs/architecture/op-catalog.md` に移す。op を新しく足すときは、ここを見て名前を決める。

## テスト

- 名前を変えるだけなので、新しいテストは足さない。既存のテストと agent の schema snapshot を新しい名前に合わせる。
- 規約を機械的に守らせるテストを 1 件足す: op 名が R2 の動詞か固有動詞の許可リストで始まること。名前の付け方が今後またばらけるのを、追加の時点で検知するため。
- `help` の分類: 「すべての op と builtin がどれかの分類に入っている」ことを 1 件で確かめる。

## 検証

1. `task build_tritium` → `task run_tritium -- --tritium-cli`
2. `tritium_cli` で次を確かめる。
   - `help` が分類つきで出る。`help anim` が分類だけを出す。
   - 新しい名前と alias で、主なコマンドが動く。
   - 旧名が「unknown command」になる。
3. MCP の `tools/list` に新しい名前が出て、旧名が無い。
4. agent パネルで 1 回会話し、tool の呼び出しが通る。
5. `npm test`、tsc (web / node)、ESLint

## 第 2 段: MCP と console の実装の見直し

リネームのコミットの後に、同じブランチで 1 項目 1 コミットで行う。共通の中核 (`catalog/opRuntime.ts` の `invokeOp` / `runInTxn`) は 3 つの front end が既に共有しているので、重複している端の部分を対象にする。

- **誤った応答や入力の受け付けを直す**:
  - MCP の error を、必ず JSON の `ok:false` で返す。endpoint への中継が失敗したときも同じにする。
  - scene ファイルを開いた結果の判定を、console と MCP で 1 つにする。
  - text と JSON の引数の検査規則を 1 つにする (integer、真偽値、selection、入力パス)。
  - text の真偽値と数値の読み方を 1 か所にまとめる。
- **重複をまとめる**:
  - scene タブの操作を、renderer 側で 1 つの実装にする。
  - 「番号 / `#uid` / 名前」での参照と、1 から始まる番号の扱いを共通化する。
  - op の失敗の返し方をそろえる。
  - console の配管 (`OpContext` の組み立て、`spec.run` の呼び出し、endpoint の実行中の数の管理) をまとめる。
  - `outsideTxn` を、型のついた引数を受け取る形にし、transaction の外で動く op を排他にする。
  - 小さな重複と、使われていない export を整理する。
