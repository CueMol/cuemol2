# Console の PyMOL dialect

console plugin の PyMOL dialect (prompt `PyM>`) の仕様。PyMOL のコマンド言語に**部分互換**の
コマンドを、PyMOL の名前・引数・選択式で受け付ける。完全互換は目標にしない。
runtime (1 submit = 1 txn、Stop、script、log)、引数パーサ、補完、help は native dialect と共有で、
それは [op-catalog.md](op-catalog.md) §5 と [console-completion.md](console-completion.md)、
[console-help-markdown.md](console-help-markdown.md) に書いてある。ここには PyMOL dialect にしか
ない部分を書く。PyMOL 200 コマンドとの対応表は
[調査報告 §4](../plans/pymconsole-research-260529.md)、まだ無いコマンドの候補は
[残りの候補](../plans/260928-pymconsole-remaining-plan.md)。

## 1. 位置づけ

- パーサとコマンドは **TS で Web Worker に置く**。embedded Python は使わない (C++ に PyMOL 用の
  入口は無く、cuetty / pymod とは共有しない)。Python を要するものは理由付きで断る:
  `/` で始まる行 (`refuseLine`)、`@x.py` / `@x.pym` (`refuseScript`)、`run x.py`、`log_open x.py`。
- 各コマンドは既存の worker service を呼ぶ薄い adapter で、計算は service か C++ に置く。
  PyMOL 固有の解釈 (引数の文法、PyMOL の名前と文言、selection 翻訳) は `dialects/pymol/` の中に閉じ、
  runtime と native dialect はここを import しない。
- PyMOL と**意味が一致するものだけ**を移す。近いもので代用して違う結果を出すより、理由を言って断る。
- native dialect の生成コマンド (op) は使わない。例外は `ray` / `png ray=1` が呼ぶ `render_image` op。

### `ConsoleDialect` の PyMOL 固有の値 (`dialects/pymol/index.ts`)

| 項目 | 値 |
|---|---|
| `txnPrefix` | `pym: ` (undo の label は `pym: <入力行>`) |
| `argRule` | `'pymol'`: 位置引数は名前付きも数えた全体の番号に入る、重複は後勝ち、コマンドごとの `mode: 'legacy'` (`select foo=chain A` を名前と式に読む) |
| `fileFallback` | `true`: 補完候補が無い位置ではファイル名を出す |
| `refuseLine` / `refuseScript` | Python の行と `.py` / `.pym` を断る |
| 履歴 | dialect ごと。PyMOL は旧 pymconsole の key (`cuemol.pymconsole.history`) を引き継ぐ |

### 構成

`dialects/pymol/` の下に `index.ts` (`PYMOL_DIALECT`)、`sources.ts` (補完の候補源)、`sel/` (selection 翻訳、§2)、
`commands/` (`registry.ts` の `PYM_COMMANDS` と `help`、共通の `helpers.ts` (名前 -> uid、glob (照合は native と共通の `catalog/refs.ts` の `globToRegExp`)、
`moleculeSelections`、`OWNED = 'pym:'`)・`namedSelections.ts`・`pymolColors.ts`、領域ごとの `*Commands.ts` (§3))。

PyMOL の引数は spec にそのまま書き写し (PyMOL に無い引数は足さない)、CueMol で効かない引数
(`state` / `animate` / `discrete` / `quiet` など) も受け取る。既定以外の値を渡されたときだけ
`<cmd>: <arg> is ignored` と warn する。これで PyMOL のスクリプトが引数の数や位置で失敗しない。

## 2. selection の翻訳 (`sel/`)

`tokenize.ts` (空白区切り、括弧は単独の語) -> `parse.ts` (再帰下降) -> `emit.ts` (**全項を括弧で包んだ**
CueMol 式)。`-` / `+` の意味は語の切れ方で決まる: 単独の語なら演算子 (差 / 和)、語の中なら範囲と列挙
(`resi 1-10` -> `resi 1:10`、`name CA+CB` -> `name CA,CB`、`resi -5--1` は負の残基番号の範囲)。

演算子の優先順位は PyMOL `layer3/Selector.cpp` のまま: selector > `not` > `and` / `-` > `or` / `+` >
`around` / `expand` > `byres`。CueMol の `parser_sel.yxx` も同じ順序だが、括弧で包むので両者の結合規則の
差には依存しない。

