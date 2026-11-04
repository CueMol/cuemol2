# ChX console の残りのコマンド実装プラン (既存機能で作れるもの)

## Context

ChX console (plugin `chimerax-console`) は、基盤と基本コマンドだけが入っている
(`open` `close` `delete` `show` `hide` `cartoon` `style` `color` `view` `undo` `redo` `usage` `help`)。
仕様は `docs/architecture/console-chimerax-dialect.md`、残りの候補は `docs/plans/261103-chimerax-console-plan.md` §1 にある。

今回は、**CueMol の既存の機能 (op catalog) で作れるものをすべて**実装する。

今回やらないもの (plan に残す):
- CueMol 本体の改修が先に要るもの: `lighting`、`windowsize`、`clip`
- 表示状態を別に持つ必要があるもの: cartoon 表示中の backbone を隠す規則、非表示の原子の style の保持。
  どちらも「`chx:` renderer の selection が表示状態そのもの」という今の設計を崩すので、見送る (ユーザー判断)
- 複数 object の範囲に fit する公開 op `fit_view` (ユーザー判断。ChX の `view` は内部で対応済み)

守ること (今の設計の踏襲):
- 書き込みはすべて op (`display.ts` の `runOp`)。worker service は、eslint の許可リストにある読み取りにだけ使う。
- ChimeraX と意味が一致するものだけを移す。近似で違う結果を出すより、理由を言って断る。読めるが未対応の keyword は
  `warnIgnored` (`commands/warn.ts`) で warn して先へ進める。
- ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。コマンドの登録順は ChimeraX の `bundle_info.xml` に合わせる
  (`commands/registry.ts`。前方一致は登録順で最初のものに解決するため)。

## 1. PR の分け方 (stacked にしない。1 つマージしてから次へ)

| PR | 内容 |
|---|---|
| PR 1 | (実装済み) atom spec の拡張、色の書き方の拡張 |
| PR 2 | (実装済み) 視点のコマンド |
| PR 3 | 選択と名前: `select` 一式、`name` 一式、`info` 一式、`alias` 一式 |
| PR 4 | 表現と解析: `surface` 一式、`transparency`、`label` 一式、`distance` 一式、`align`、`matchmaker`、`save` |
| PR 5 | 色の拡張 (`bychain` `bymodel` `random`、`rainbow`) と、`open` の auto style |

各 PR の流れ: 実装 → `task build_tritium` / `task run_tritium` → `task run_tritium_cli -- --dialect chimerax -c '...'` で確認 →
ユーザーの目視確認 → テスト (最小集合) → `npm test`・`tsc` (web / node)・eslint → docs を architecture に書き起こし、
plan から済んだ項目を消す。

## 2. (PR 1 は実装済み)

atom spec の zone・属性 test・wildcard・`start`/`end` と色の書き方は実装した
(`docs/architecture/console-chimerax-dialect.md` §3、§6)。残りの selector の拡張 (今の選択 `sel`、scene の名前付き
selection の名前) は PR 3 で行う。

## 3. (PR 2 は実装済み)

`turn` `move` `cofr` `zoom`、名前付き view と `view matrix`、`set bgColor`、`graphics silhouettes` は実装した
(`docs/architecture/console-chimerax-dialect.md` §6)。

## 4. PR 3: 選択・名前・info・alias

- **名前付き selection の名前を selector として読む**: scene の名前付き selection の名前 (`select/getSelDefs`) を
  `isSelector` に加え、emit はその名前をそのまま書く (CueMol の名前の参照)。`name` で定義したものを spec で使うため。
  `parseSpec` に渡す selector の判定を、scene ごとに作る形にする (`emitContext` と同じく `display.ts` で組み立てる)。
- **selector `sel`** (今の選択): `KNOWN_ONLY` から外し、各 object の今の `sel` (`props/read`) を、その object での
  式にする。選択が空の object では `none`。`select sel ...` のように選択を書き換えるコマンドでも、書き換える前の値から
  読む。GUI で選んでから `show sel atoms`、`select /A:10-20; color sel red` が使えるようにするため。新しい状態は持たない。
