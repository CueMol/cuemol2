# ChX console: 既存の機能で作れる ChimeraX のコマンドを足す (提案 B)

[261107-chx-tutorial-survey-plan.md](261107-chx-tutorial-survey-plan.md) の調査で「知らないコマンド」だった 250 行の
うち、CueMol に既にある op と property だけで作れて、ChimeraX と意味が一致するものを足す。CueMol 側
(C++、op catalog) には手を入れない。

方針は今の ChX と同じ: ChimeraX と意味が一致するものだけを移し、近似で違う結果になるものは理由を言って断る。
書き込みはすべて op (`runOp`)。ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

対象の行数 (tutorial の再生で): `volume` 約 36、`lighting` 19、`preset` 約 12、`camera` 1、`ribbon` 1、`unitcell` 1、
`open ... from rcsb_bio` 1。合わせて約 70 行 (知らないコマンドの約 3 割)。

---

## B1. `volume` の表示の設定 (約 36 行)

ChimeraX (`map/volumecommand.py`): `volume [spec] [level v] [style mesh|surface|image] [color c] [transparency t]
[step n] [region all|i1,j1,k1,i2,j2,k2] [show] [hide] ...`。spec は地図の model。`vol` は前方一致で `volume` になる
(registry の順で、`vol` で始まる他のコマンドより前に置く)。

- 対象: spec の model のうち地図の object (`DensityMap`)。その object の地図の renderer (`contour` / `isosurf`) の
  全部に書く。ChX の `chx:` renderer は molecule にしか作らないので、地図は File > Open で付いた renderer を
  そのまま使う。spec を省くと scene の全地図 (ChimeraX と同じ)。
- `level v`: ChimeraX の level は地図の値そのもの (絶対値)。CueMol の地図の renderer の `level` (絶対値) に
  書く (`set_node_prop`。`siglevel` は sigma なので使わない)。**実装の最初に、`level` が絶対値で、書けば
  `siglevel` が追従することを確かめる**。`level` の複数指定 (ChimeraX は等値面を複数持てる) は断る
  (CueMol の renderer は 1 つの level)。`surfaceLevels` `meshLevels` `imageLevels` も同様。
- `style mesh|surface`: `contour` (mesh) と `isosurf` (surface) を切り替える。**実装の最初に、
  `set_renderer_type` で `contour` <-> `isosurf` を変えられるかを確かめる**。変えられなければ、もう一方の種類の
  renderer を作り (`create_renderer`)、元の renderer を隠す (`set_visible`)。`image` (volume rendering) は断る
  (`gpu_mapvol` は ChimeraX の image と見た目も設定も違う)。
- `color c`: renderer の `color` (`set_map_contour` の `color`)。ChimeraX の色が alpha を持てば warn して捨てる
  (`transparency` で指定する)。
- `transparency t` (0-1): `alpha = 1 - t` (`set_map_contour` の `alpha`)。
- `step n`: CueMol の `lod` (`step1` `step2` `step4` `step8`) に写す。1・2・4・8 以外は断る
  (近い段に丸めない)。ChimeraX の `step` は方向ごとに 3 つ (`1,2,2`) も取れるが、3 つが同じときだけ受ける。
- `region all`: `region_mode = full`。格子の範囲 (`0,0,145,279,279,164`) は断る (CueMol は中心 +- extent の箱か
  全体だけ)。
- `show` / `hide` (値を取らない keyword): 地図の renderer の `set_visible`。
- `showOutlineBox true`: CueMol に地図の外枠の表示が無ければ断る (実装時に確かめる)。`subdivide`
  `subdivisionLevels` `smoothLines` `squareMesh` など見た目の細部は warn して無視。
- `volume zone <map spec> nearAtoms <spec> range r [newMap false]` と `volume unzone`: CueMol の地図の renderer の
  境界 (`bndry_molname`、`bndry_sel`、`bndry_rng`) に写す。境界は 1 つの molecule の selection なので、
  `nearAtoms` が 2 つ以上の molecule にまたがれば断る。`newMap true` は断る (地図を切り出す機能は無い)。
  `unzone` は `bndry_sel` を空にする。