**対応する語**:

| 種類 | 語 | CueMol 側 |
|---|---|---|
| 値を取る | `name` `elem` `resn` `resi` `chain` `alt` `id` `ss` (と略記 `n.` `e.` `r.` `i.` `c.` など) | `id` -> `aid`、`ss H/S/L` -> `helix` / `sheet` / `coil` |
| 比較 | `b` / `q` と `<` `>` `=` `==` | `bfac` / `occ`。`<=` `>=` `!=` は断る |
| マクロ | `all` `*` `none` `protein` `nucleic` `polymer(.protein/.nucleic)` `water` `solvent` `hydro(gens)` `hetatm` `organic` `backbone` `sidechain` `guide` | 既存の global alias (`protein` `water` `ligand` `hydrogen` ...) か、その場で式に展開 (`polymer`、`backbone` など)。`hetatm` / `organic` は `ligand` |
| 演算子 | `and` `&` `or` `\|` `+` `not` `!` `-` `byres` `br.` `around` `a.` `expand` `x.` | そのまま |
| 2 集合 | `s1 within D of s2` / `near_to` / `beyond` | `(s1) and ((s2) expand D)` / `(s1) and ((s2) around D)` / `(s1) and not ((s2) expand D)` |
| 名前 | object 名、named selection 名、`%name` | 下記 |

マクロは翻訳時の展開で、StyleManager に alias を登録しない (worker の状態が scene と `.qsc` に入り、
ユーザー定義名に shadow されるため)。

**名前の扱い** (`helpers.ts` の `moleculeSelections`): PyMOL は scene 全体で評価し object 名も項になるが、
CueMol は分子ごとに評価し裸の語を named selection と読む。そこで分子ごとに翻訳し直し、object 名は
その分子で `all`、他の分子で `none` にする。式が object を名指ししていればその分子だけが対象。
object でない名前は named selection の参照のまま渡す。

**断る語** (caret 行で位置を示すエラー。黙って違う原子を選ぶより断る):

- 演算子: `in` `like` `neighbor` / `nbr.` `extend` (CueMol の parser は通すが実装が無く何も選ばない)
  `first` `last` `bound_to` `byobject` `bysegi` `bychain` `bycalpha` `bymolecule` `gap`
- 性質: `segi` / `s.` `index` (`id` を使う) `model` / `m.` (object 名を直接書く) `x` `y` `z` `flag` / `f`
  `rep` `color` `rank` `partial_charge` `formal_charge`
- マクロ: `inorganic` `metals` `donors` `acceptors` `visible` `enabled` `bonded` `masked` `protected`
  `center` `origin`
- slash 記法 (`/1abc//A/10/CA`)、左辺の無い `within`、距離の無い `around`、`of` の無い `within`

補完の selection キーワードは翻訳器の表から導出する (`selectionKeywords()`)。断る語は候補に出ない。

## 3. コマンド

### 複数分子の規則

1 分子しか扱えないコマンド (`save` / `align` 系 / 計測 / `zoom` / `center` / `orient` / map の carve) は
`resolveMolSelection` で対象を決める: 式が名指しした分子。2 つ名指ししたら断る。名指しが無く分子が
複数なら最初の分子を使い `using "<名前>" only` と warn する (`all` は分子が 1 つのときだけ)。

### ファイル (`fileCommands.ts` / `saveCommands.ts`)

- `load filename [, object, state, format, ...]`: 位置引数の順は PyMOL の `importing.py` と同じ
  (`quiet` が 7 番目、`zoom` が 9 番目)。`format` は CueMol の reader 名か PyMOL の形式名
  (`cif` `ent` `ccp4` `map` `mrc` `xplor` `mol` `top`) で、拡張子と content sniff を飛ばす。受け付ける値は
  登録済み reader を実行時に読む。structure-factor CIF は PyMOL に名前が無いので `format=mmcifmap`。
  `.qsc` / `.pse` は scene として開き (`psefile` reader、txn の外)、`.pml` はスクリプトとして実行、
  URL (`http(s)://`) は拡張子で reader を選んでダウンロードする。object 名は `1crn.pdb.gz` -> `1crn`。
