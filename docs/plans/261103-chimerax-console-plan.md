# ChX console の残り (後でやるもの)

ChX console (plugin `chimerax-console`) で、CueMol の既存の機能 (op catalog) で作れるコマンドは実装した
(仕様は `docs/architecture/console-chimerax-dialect.md`)。ここには、まだ作っていないものと、作らなかった理由を残す。

作るときも、今の設計を踏襲する:
- 書き込みはすべて op (`display.ts` の `runOp`)。worker service は、eslint の許可リストにある読み取りにだけ使う。
- ChimeraX と意味が一致するものだけを移す。近似で違う結果を出すより、理由を言って断る。
- ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。コマンドの登録順は ChimeraX の `bundle_info.xml` に合わせる
  (`commands/registry.ts`)。

**CueMol 側の機能追加が先に要るもの**

| 候補 | CueMol の現状 | 必要な実装 |
|---|---|---|
| `lighting` (preset、光源の強度、`shadows`、`multiShadow` AO、depth cue) | 光源は shader に hard-code されている。影は無く、AO は画面空間の GTAO だけ。fog は常に on で、開始位置を動かせない | 光源の uniform 化と property 化、shadow map、多方向 shadow による AO、fog の property 化 |
| `windowsize w h` | canvas の大きさは DOM の layout だけで決まり、View の `width/height` は読み取り専用 | 3D 領域を指定の px にする renderer -> main の IPC |
| `clip near/far/position` | `center` を中心とした対称な `slab` が 1 つあるだけ | View に near / far の offset を独立して持たせる (C++ `GUIView::computeSlabPlanes`) |

**表示状態を別に持つ必要があるもの** (ユーザー判断で見送り)

- cartoon 表示中の backbone を隠す規則 (`atomic_cpp/molc.cpp` の `atom_update_ribbon_backbone_atom_visibility`):
  ribbon を表示する残基の C・O・N・(側鎖が表示されていなければ) CA を隠す。
- 非表示の原子の style の保持: `hide` しても style を覚えていて、`show` で元の style に戻る。
- どちらも、molecule ごとに表示集合と style ごとの原子集合を scene の名前付き selection (`define_selection`) に持ち、
  renderer の selection をそこから導く形になる。
  - その代償として、「`chx:` renderer の selection が表示状態そのもの」という今の設計が崩れる。
    GUI で renderer を直接編集した内容は、次のコマンドで上書きされる。
  - selection の一覧にも、molecule ごとに 2–3 個の名前が増える。

**`fit_view` op** (ユーザー判断で見送り。要望が出たら作る)

- 複数 object の範囲に fit する公開 op。ChX の `view` は、すでに内部で複数 object に対応している。
- 作るには、catalog に構造化した引数の種類 (`{objId, selection}[]`) を足し、次の 4 つを揃える必要がある:
  - MCP の schema
  - native console の引数変換
  - selection の検査
  - qax の記録