- **`select [spec]`** (`residues` keyword は `byres`): spec の object は `set_mol_selection`、それ以外の molecule は空にする
  (ChimeraX は選択を置き換える)。spec が無ければ全部。
  `select add` / `subtract` / `intersect` / `clear`、`~select` (= `select subtract`) は、今の object の `sel` を読んで
  (`props/read`) `union` / `minus` / `intersect` (`display.ts`) で組み合わせて書く。`minimumLength` などは warn。
- **`name N spec`**: `define_selection` (scene の最初の書き込める style set)。spec に model (`#`) を含むときは断る
  (CueMol の名前付き selection は object ごとに評価する 1 つの式なので、model の区別を持てない)。
  `name N` (定義を出す)、`name delete N|all` (`remove_selection`)、`name list` (`get_scene_state` か `select/getSelDefs`)。
  `name frozen` は断る (今の原子の集合を固定する手段が無い)。
- **`info`** (`list_info`): `info` / `info models` (`N models`、model ごとに `#N, name, shown|hidden` と原子・残基・chain の数)、
  `info chains` (`chain id /A chain_id A`)、`info residues`、`info atoms` (`attribute` は name・number・bfactor・occupancy・
  element だけ)。数は `count_selection` / `list_chains` / `list_residues` の読み取りの op か、許可リストの service で読む。
  `saveFile` は warn。
- **`alias name text`**: plugin の worker のメモリに表を持つ (ChimeraX の alias も session の中だけ)。
  - **定義**: `text` は `;` を含めた行の残り全部 (ChimeraX の `WholeRestOfLine`)。そのため `splitLines`
    (`cli/syntax.ts`) は、行の先頭が `alias` のときは `;` で分けない。`alias redcartoon cartoon; color red` は定義時に
    何も実行せず、2 つのコマンドを持つ alias になる。
  - **呼び出し**: alias の表を見て展開するのは、**そのコマンドを実行する直前**にする。runtime は submit や `.cxc` の
    全文を、最初のコマンドの前に `split` するので、`split` の段階で展開すると、同じスクリプトの中で前の行が定義した
    (または定義し直した) alias を使えない。
    - `split` は、定義の本文の `;` を残す字句の分割だけにする。
    - 展開した文字列はもう一度 `splitLines` にかけ、複数のコマンドとして同じ submit の txn の中で順に実行する。
    - `$1`–`$9`、`$*` を置き換える。自分自身の展開は 1 段で止める。
    - 実装の形: ChX の alias 呼び出しを 1 つのコマンド (`ConsoleCommand`) として bind し、その `run` が展開と、
      展開した各コマンドの解決・bind・実行を行う。今の runtime は `resolve` に渡した元の文字列を `bind` にも渡すので、
      runtime に展開の経路を足さずに済む。
      runtime に手を入れる必要が出たら、dialect 中立の形 (`DialectSyntax` の hook) にする。
    - **txn の外で走るべきコマンドは、alias の中では断る**。runtime が txn の中で断っている `outsideTxn` のコマンド
      (`save x.qsc`、`open x.qsc` など) と `undoStack` のコマンド (`undo` / `redo`) を、子コマンドを実行する前に検査する。
      見つかったら何も実行せずに `alias <name>: <cmd> cannot run inside an alias; run it on its own line` で断る。
      子の `run` を直接呼ぶと、この検査が抜ける (`invokeOp` は検査しない)。たとえば `save_scene` は undo の履歴を消すので、
      txn の中で走ると txn と履歴が食い違う。alias 経由でこれらを txn の外で走らせる機能は作らない。
  - `alias name` (定義を出す)、`alias list`、`alias delete name|all`、`~alias`。
  - 補完の候補とコマンド一覧 (`help`) に alias も出す。

## 5. PR 4: 表現と解析