- load / fetch が作る renderer: 分子は PyMOL 風 preset `DefaultPymRendPreset` (現行 PyMOL の
  `auto_show_classified` に合わせた分類表示。中身は op-catalog.md の「renderer 未指定の load」)、それ以外は
  互換 renderer の先頭 (map なら `contour`)。preset の子の prefix を `pym:` にし、読込後に
  `adoptPresetRenderers` が rep 名へ rename する (`pym:ribbon` -> `pym:cartoon`、`pym:ballstick` -> `pym:sticks`、
  `pym:cpk` -> `pym:spheres`、`pym:simple` -> `pym:lines`。`pym:nucl` はそのまま、group 名は `pym:`)。直後の
  `hide sticks` / `as` / `color` や `stick_radius` などがそのまま効く。`pym:nucl` は `cartoon` の相方で
  (PyMOL の cartoon は核酸も描く)、`show` / `hide` / `as cartoon` は `pym:nucl` にも同じ合成をかける
  (`repCommands.ts` の `COMPANIONS`。command が `pym:nucl` を新規に作ることはない)。show / as で足す範囲は
  `pym:nucl` が `nucleic`、`pym:cartoon` が `not (nucleic)` に限る (限らないと `show cartoon` で nucl が
  タンパク質を、ribbon が核酸を描き、互いに重なる)。
  `zoom=0` なら中心を動かさない。
- `fetch code [, name, ..., type, async, ...]`: RCSB から。`type` は `cif` (既定) / `pdb` / `pdb1..`
  (生物学的集合体) / `2fofc` / `fofc` (Get PDB と同じ `streamLoadDensityMap`。構造因子の無い entry の 404 は
  理由付き)。複数 code 可。`1abcA` / `1abc_A` は読込後に他の chain を消し、object 名は `1abcA`、chain が
  無ければ `no such chain` (PyMOL と同じ)。ダウンロードは Stop で中断できる。
  `EMD-3489` / `emd_3489` は `type` に関係なく EMDB の cryo-EM map (PyMOL と同じ)。object 名は入力したコードの
  まま、数字だけは `type=emd` のときに限り `emd_3489`。取得元は wwPDB、level は EMDB の推奨値
  ([get-pdb-emdb](get-pdb-emdb.md))。EMDB に無いコードは `EMDB has no entry EMD-<n>`。
- `save filename [, selection, state, format, ...]`: `.pdb` / `.sdf` / `.mol` / `.pqr` は 1 分子
  (selection は writer の `sel`)。`convToLink` を立てないので object の参照先は変わらない。一致 0 原子は
  書かずに断る。`.qsc` は scene 保存で txn の外 (undo 履歴を消し scene 名を変えるため)。`.png` / `.pov` /
  `.stl` は view を書き出す。`.cif` (mmCIF writer が無い) と `.pse` (PyMOL 固有形式) は理由付きで断る。
- `delete` / `set_name`: object -> renderer (isomesh や計測) -> named selection の順に名前を探す。
  `delete` は glob と `all` を取り、`delete all` は named selection も消し、空の scene でも成功する。
- `cd` / `pwd` / `ls`、`run file.pml` (= `@file.pml`)。

### object と表示 (`objectCommands.ts` / `repCommands.ts`)

- `enable` / `disable name`: object の `visible`。object が無ければ renderer、それも無ければ named
  selection (その原子を各分子の選択にする / 外す)。
- `get_names [type, enabled_only, selection]`: `objects` 系 / `selections` 系 / `all`。`enabled_only=1` は
  scene tree で非表示の object を除く (named selection は表示状態を持たないので絞らない)。