- 地図の演算 (`gaussian` `subtract` `add` `scale` `box` `cover` `morph` `resample` など) と `enclose`
  (囲む体積から level を決める) は、`volume <演算>` の sub-command として登録し、理由を言って断る
  (知らないコマンドのままにしない)。

## B2. `lighting` (19 行)

ChimeraX (`std_commands/lighting.py`): `lighting [default|simple|full|soft|gentle|flat] [shadows t|f]
[multiShadow n] [depthCue t|f] [intensity ...] ...`。

CueMol の scene が持つのは画面空間の ambient occlusion (`aoEnabled` ほか) と、renderer ごとの輪郭線だけ。
光源の向き・強さ・影は持たない。preset は次のように写す:

| ChimeraX | 中身 | ChX |
|---|---|---|
| `default` / `simple` | 影なし、multishadow 0 | AO を切る |
| `soft` / `gentle` | 影なし、multishadow 64 (AO 相当) | AO を入れる |
| `full` | 影あり + multishadow | AO を入れ、影は無いと warn |
| `flat` | 陰影なし + 輪郭線 | AO を切り、輪郭線を入れる (`graphics silhouettes true` と同じ処理)。陰影を消せないと warn |

- `multiShadow n`: `n > 0` で AO を入れ、`0` で切る。`shadows true` は warn (影は無い)。
- `depthCue`、`intensity` `direction` `color` `fillIntensity` などの光源の設定は warn して無視。光源の向きや強さは
  [261103-chimerax-console-plan.md](261103-chimerax-console-plan.md) の CueMol 側の機能追加の範囲。
- 引数無しは、AO の on / off を `Intensity ...` ではなく CueMol の言葉で 1 行出す。
- 書き込みは scene の property (`set_node_prop`、nodeType `scene`、`aoEnabled`)。

## B3. `preset` (約 12 行)

ChimeraX の `preset` (`preset_mgr`) は、ChimeraX のコマンドの列を実行するだけの仕組み。ChX も同じく、
既にある ChX のコマンドを列で実行して作る (alias と同じく同じ txn の中で順に解決・実行する。
`aliasCommands.ts` の実行の仕組みを使う)。名前の照合 (`preset [category] name`、前方一致・大文字小文字) は
`preset_mgr/src/cmd.py` に合わせる (実装時に読む)。

| category | preset | 中身 (ChimeraX) | ChX |
|---|---|---|---|
| Initial Styles | Original Look | 開いたときの auto style | `autoStyle.ts` を当て直す |
| | Sticks、Cartoon、Space-Filling (chain colors / single color) | `atomic` bundle の preset | 中身を読んで、ChX のコマンドの列に移す |
| Cartoons/Nucleotides | ribbons/slabs、cylinders/stubs、licorice/ovals | `cartoon style ...` と `nucleotides ...` | 断る (`nucleotides` と `modeHelix tube` が無い。一部だけ実行すると違う見た目になる) |
| Molecular Surfaces | ghostly white、chain ID coloring (opaque) | `surface`、`color ... targ s trans ...` | ChX のコマンドで実行 |
| | atomic coloring (transparent) | `color fromatoms` | 断る (`fromatoms` が無い) |
| Overall Look | publication 1 (silhouettes)、publication 2 (depth-cued)、interactive | `set bg`、`graphics silhouettes`、`lighting depthCue` | 実行。`depthCue` は B2 と同じく warn |

- 利用者定義の preset (`preset my_custom_style`) は「無い」と断る (ChimeraX の preset のフォルダは読まない)。
- 中身の各コマンドは ChX の実装を通るので、ChX が断るもの (`style ... @@draw_mode=0`) があれば、その preset
  ごと断る。**実装の最初に、移す preset の中身を全部 ChX に流して、どれが通るかを確かめる**。通らないものは
  上の表を「断る」に直す。

## B4. 小さな別名と単発のコマンド (3 行)

- `ribbon`: ChimeraX は `cartoon $*` の alias (`std_commands/ribbon.py`)。ChX も同じく、行の残りを付けて
  `cartoon ...` として実行する (`ribbon hide /A` は `cartoon hide /A`)。