| コマンド | 実装 | 断る・warn するもの |
|---|---|---|
| `surface [spec]`、`enclose`、`probeRadius` | ChimeraX と同じく **chain ごとに** 1 つの `dsurface` renderer (`chx:surface:<chain>`) を、`surface` が触れたときに作る (`ensureOwned` の一括作成には入れない)。接している chain どうしをまとめて計算すると、chain の間の面が消えるため。表面を作る原子 (`sel`、その chain の溶媒・ligand・イオンを除いた原子) と表示する原子 (`showsel`、`DirectSurfRendererBase.qif`。含まれない原子の頂点は描かない) を分け、`showsel` に spec の原子を足す (patch の表示)。`enclose` は指定した原子群を囲む別の renderer (`chx:surface:enclose`) にする。`probeRadius` は renderer の property | patch の境界の細部は ChimeraX と違いうる (doc に書く)。`gridSpacing` `resolution` `visiblePatches` などは warn |
| `surface hidePatches` (`~surface`)、`surface close` | 該当する `chx:surface:*` の `showsel` から spec の原子を引く (`set_node_prop`。`sel` は変えないので、表面は計算し直さない) / `delete_node` | |
| 既存の `show` / `hide` / `color` の surface | 今は surface を warn して飛ばしている (`displayCommands.ts`、`colorCommands.ts`)。`show ... surfaces` / `target s` は、ある `chx:surface:*` の `showsel` に足す。表面がまだ無い chain では作る (ChimeraX の `show surfaces` と同じ)。`hide ... surfaces` は `showsel` から引く。`color ... target s` (既定の target `acsbpf` も) は `chx:surface:*` の paint に entry を入れる (`ensurePaint` / `add_paint_at`)。対象の renderer を解決する関数を 1 つにし、PR 5 の `bychain` / `rainbow` もそれを使う | |
| `transparency spec percent [what] target` (既定 target `s`) | renderer の `alpha = 1 − percent/100` (`set_node_prop`)。target の a→3 つの atom renderer、c/r→ribbon、s→surface | spec が object の一部のときは断る (CueMol の透明度は renderer 単位で、原子ごとではない) |
| `label spec [atoms\|residues]`、`text`、`attribute`、`height` `size` `color` | `set_atom_labels` (原子ラベルは `chx:label:atoms`、残基ラベルは `chx:label:residues`)。原子を含む spec の既定は residues。原子を指す spec (`/A:10@CB`) も、residues なら先に残基に広げる (`byres`)。残基ごとに代表原子を 1 つ選んで `{resn} {resi}` を付ける: `CA`、核酸は `C4'`、どちらも無い残基 (ligand・水・イオン) は残基の最初の原子。原子は `{name}`。`attribute` は書式 (`{bfac}` など) にできるものだけ。大きさと色は label renderer の property。ChimeraX の既定の位置 (残基の中心) とは異なり、ラベルは代表原子に付く (doc に書く) | `offset` `bgColor` `onTop` `font` は warn。`pseudobonds` `bonds` `models` は断る |
| `label delete spec [atoms\|residues]` (`~label`) | 原子ラベルと残基ラベルを別の renderer (`chx:label:atoms` / `chx:label:residues`) に付けて区別する。種類を省いたときは両方を消す (ChimeraX と同じ)。原子ラベルは spec の原子のまま、残基ラベルは付けたときと同じ規則で代表原子に解決して、`set_atom_labels` の `format: null` を渡す。1 つの renderer で両方の selection を合わせて消すと、指定していない原子 (CA の原子ラベルなど) まで消えるため | |
| `distance a b`、`decimalPlaces` (既定 3) | 2 つの spec がそれぞれ原子 1 つに解決するとき `measure_geometry` (`draw: true`)。`Distance between /A ALA 10 CA and ...: 3.123Å` と出す。`measure_geometry` は値を小数 2 桁に丸めて返すので、丸めない値を `data` に足し (`exactValue`。今の `value` は変えない)、ChX はそれを `decimalPlaces` で整形する。`decimalPlaces` は log の表示にだけ効く。3D の測定ラベルは CueMol の書式のまま (doc に書く) | 原子が 3 つ以上 (min/avg/max の報告) は断る。`color` `dashes` `radius` は warn |
| `distance delete` (`~distance`) | 引数無しは測定の renderer を `delete_node`。対を指定したときは `remove_interaction` | |
| `align atoms toAtoms atoms` | 原子を順に対にする最小二乗 = `superpose algo: LSQ`。両側がそれぞれ 1 object で原子数が同じことを先に確かめる。`RMSD between N atom pairs is x angstroms` | `move` は既定 (structures) だけ。`each` `matchChainIds` `cutoffDistance` は断る |
| `matchmaker spec to spec` (`mmaker`) | mover ごとに `superpose algo: USalign` | ChimeraX は配列アラインメント + 繰り返しの除外で、CueMol は US-align (構造アラインメント)。重ね方が異なりうることを、毎回 warn で言う。`pairing` `alg` `matrix` `cutoffDistance` `showAlignment` は warn |
| `save x.png` (`width` `height` `transparentBackground`) | `export_scene`。片方だけなら縦横比を保つ | `supersample` は warn (CueMol は常に supersample)。`pixelSize` `quality` は warn |
| `save x.qsc`、`save x.pdb` (`models #1`) | `save_scene` (行に単独、txn の外)、`save_object` (`link: false`) | `.cxs` (session) は断って `.qsc` を案内。PDB の `selectedOnly` `displayedOnly` `relModel` は断る |