- **代表 renderer 規約**: object x 表現ごとに `pym:<rep>` の renderer 1 つ。表現は `lines` (`simple`)
  `sticks` (`ballstick` + Stick style、PyMOL の stick に合わせ ball なし) `spheres` (`cpk`) `cartoon`
  (`ribbon`。PyMOL の cartoon の helix / sheet 形状は CueMol の ribbon にあたる) `ribbon` (`tracestick`。
  PyMOL の ribbon は CA を直線でつなぐ trace) `surface` (`dsurface`) `nonbonded` `nb_spheres` と `labels`。`pym:` の付かない renderer
  (GUI で作ったもの) には触れない。
  - `show rep, sel`: 既存の sel との和 (`(old) or (new)`)。無ければ作る
  - `hide rep, sel`: 差 (`(old) and not (new)`)。`hide rep` (selection 無し / `all`) は sel を `none` に
    空けて非表示 (後の `show rep, sel` で隠した原子が戻らない)
  - `as rep, sel` / `show_as`: sel を置き換え、その object の他の `pym:` renderer を隠す
  - 引数無しは PyMOL の `_showhide` と同じ: `hide` = everything、`show` = `wire`。第 1 引数が `all` か
    `(` / `/` を含めば selection と読む。表現名は一意な前方一致 (`stick` `cart`)・空白区切りの複数指定・
    `everything` / `wire` / `licorice` を受け付ける
  - `mesh` `dots` `volume` `slice` `cell` `ellipsoids` は理由付きで断る (map は `isomesh` を使う)
- `color color, selection`: 色は PyMOL の色名表 (`layer1/Color.cpp` 由来。PyMOL が再定義した CSS 名も
  PyMOL の値を優先、`greyNN` は計算、表に無い名前は `ColCompiler` に渡す)。対象の分子の `pym:` renderer に
  paint を足す (paint coloring でなければ切り替える)。paint service は分子の選択を読むので一時的に書き換え、
  終われば元に戻す。`pym:` renderer が無ければ `show a representation first`。

### selection (`selectCommands.ts`)

- `select name, expr` (`select expr` は `sele`): 式を named selection (`saveSelDef`、scene の書き込み
  可能な style set) に保存し、各分子の選択にも当てる。CueMol の named selection は**式の別名**で、使う
  たびに分子ごとに評価し直す (固定の原子集合ではない)。`help` の冒頭でもそう言う。object 名を含む式は
  分子を指せないので、表示だけして保存しない (warn)。`enable` / `merge` / `state` は無視。
- `indicate` (名前を付けずに選択)、`deselect`、`count_atoms` (分子ごとに数える)、`get_chains`。

### 計測 (`measureCommands.ts`)

- `distance` / `angle` / `dihedral name, sel1, sel2[, ...]`: **各 selection を重心 1 点**として label を
  1 本 (C++ `AtomIntrElem::AI_SEL`、`AtomIntrRenderer` の `appendAngle` / `appendTorsion` / `getValue`)。
  PyMOL の全組み合わせ (特に `dihedral` は絞りが無く組数が爆発する) は移さない。値は C++ の `getValue` を
  小数 2 桁で表示する。label はマウスの計測と同じ label set (`helpers/atomintr`) に入る。centroid の計測は
  1 分子の中だけ (分子をまたぐと断る)。
- `distance` の `cutoff` / `mode`: `mode` 無し・`4` で cutoff 無しは重心。cutoff だけ、`mode=0` / `3`
  (既定 4.0 A)、`mode=2` (極性、既定 3.6 A) は `analyzeInteractions` で原子の組ごとの label
  (最大 100、分子をまたいでも可)。`mode=1` / `5`-`8` は断る。`angle` / `dihedral` の `mode` は warn して無視。

### map (`mapCommands.ts`)

- `isomesh` -> `contour`、`isosurface` -> `isosurf`。PyMOL では別 object だが、ここでは map object 上の
  名前付き renderer で、level は `siglevel` (結晶学 map は sigma、cryo-EM map は上位 % 。
  [cryo-em-map-mode.md](cryo-em-map-mode.md))。同名の renderer があれば作り直さず level を変える。
- `selection` / `carve` / `buffer` は `MapRenderer` の mol boundary (`bndry_molname` / `bndry_sel` /
  `bndry_rng`) に写す。range が 1 つで 2 役なので `carve` 優先、無ければ `buffer` (独立には指定できない)。
  selection が無ければ view の中心まわりの箱。
- `isolevel name, level`: 同名の map renderer の level を変える (level 無しは読む)。

### 色 (`colorCommands.ts`)

- `set_color name, [r, g, b]`: scene local の style set `pym` (無ければ作る) に色を定義する。0..1 か
  0..255 (どれかが 1 を超えたら)、`#rrggbb` / `0xrrggbb`。以後 `color name, sel` で使える。