- `camera ortho` / `camera mono`: `set_projection` (`perspective: false` / `true`)。ChimeraX の `camera` の他の
  mode (`360`、`360tb`、`stereo`、`sbs`、`dome` など) と `fieldOfView` は断る。引数無しは今の投影を出す。
- `unitcell [spec]`: 結晶の情報を持つ object に `show_unit_cell`。`cells`・`offset`・`origin` などは warn して
  無視 (CueMol の単位胞は 1 つ)。`~unitcell` / `unitcell delete` は、`show_unit_cell` が作る renderer を
  `delete_node` で消す (実装時に、その renderer の型と名前を確かめる)。

## B5. `open ... from rcsb_bio / pdbe_bio [maxAssemblies n]` (1 行)

ChimeraX (`pdb_bio/fetch_pdb_bio.py`): 生物学的会合体のファイルを 1 番から順に、無くなるまで (`maxAssemblies` が
あればその数まで) 開き、それぞれ別の model にする。

- URL: `rcsb_bio` は `https://files.rcsb.org/download/<id>-assembly<n>.cif`、`pdbe_bio` は
  `https://www.ebi.ac.uk/pdbe/static/entry/download/<id>-assembly-<n>.cif.gz`。取得元の表 (`dbSources.ts`) に足し、
  `fetch_url` で開く (PyM console の `fetch` の assembly と同じ経路)。
- 1 番が取れなければ error、2 番以降で取れなくなったらそこで終わる (ChimeraX と同じ)。`maxAssemblies` は
  `open` の keyword に足す (他の取得元では warn)。
- `from pdb_nmr` (NMR-STAR の拘束) は、読む reader が無いので断る。

## 対象外 (別途検討。survey に残す)

近似で ChimeraX と違う結果になるか、CueMol の側の機能が要るもの。どれも「既存の機能で一部は作れる」が、
この plan の方針 (意味が一致するものだけ) に合わないので、扱いを決めてから別に行う。

- `hbonds` (12 行): CueMol の `analyze_interactions` は、極性原子の間の距離だけで接触を拾う (角度の判定が無い)。
  ChimeraX の `hbonds` は ChimeraX の幾何の基準 (距離と角度、`distSlop`、`angleSlop`) で判定するので、拾う対が
  違う。
- `coulombic` (8 行): CueMol は APBS (ポアソン・ボルツマン) で、ChimeraX は Coulomb の和 (距離依存の誘電率)。
  値も見た目も違い、APBS が要る。
- `morph` (9 行): CueMol の morph object と Animation で作れるが、ChimeraX の trajectory と再生 (`coordset`) の
  仕組みと合わせる設計が要る。
- `sym #1 assembly n` (3 行): mmCIF の会合体の情報が要る。CueMol の `show_symmetry` は結晶の対称で、意味が違う。
- `clashes` / `contacts` / `interfaces` (6 行): 判定の基準が CueMol に無い。
- `nucleotides` (2 行): CueMol の `nucl` renderer の塩基の描き方と、ChimeraX の `stubs` `slab` などの対応を
  調べてから。

## 確認

- 調査の再生の仕組み (tutorial のコマンドを順に ChX に流して分類する) で、B1-B5 の行が通ることと、他の行の
  結果が悪くならないことを確かめる。
- アプリで目視: `volume #1 level ... style mesh/surface color ... transparency ...`、`volume zone`、
  `lighting soft` / `simple` / `flat`、`preset` の各 preset、`camera ortho`、`unitcell`、`open 3d6y from rcsb_bio`。

## テスト (必要最小限)

- `volume`: `level` が絶対値の property に、`transparency` が `alpha = 1 - t` に、`step` が `lod` に写り、
  1・2・4・8 以外の `step` と複数の `level` を書く前に断る。
- `volume zone`: `nearAtoms` が 1 つの molecule のとき境界の 3 つの property を書き、2 つ以上なら断る。
- `lighting`: preset ごとの AO の on / off と、`flat` が輪郭線を入れること。
- `preset`: 名前の照合 (category の有無、前方一致) と、断る preset が何も実行しないこと。
- `open ... from rcsb_bio`: 1 番から順に取り、2 番以降の失敗で止まり、1 番の失敗は error。