## 6. PR 5: 色の拡張と open の auto style

- **`color spec bychain`**: chain ごとに `add_paint_at` の entry (`chain A` との積) を入れる。色は ChimeraX の表 (`atomic/colors.py`
  `chain_colors`、a–z と 0–9、大文字小文字を区別しない)。表に無い chain id は、決まった hash から作った色にし、ChimeraX と違うことを warn。
- **`bymodel`**: model の色 (#1 tan、sky blue、plum、light green、salmon、light gray、deep pink、gold、dodger blue、purple)。
  11 番目以降は warn して表を回す。
- **`random`**: 乱数の色。記録される op は実際の色を持つので、再生では同じ色になる。
- **`bypolymer` / `byidentity`** は断る (ChimeraX の seed 付き乱数の色を再現できない)。
- **`rainbow spec [level]`、`palette`** (既定 `blue:cyan:green:yellow:red`、`^` で逆、`c1:c2:...` と名前):
  - `chains` / `structures`: chain・model ごとに補間した色の entry を入れる。
  - `residues` (既定): chain ごとに、spec の残基を順に補間する。entry が増えすぎないよう、色を 64 段に量子化し、
    同じ色の連続した残基を `resi a:b` の 1 つの entry にまとめる (1 chain あたり最大 64 entry)。
  - `polymers` は断る (配列の同一性の情報が無い)。
- **`open` の auto style** (`structure.py` の `apply_auto_styling`、大きさの閾値もそれに合わせる):
  - small polymer (chain 5 未満、原子 20 万未満、chain 内残基 5000 未満):
    - まず全原子を stick、全体を tan + `byhetero` にする。
    - ribbon にできる残基が 10 以下 (短いペプチドなど) なら、ここで終わり (ChimeraX の `MIN_RIBBON_THRESHOLD`)。
    - 10 を超えるときだけ、次の ribbon と ligand の周りの表示に切り替える:
      - ribbon は ligand 以外の chain 残基。
      - 金属と単原子イオンは sphere。
      - ligand と金属から 3.6 Å 以内の残基は stick (`byres ((L) expand 3.6)`)。
      - 溶媒とそれ以外のイオンは表示しない。
  - non-polymer: 全原子 stick + `byhetero`。
  - medium / large polymer: 全原子 sphere。chain が 1 種類なら `bychain`。
  - 水素の扱いは、炭素に付いた水素を名前で近似して除く (CueMol は結合で選べない)。差は doc に書く。

## 7. 共通の変更

- `commands/registry.ts`: ChimeraX の登録順で足す (std_commands の順、続けて label・surface・matchmaker・distance・info・save・name)。
  よく打つ短縮形が ChimeraX と同じものに解決することをテストで固定する (`sel` `su` `tr` `tu` `sa` `la` `di` `mm`)。
- `eslint.config.mjs` の ChX の許可リストに、読み取りに使う service を足す (`select/getSelHitCount`、`select/getMolStructure`、
  `select/getSelDefs` を予定)。
- 新しい op は作らない予定。既存の op の変更は `measure_geometry` の `data.exactValue` だけ。実装中に足りない op が
  見つかったら、catalog に足してから使う。

## 8. テスト (PR ごとの最小集合)

- PR 3:
  - `select add` / `subtract` / `intersect` の組み合わせ。
  - `alias` の `$1` / `$*` の展開と、自分自身への展開を 1 段で止めること。
  - `;` を含む alias の定義が定義時には実行されず、呼び出すと 2 つのコマンドが順に実行されること。
    これを、同じ `.cxc` (または 1 つの submit) の中で定義してから呼び出す形で確かめる。
  - `save x.qsc` や `undo` を含む alias を呼ぶと、何も実行せずに断ること。
  - `name` が model を含む spec を断ること。
  - selector `sel` が、書き換える前の各 object の選択に解決すること。
- PR 4:
  - `transparency` の target と renderer の対応。
  - `surface` / `surface hidePatches` が `showsel` だけを変え、`sel` は変えないこと。
  - `surface /A; surface /B` で chain ごとの renderer になり、A の `sel` と `showsel` が保たれること。
  - `hide ... surfaces` と `color ... target s` が `chx:surface:*` に効くこと。
  - `label` が CA の無い残基 (ligand) でも代表原子に付き、`label delete` が同じ原子から外すこと。
  - `label delete /A:10@CB` (種類を省く) が、CB の原子ラベルと、残基 10 の残基ラベルの両方を消し、同じ残基の CA など
    他の原子ラベルは残すこと。`label delete /A:10@CB atoms` は CB の原子ラベルだけを消すこと (ChimeraX の `label3d.py` と同じ)。
  - `distance` が原子 1 つに解決しない spec を断ること。
  - `matchmaker` が mover ごとに `superpose` を呼ぶこと。
- PR 5:
  - `bychain` の entry。
  - `rainbow residues` の量子化と連続範囲のまとめ。
  - auto style の selection の式。入力に短いペプチド (ribbon にできる残基が 10 以下) を含め、全原子 stick になること。

既存の op の呼び出しをなぞるだけのテストは書かない。

## 9. 検証

1. `cd build_scripts && task build_tritium`。前のアプリが残っていないか確かめて (`pgrep -fl "tritium/node_modules/.pnpm/electron"`)
   から、`task run_tritium` で起動マーカーを確認する。
2. `task run_tritium_cli -- --dialect chimerax -c '...'` で PR の範囲のコマンドを流し、History pane の子行に op が並ぶこと、
   断るものが理由を言うことを確かめる。たとえば次のようなもの:
   - PR 3: `select /A:1-10; select add :CYS; name site /A:20-25; info chains`
   - PR 4: `surface; hide /A surfaces; show /A surfaces; color /A red target s; transparency 50; label :10; distance /A:10@CA /A:20@CA; save ~/Desktop/x.png width 400`
   - PR 5: `open 4hhb`、`color bychain`、`rainbow`
3. ユーザーの目視確認の後に、テストを書き、`npm test`、`tsc` (web / node)、eslint を流す。

## 10. ドキュメント

- この plan は `docs/plans/261103-chimerax-console-plan.md` (今回やらないものは §11)。
- 各 PR のマージ時に、済んだ仕様を `docs/architecture/console-chimerax-dialect.md` に書き起こし、plan から消す。
  - 書き起こす先: §3 (spec の翻訳表)、§6 (コマンド表)、制約。
  - 制約の例: `cofr` を断る理由、名前付き view が視点だけであること、透明度が renderer 単位であること、`matchmaker` が US-align であること。

## 11. 今回やらないもの (後で)

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

## 12. レビュー (`docs/reviews/261104-chimerax-console-plan-review.md`) への対応

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 | surface の部分表示には `dsurface` の `showsel` が使える | **有益** (元の案は chain 全体を出して ChimeraX と違う表示になり、`hidePatches` で `sel` を引くと表面まで作り直してしまう。`DirectSurfRendererBase.qif` の `showsel` を確認した) | 表面を作る `sel` と表示の `showsel` を分ける。部分表示と `hidePatches` は `showsel` だけを変える (§5) |
| 2 | 今の選択を指す selector `sel` が対応範囲に無い | **有益** (`select` で選んだものを次のコマンドで使えない。`selectors.ts` の `KNOWN_ONLY` で断っていることを確認した。追加の状態は要らない) | PR 3 で `sel` を各 object の今の選択に解決する。書き換えるコマンドでは前の値から読む (§4) |
| 3 | `turn` / `move` の frames を捨てると最終の姿勢が違う | **有益** (`turn y 3 30` が 3° になり、スクリプトが再現できない。`move.py` / `turn.py` が毎 frame 繰り返すことを確認した) | 有限の frames は角度・距離に掛けて一度に動かす。`forever` は断る。`zoom` は掛けない (§3) |
| 4 | CA / C4' に限ると ligand などに残基ラベルを付けられない | **有益** (`label ligand` が空の selection の失敗になる。ChimeraX の残基ラベルは CA を条件にしない) | 代表原子の fallback (残基の最初の原子) を足し、原子指定は残基に広げ、削除も同じ規則で解決する (§5) |
| 5 | `measure_geometry` が 2 桁に丸めるので `decimalPlaces` を実現できない | **有益** (3.123 Å が 3.120 と出る。`measureOps.ts` の丸めを確認した。直すのは返す値の追加だけ) | `data.exactValue` を足し、ChX はそれを整形する。`decimalPlaces` は log だけに効く (§5、§7) |

2 回目のレビュー (`docs/reviews/261104-chimerax-console-plan-review-2.md`):

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 | alias の定義が、行の分割で `;` の位置で切られる | **有益** (`alias x cartoon; color red` が定義時に `color red` を実行し、alias には `cartoon` しか残らない。複数の操作をまとめる alias の主な用途が使えない。`splitLines` が先に `;` で分けることを確認した) | 定義は `;` を含めた行の残り全部にし、呼び出し時の展開を `split` の段階で済ませて複数コマンドとして実行する (§4) |
| 2 | molecule ごとに 1 つの surface では、chain ごとの SES を再現できない | **有益** (接している chain の間の面が消え、`showsel` を分けても戻せない。ChimeraX が `atoms.by_chain` ごとに surface を作ることを確認した。後から管理の単位を変えると作り直しになる) | chain ごとの renderer (`chx:surface:<chain>`) にし、`enclose` は別の renderer にする (§5) |
| 3 | 既存の `show` / `hide` / `color` が surface に効かない | **有益** (`hide /A surfaces` で表面が残り、`color ... target s` で色が付かない。両方とも surface を warn して飛ばしていることを確認した) | PR 4 で、surface の renderer を解決する関数を 1 つ作り、`show` / `hide` / `color` を接続する。PR 5 の色もそれを使う (§5) |
| 4 | ribbon にできる残基が 10 以下の小さい polymer の分岐が無い | **有益** (短いペプチドの表示が決まらない。ChimeraX が先に全原子 stick にし、10 を超えるときだけ ribbon に切り替えることを確認した) | small polymer の判定と ribbon への切り替えの条件を分ける (§6) |

3 回目のレビュー (`docs/reviews/261104-chimerax-console-plan-review-3.md`):

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 | alias を `split` の段階で展開すると、同じスクリプトの中で定義した alias を使えない | **有益** (`alias x ...` の次の行の `x` が未定義になり、定義し直しも効かない。runtime が submit / `.cxc` の全文を先に `split` することを確認した) | 展開を、そのコマンドを実行する直前に移す。alias の呼び出しを 1 つのコマンドとして bind し、その `run` が展開と実行を行う (§4) |
| 2 | 原子ラベルを、残基の代表原子に解決する削除では消せない | **有益** (`label /A:10@CB atoms` の後の `label delete /A:10@CB` で CB のラベルが残る。`setAtomLabels` が渡した原子だけから外すことを確認した) | 原子ラベルと残基ラベルを別の renderer に付け、種類を省いた削除は両方から消す (§5) |
| 3 | `view matrix` の FOV の式は透視投影が前提で、CueMol の既定の平行投影では見かけが違う | **有益** (行列の往復のテストでは検知できない。`Camera.qif` の既定が平行投影であること、透視投影の視野が zoom と distance から決まることを確認した。既存の `set_projection` で直せる) | `set_projection perspective=true` も呼ぶ。テストと目視の確認に投影方式を足す (§3) |

4 回目のレビュー (`docs/reviews/261104-chimerax-console-plan-review-4.md`):

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 | alias の子コマンドを直接実行すると、txn の外で走るべきコマンドの検査が抜ける | **有益** (`alias s save x.qsc` で scene の保存が txn の中で走り、undo の履歴を消して txn と食い違う。runtime の検査と `saveScene` の `clearUndoData` を確認した) | 子コマンドの `outsideTxn` / `undoStack` を実行前に検査し、alias の中では理由付きで断る (§4)。テストを 1 件足す |
| 2 | `label delete` のテストの期待値が、本文の削除の仕様と逆 | **有益** (そのままテストを書くと、正しい実装が落ちる) | テストを「種類を省くと原子ラベルと残基ラベルの両方を消し、他の原子ラベルは残す」「`atoms` なら原子ラベルだけ」に直す (§8) |