- `spectrum expr [, palette, selection, minimum, maximum]`: renderer 全体の coloring を置き換える。
  `b` / `q` は 2 色の palette (`blue_red` や `blue red`) で `BfacColoring` (`minimum` / `maximum` で範囲を固定)、`count` / `resi` は
  `rainbow` / `rainbow_rev` で `RainbowColoring` (残基番号単位)。3 色以上の palette や `pc` は断る。
  selection は object 名か `all` だけ (部分着色はできないので式は断る)。`color` (paint) とは上書きし合う。
- `bg_color color`。

### 重ね合わせ (`fitCommands.ts`)

- `align` / `super mobile, target`: どちらも US-align (`superposeMol`。配列アライメントは無い)。調整の引数は
  受け取って warn、`transform=0` は動かさず RMSD だけ。RMSD・整列残基数・TM-score は `superposeUSalignJSON`。
- `pair_fit mobile, target`: LSQ。原子数が違えば数を示して断る。RMSD は `calcRMSD`。
- `cealign` は無い (CE アルゴリズムが無い)。

### view (`viewCommands.ts`)

camera の操作は undo しない ([ADR-0025](../migration/adr/ADR-0025-view-panel.md))。`view` の store / clear だけは camera を作る / 消すので scene の編集。

- `zoom` / `center [selection]`: object 名ならその object、それ以外は selection として分子の中で
  (`fitView2` / 原子の重心)。分子の選択は書き換えない。全体 (`all`) は「全 object を包む fit」が無いので
  最初の object にして warn。`center` は中心だけ動かす。
- `orient [selection]`: C++ `MolCoord::orientView` (主軸を画面軸に合わせて fit)。
- `reset` (回転を戻して fit)、`turn` / `move axis, value`、`refresh`。
- `view key [, action]`: store / recall / clear (前方一致の略記可) を名前付き camera で。
- `get_view` / `set_view`: PyMOL の 18 要素と CueMol の quaternion + center + distance + slab + zoom の
  相互変換 (`viewMatrix.ts`、純関数)。PyMOL の origin の画面軸からのずれは center に畳む (見た目は同じで、
  回転の中心が変わる)。front / back clip は中心対称の slab に広げる。perspective は
  `zoom = 2 d tan(fov / 2)`。

### label (`labelCommands.ts` / `labelExpr.ts`)

- `label selection, expression`: 分子ごとの `pym:labels` (`*namelabel`) に付ける。PyMOL の式は C++ の
  label 書式 (`molstr/LabelFormat`、`{resn}{resi}` / `{bfac:.2f}`) に書き換えるだけで、値は C++ が評価する。
  分かる形は属性名、引用文字列、`+`、`str(x)`、`%` 書式 (`"%s-%s" % (resn, resi)`)。`{...}` を含む文字列は
  CueMol の書式としてそのまま渡す。それ以外は理由付きで断る。空の式は label を外す。1 回 2000 原子まで。
- label は `setAtomLabels` service (`services/navi/atomLabels.ts`) を通し、分子ごとに 1 つの
  `set_atom_labels` として記録する。label の追加・削除・書式の変更は C++ が undo に載せる
  (renderer の作成も)。label の書式は `.qsc` に保存される。
- `show labels` / `hide labels` は label renderer の表示を切り替え、`hide labels, sel` はその原子の label を外す。

### 設定 (`settingCommands.ts` / `repSettings.ts`)

- `set name, value [, selection]` / `get` / `unset`: 対象は scene (既定)、object、renderer 名 (`pym:sticks`、
  isomesh)、`view`。property の C++ 型を `getGenericProps` で引いてから値を読む (真偽値、整数、実数、enum、
  色は PyMOL の色名と `[r, g, b]`)。`unset` は既定値のある property だけ。表に無い名前は CueMol の property 名
  として試す。PyMOL の設定名の別名は意味が一致するものだけ:

  | PyMOL | CueMol |
  |---|---|
  | `bg_rgb` | scene `bgcolor` |
  | `orthoscopic` | view `perspective` (反転) |
  | `stick_radius` | `pym:sticks` の `bondw` と `sphr` |
  | `stick_transparency` / `sphere_transparency` / `cartoon_transparency` / `transparency` | `pym:sticks` / `pym:spheres` / `pym:cartoon` / `pym:surface` の `alpha` (= 1 - transparency) |
  | `line_width` | `pym:lines` の `width` |
  | `solvent_radius` | `pym:surface` の `proberad` |
  | `label_size` / `label_color` | `pym:labels` の `font_size` (正の値だけ) / `color` |

- 表現ごとの設定 (表の下 7 行) は object を指定すればその object の `pym:<rep>` に、指定しなければ全ての
  `pym:<rep>` に書き、さらに scene ごとに覚えて後から作る `pym:<rep>` にも当てる (PyMOL のスクリプトは
  設定を先に書くため)。覚えた値は session の間だけで、ファイルに残るのは renderer の property。
  `sphere_scale` (CPK に全体の scale が無い) と `ray_trace_mode` (同義の property が無い) は対象外。

### movie (`movieCommands.ts`)

- `mplay` / `mstop` / `rewind`: scene の animation timeline (AnimMgr)。`mstop` は pause (位置を保つ)。
  MD trajectory の再生ループは Trajectory tab (renderer 側) にあるので `mplay` では動かせず、そう返す。
- `frame n` / `count_states`: MorphMol と trajectory の `frame` / `nframe` を直接読み書きする
  (mdtools plugin を import しない)。PyMOL の state は 1 から、CueMol の frame は 0 から。範囲外は丸めて warn。

### 画像、script、その他 (`miscCommands.ts` / `rayCommands.ts`)

- `png filename [, width, height, dpi, ray]`: 幅か高さの片方だけなら view の縦横比を保つ。`in` / `cm` は
  dpi が要る。`ray=1` はその場で ray tracing (`render_image` op の job。Stop で中断)。
- `ray [width, height]`: GI の ray tracing して一時ファイルに置き、undo 位置と camera を署名として覚える。直後の
  `png` (サイズ指定なし) は署名が同じならその画像を書き、変わっていれば普通の view を書く。
- `@file.pml` / `run file.pml`: 同じ submission (= 1 undo txn) の中で実行、ネストは 8 段まで (runtime)。
- `log_open [file, mode]` / `log_close` / `log text`: 打った**入力行**を `.pml` に記録する (log 系の
  コマンド自身と `_ ` 付きの行、script 内の行は記録しない)。
- `undo` / `redo` (runtime が txn の外で実行)、`quit` / `exit` (両 dialect 共通、op-catalog.md §5)、
  `help [command]` (コマンド表と、named selection が式の別名である注意)。

## 4. 制約と範囲外

- 複数分子にまたがる selection は先頭の分子だけ (上記「複数分子の規則」)。全体を収める fit は C++ に無い。
- `state` / `animate` など CueMol に対応の無い引数は受け取って warn するだけ。
- PyMOL の `volume` / `isodot`、`cealign` / `usalign`、picking・編集モードに依存するコマンド、MD trajectory の
  `mplay`、`spectrum` の部分着色、暗黙コンテキスト (直前の selection 名の省略) は無い。
- Python (`/` で始まる行、`.py` / `.pym`) は動かない。
- 候補と見込みは [残りの候補](../plans/260928-pymconsole-remaining-plan.md)。

## 5. テスト

- `parser/parse.test.ts`、`runtime/runCommand.test.ts` (両 dialect 共用のパーサと runtime)
- `dialects/pymol/sel/translate.test.ts`: `-` / `+` の 2 つの意味、優先順位、マクロ、2 集合演算子、断る語
- `dialects/pymol/commands/`: `repCommands.test.ts` (和 / 差、GUI の renderer に触れない、式の中の object 名)、
  `repSettings.test.ts`、`fileCommands.test.ts` (format、load の renderer、delete の探索順)、
  `saveCommands.test.ts` (部分保存と `convToLink`)、`measureCommands.test.ts`、`mapCommands.test.ts` (carve)、
  `colorCommands.test.ts`、`labelExpr.test.ts`、`viewMatrix.test.ts` (往復)、`pymolArgs.test.ts`
  (PyMOL の位置引数の順)、`pymolModes.test.ts` (fetch type と EMDB コード、distance mode、object 名)
- C++: `src/tests/modules/molstr/test_namelabel.cpp` (label 書式)、`test_selscope_fitview.cpp` (`orientView`)
