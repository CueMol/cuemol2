# Console の ChimeraX dialect (ChX console)

console plugin の ChimeraX dialect (呼び名は「ChX console」、prompt `ChX>`、dialect id `chimerax`、
UI の表示は「ChimeraX」) の仕様。ChimeraX のコマンド言語に**部分互換**のコマンドを、ChimeraX の
名前・引数・atom specification で受け付ける。完全互換は目標にしない。
dialect の一覧、`DialectSyntax`、runtime (1 submit = 1 txn、Stop、script、log) は
[op-catalog.md](op-catalog.md) §5 にある。ここには ChX にしか無い部分を書く。
まだ無いコマンドの候補は [残りの計画](../plans/261103-chimerax-console-plan.md) にある。

ChimeraX のソース (`~/ext/ChimeraX/src/bundles/`) のうち、写したものの出どころ:

| ChimeraX | ChX |
|---|---|
| `core/src/commands/cli.py` (コマンド名・引数・型) | `worker/cli/` |
| `core/src/commands/_atomspec.peg`、`atomspec.py` | `worker/spec/` |
| `atomic/src/selectors.py`、`std_commands/src/selectors.py` | `spec/selectors.ts` |
| `core/src/colors.py` (CSS4 の色名)、`atomic/src/colors.py` (Jmol の元素色) | `colorTables.ts` (生成したデータ) |
| `std_commands/bundle_info.xml` (コマンドの登録順) | `commands/registry.ts` |

## 1. 位置づけ

- built-in plugin `chimerax-console` (表示名「ChimeraX console (ChX)」、既定オン) として、console plugin に dialect を足す
  ([op-catalog.md](op-catalog.md) §5)。パーサとコマンドは TS で Web Worker に置く (`plugins/chimerax-console/worker/`)。
  plugin をオフにすると、console の切り替えと `tritium_cli` から消える。
- **コマンドは ChimeraX の文法を読み、op catalog の op の列に変える層**。op は `invokeOp` で呼ぶ
  (`display.ts` の `runOp`、`opContextOf(cc, 'chx')`)。agent・MCP・native console と同じ操作の定義を通るので、
  引数と selection の検査、ファイルの書き込み先の制限、操作の記録 (action log に native の op として残る) が揃う。
  ChX 独自の記録形式は無い。
- worker service を直接呼ぶのは、op にしない読み取り専用の補助 ([op-catalog.md](op-catalog.md) §3.1) だけ:
  renderer の property の読み取り (`props/read`)、paint の状態 (`coloring/panelList`)、file の reader 判定
  (`file/getCompatibleRendererNames`)、selection のコンパイル (`helpers/makeSel`)、scene の取得
  (`helpers/sceneResolver`)、object の一覧 (`scene/listSceneObjects`)。
- 意味が一致するものだけ移す。近いもので違う結果を出すより、理由を言って断る。読めるが未対応の
  keyword は受け付けて `<cmd>: <keyword> is not supported yet; ignored` と warn し、スクリプトを先へ進める。
- **分離**: console の内部は `@plugins/console/worker/dialect-api` (と `shared/dialectMeta`) からしか使わず、
  PyMOL の plugin とは互いを import しない。console も この plugin を import しない (登録を通して受け取る)。
  eslint (`eslint.config.mjs`) が、この向きと worker service の許可リストを検査する。ChX を外すには、
  `plugins/chimerax-console/` と `plugins/index.ts` の 1 行を消せばよい。

### `DialectMeta` の値 (`plugins/chimerax-console/shared/meta.ts`)

| 項目 | 値 |
|---|---|
| `prompt` / `label` | `ChX>` / `ChimeraX` |
| `txnPrefix` / `actionSource` | `chx: ` / `chx` |
| `historyKey` | `cuemol.console.history.chimerax` |
| `scripts` | `.cxc` (`submit: 'text'`: `tritium_cli` は中身を ChX の submit として送る) |

## 2. 行の読み方 (`cli/`)

- **split** (`cli/syntax.ts` の `splitLines`): 改行と、引用符の外の `;` で分ける。コマンド名の位置の `#` から行末は
  コメント。引数の中の `#` は model (`#1`) か色 (`#ff0000`)。行末 `\` の継続は無い (Windows パスが壊れるため)。
- **コマンド名** (`resolveWords`。cli.py の `_find_command_name`): 語ごとに完全一致、無ければ**登録順で最初の
  前方一致**を採る。ambiguous の error にはしない (`col` -> `color`、`del` -> `delete`、`c` -> `cartoon`)。続く語を
  sub-command として探し (`cartoon hide`)、当たらない語でコマンド名は終わる。registry は ChimeraX の登録順に並べ、
  `help` は名前順に出す。
- **引数** (`bindLine`。cli.py:3010-3080): 必須の位置引数 -> 任意の位置引数 -> keyword の順。
  - 任意の位置引数は、読めない語か、keyword の前方一致の語で終わる。ただし atom specification の引数
    (`mayBeEmpty`。cli.py の `Or(ObjectsArg, EmptyArg)`) は、無くても次の任意の引数へ進む (`color red`、`col byh`)。
  - keyword は大小を区別しない前方一致。候補が 1 つならそれ、複数なら camelCase の語数が最少のものが 1 つならそれ。
    同じ keyword を 2 回書くと error。
  - 失敗は行の下に caret を付けて示す。
- **型** (`cli/argTypes.ts`): `StringArg` (escape を処理する)、`FileNameArg` (引用符を外すだけで escape を処理しない。
  cli.py:1208 と同じく `"C:\Users\x.png"` を壊さない)、`BoolArg`、`IntArg` / `FloatArg`、`EnumOf` (完全一致を優先、
  一意な前方一致、ambiguous は error)、`Or`、`ListOf` (カンマ区切り)、`NoArg`、`ColorArg`、`SpecArg`、`RestOfLine`。
  値は正規化した文字列で `run` に渡る (enum は正式名、bool は `true` / `false`、色は `#rrggbb`、spec はその文字列)。
- **色** (`colors.ts`): builtin の色名 (大小無視、`spring green` のように空白入りも。3 語まで) と `#rgb` /
  `#rrggbb` / `#rrggbbaa` (alpha は捨てる)。`rgb()` / `hsl()` と利用者定義の色名はまだ読まない。
- **Tab** (`cli/complete.ts`): 1 語目はコマンド名、以降はそのコマンドの keyword と、引数の型が持つ値 (enum、色名、
  selector 名) とファイル。選んだ値の後には空白を付ける (keyword は語として書く。`name=` や `, ` は書かない)。
  空白を含むファイル名は引用符で囲む。

## 3. atom specification の翻訳 (`spec/`)

- `parse.ts` は `_atomspec.peg` の再帰下降。spec は 1 つの引数なので、spec として読めるところまで読み、どこで
  止まったかを返す。`#ff0000` (16 進の数字が続く `#`) は model ではなく色、selector でない語 (`red`) で spec は終わる。
- 演算子 `&` `|` `~` と括弧は ChimeraX と同じく優先順位が無く右結合。空白で区切った項は和 (`#1 #2`)。
- `emit.ts` は木を**object ごと**に、その object の model 番号で CueMol の式にする。別の model を指す部分はその
  object では `none` になり、式が `none` の object には何もしない。`#1/A | #2/B` は #1 では `chain A`、#2 では
  `chain B` (両方で `chain A or chain B` にはしない)。全項を括弧で包む。

| ChimeraX | CueMol |
|---|---|
| `#1`、`#1,3-5` (model) | model 番号で object を選ぶ |
| `/A,B` | `chain A,B` |
| `:10-20,30`、`:10A`、`:10A-20B` | `resi 10:20`、`resi 30`、`resi 10A`、`resi 10A:20B` |
| `:ALA`、`:5HT` | `resn ALA`、`resn 5HT` |
| `@CA,CB` | `name CA,CB` |
| `all` / `protein` / `nucleic` / `ligand` / `solvent` / `helix` / `strand` / `coil` | `*` / `protein` / `nucleic` / `ligand` / `water` / `helix` / `sheet` / `coil` |
| `backbone` / `mainchain`、`sidechain` / `sideonly` | 原子名で展開した式 |
| 元素記号 (`C`、`Fe`) | `elem Fe` |

- 残基番号か残基名かは `atomspec.py` の `_Part._parse_as_res_id` と同じ: 範囲の両端が `[-+]?数字[英字1つ]?` なら
  残基番号 (末尾の英字は insertion code)、そうでなければ残基名。数字は整数に直して書く (CueMol の `SEL_INSRES` は
  `010A` を受け付けない)。範囲の端の `start` / `end` は `-99999` / `99999` にする (CueMol に開いた範囲は無い)。
- **wildcard** (`*` `?` `[...]`、`[!...]`): chain・残基名・原子名で、CueMol の正規表現 (PCRE) にする。`@C*` は
  `name /(?i)^C.*$/`。ChimeraX の名前の照合は大文字小文字を区別しないが、CueMol の正規表現は区別するので `(?i)` を付ける。
  `/` は `\/` に逃がす。文字としての `*` を CueMol の名前にそのまま渡すと、何にも当たらない (CueMol の名前の照合は
  完全一致) ので、必ず正規表現にする。
- **zone** (`X @< 5`、`atomspec.py` の `_ZoneSelector`): ChimeraX と同じく全 model を探す。model m では
  `(X_m) expand d` に、他の model k ごとの `(X_k) around d ["name_k"]` を足したもの (W とする) を使う。`expand` は
  基準の原子も含む (ChimeraX の `<` と同じ)。

  | ChimeraX | CueMol |
  |---|---|
  | `@< d` / `@> d` | `W` / `not (W)` |
  | `:< d` / `:> d` | `byres (W)` / `not (byres (W))` |
  | `/< d` / `/> d` | W に当たる原子の chain を worker で読んで `chain A,B` / その否定 |
  | `#< d` / `#> d` | W が何かに当たれば `*`、でなければ `none` / その逆 |

  境界は ChimeraX が `<=`、CueMol が `<` (距離がちょうど d の原子だけが違う)。model の名前が重なると、`around` の
  対象が別の model になりうる。chain・model 単位の zone の読み取りは `display.ts` の `emitContext` (原子を数えるだけ)。
- **属性 test** (`@@` 原子、`::` 残基、`//` chain、`##` model。`,` で並べたものは全部を満たすもの):

  | ChimeraX | CueMol |
  |---|---|
  | `@@bfactor` / `@@occupancy` の `>` `<` `=` | `bfac > v` などそのまま |
  | `>=` / `<=` / `!=` | `not (bfac < v)` / `not (bfac > v)` / `not (bfac = v)` (CueMol の比較は `=` `<` `>` だけ) |
  | `@@name`、`@@element`、`::name`、`::chain_id`、`//chain_id` | `name`、`elem`、`resn`、`chain`。`=` は大文字小文字を区別しない wildcard の照合、`==` は区別する完全一致 (正規表現)、`!=` / `!==` はその否定 |
  | `::number` の比較 | `resi` の範囲 (`>=100` は `resi 100:99999`) |
  | `::polymer_type=0/1/2`、`::ss_type=0/1/2` | `not (protein or nucleic)` / `protein` / `nucleic`、`coil` / `helix` / `sheet` |
  | `::is_helix`、`::is_strand` (`^` で否定) | `helix`、`sheet` |
  | `##name=...` | object の名前を worker で照合して `*` / `none` |

  CueMol に無い属性 (`serial_number`、`alt_loc`、`idatm_type`、`radius`、`insertion_code` など) は断る。
- 未対応のもの (sub-model `#1.2`、`#!`、上の表に無い属性、引用符付きの名前、CueMol に無い selector (`sel`、`ions`、
  IDATM 型など)) は、caret 付きの「not supported yet」で断る。

## 4. model 番号 (`models.ts`)

- ChimeraX の `#N` は open 順に振られ、close しても詰めない。scene ごとに `objUid -> N` と次の番号を worker の
  メモリに持つ。これは scene の状態ではない、名前の付け方の補助表。
- 初見の object (GUI で開いたもの、undo / redo で戻ったもの、開き直した scene のもの) には scene 内の順で次の
  番号を振る。scene に無い uid の entry は引かない (undo で消えた object を指さない)。
- 制約: scene を保存して開き直すと番号は振り直しになる (ChimeraX の session とは違う)。

## 5. 表示の状態 (`display.ts`)

ChimeraX は原子ごとに display と style、残基ごとに ribbon の表示を持つ。ChX はこれを molecule ごとの自前の
renderer で表し、**その selection と paint が表示の状態そのもの**とする。メモリにも別の保存先にも写しを持たない。

| renderer | 種類 | style | selection の意味 |
|---|---|---|---|
| `chx:stick` | `ballstick` | `StickBallStick,DefaultCPKColoring` | stick で表示中の原子 |
| `chx:ball` | `ballstick` | `DefaultBallStick,DefaultCPKColoring` | ball で表示中の原子 |
| `chx:sphere` | `cpk` | `DefaultCPK,DefaultCPKColoring` | sphere で表示中の原子 |
| `chx:cartoon` | `ribbon` | `DefaultRibbon,DefaultHSCPaint` | ribbon を表示する残基 (`protein` に限る) |
| `chx:nucl` | `nucl` | `DefaultNucl` | 同 (`nucleic` に限る) |

- 5 つは、ChX が molecule に最初に触れたときにまとめて作る (表示しない間の selection は `none`)。名前が `chx:` で
  ない renderer には触らない。
- コマンドのたびに今の selection を読み、組み合わせて、`set_renderer_selection` で書き戻す。show は OR、hide は
  AND NOT (PyMOL dialect と同じ考え方)。どれも submit の undo txn の中の op なので:
  - undo / redo (console からでも GUI の Cmd+Z からでも) で scene が戻れば、次のコマンドが読む状態も戻る。
    ChX 用の undo の仕組みは無い。
  - GUI で `chx:` renderer の selection や paint を変えれば、それが次の ChX コマンドの出発点になる。
  - qax に書き出して再生すれば、ChX で作った表示がそのまま再現する。
- `show <spec> atoms`: spec の原子のうち、まだどの atom renderer にも無いものを `chx:stick` に足す。
  `hide <spec> atoms`: 3 つから引く。`style <spec> <s>`: 表示中の原子のうち spec に当たるものを他の 2 つから引いて
  `<s>` に足す。`cartoon` / `cartoon hide`: ribbon の 2 つに足す / 引く。`show` / `hide ... models` は object の
  `set_visible`。
- **色**: target の atom 系 (a / b) は 3 つの atom renderer に**同じ** paint entry を、cartoon 系 (c / r) は ribbon の
  2 つに入れる (`add_paint_at` で先頭に。後から入れた色が勝つ)。renderer をまとめて作ってあるので、`color red
  target a` の後に style を変えても赤のまま。paint への切り替え (`set_renderer_coloring` の `paint-type-paint`) は、
  まだ PaintColoring でない renderer にだけ行う (`ensurePaint`)。`setRendererColoring` は呼ぶたびに新しい表を作るので、
  毎回切り替えると `color /A red; color /B blue` の 2 回目で A の赤が消える。
- `byhetero` は炭素以外、`byelement` は炭素も、元素ごとの entry (Jmol の色) を入れる。atom の renderer だけに入れ、
  cartoon の色は変えない (ChimeraX と同じ)。entry を作る元素は生体分子と ligand に多いものに限る (`PAINTED_ELEMENTS`)。
- **制約**:
  - CueMol に原子ごとの表示フラグは無く、どの原子を描くかは renderer の selection だけで決まる。そのため**非表示の原子の
    style は保持しない**。`style :ALA sphere` -> `hide :ALA atoms` -> `show :ALA atoms` では ALA は stick で出る
    (ChimeraX では sphere)。ALA が非表示のうちの `style :ALA sphere` も効かない。もう一度 `style` を打てば直り、データは
    壊れない。保持するには style ごとの原子集合を scene に別に持つ必要があり、その代償 (selection 一覧が散らかる、
    状態の二重化) に見合わないので行っていない。
  - selection の式は、組み合わせた後、書き込む前に簡単にする (`writeSel`、[selection 式の簡単化](selection-simplify.md))。
    `show` / `hide` / `style` を繰り返しても伸びないが、最短になるとは限らない。

## 6. コマンド

| コマンド | 引数 | op | 備考 |
|---|---|---|---|
| `open` | `names`、`name`、`format` (無視)、`fromDatabase` (無視) | `fetch_pdb`、`load_file`、`create_renderer`、`set_renderer_styles`、`set_renderer_selection` | 4 文字の PDB id (`pdb:1abc` も。ファイルとして無いとき) は mmCIF で fetch。`.cxc` は script として実行。`.qsc` は scene として開く (txn の外、行に単独)。molecule は ribbon (`chx:cartoon`) で読み、ligand を stick にする (ChimeraX の自動の style の簡易版)。molecule でないもの (map) は File > Open と同じに開く。`Opened <name> as #N` と言う |
| `close` | `[models]` | `delete_node` | spec が無ければ全部 |
| `delete` | `atoms`、`attachedHyds` (無視) | `delete_atoms` | |
| `show` / `hide` | `[spec] [what]`、`target` | `set_renderer_selection`、`set_visible` | what: `atoms` `bonds` `cartoons` `ribbons` `models` (`surfaces` / `pseudobonds` は warn)。target の文字 `a b c r m s p` |
| `cartoon` / `cartoon hide` | `[spec]`、`smooth` / `suppressBackboneDisplay` (無視) | `set_renderer_selection` | |
| `style` | `[spec] stick\|ball\|sphere`、`dashes` / `ringFill` (無視) | `set_renderer_selection` | |
| `color` | `[spec] [色 \| byhetero \| byelement]`、`target`、`transparency` / `halfbond` / `what` (無視) | `set_renderer_coloring`、`add_paint_at` | target の既定は ChimeraX と同じ `acsbpf`。色は名前、hex (`#rgb` から 16 桁まで、alpha 付きも)、`rgb()` `rgba()` `hsl()` `hsla()` `gray()` (数値は整数なら 0-255、小数点付きなら 0-1、`%`、色相は `deg` / `rad` / `grad` / `turn`)、`r,g,b[,a]` の百分率 (`colors.ts`)。CueMol の paint は alpha を持たないので、色が alpha を述べていれば warn して不透明で塗る |
| `view` | `[spec]`、`frames` / `pad` (無視)、`view <名前>` | `set_view`、`apply_camera` | 下記。spec でない語は名前付き view として戻す |
| `view name` / `view list` / `view delete` | `name` / `name\|all` | `save_camera`、`list_cameras`、`delete_camera` | ChimeraX の予約語 (`clip` `cofr` `delete` `list` `matrix` ...) を前方一致で含む名前は断る。CueMol のカメラは視点だけで、ChimeraX のように model の位置は戻さない |
| `view matrix` | `camera M` (12 数値)、`models` / `coordinateSystem` は断る | `set_view` ×2、`set_projection` | 下記 |
| `turn` | `[axis] [angle] [frames]` (既定 y、90°) | `set_view` (`rotation`) | 下記。`center` `coordinateSystem` `rock` `wobble` `models` `atoms` は断る |
| `move` | `axis [distance] [frames]` (Å、既定 1) | `set_view` (`center`) | 下記。`coordinateSystem` `models` `atoms` は断る |
| `cofr` | 引数無し / `centerOfView` | (読み取り) | `Center of rotation: x y z  center of view` と出す。CueMol は view の中心で回すので、対象や点を指定する形は「視点が動いてしまう」として断り、`view <spec>` を案内する |
| `zoom` | `[factor] [frames]`、`pixelSize` | `set_view` (`zoom`) | CueMol の zoom は view の高さ (Å) なので `zoom / factor`。1 pixel = zoom / 高さ (px) Å。引数無しは `Pixel size at center of rotation is ...`。`frames` は warn (ChimeraX は倍率を frames 全体で達成するので掛けない) |
| `set` | `bgColor`、`silhouettes` `silhouetteWidth` `silhouetteColor` | `set_node_prop` | 引数無しは背景色を出す。他の keyword は warn |
| `graphics silhouettes` | `[true\|false]`、`width` `color`、`depthJump` (無視) | `set_node_prop` (`egtype` `eglinew` `egcolor`) | 下記 |
| `undo` / `redo` | | (runtime) | 行に単独のとき txn の外で (`undoStack`) |
| `usage` / `help` | `[command]` | | |

**カメラの向き**: CueMol の view は world の軸 = R(q) × 画面の軸 で、`forward_vec` は画面の +z (手前)。ChimeraX の camera
も -z を向くので、軸は同じ向きで対応する (`camera.ts` の `readCamera`)。

- `turn`: 画面の軸 u (`x` `-y` や 3 数値) の周りに scene を回す。今の回転 q に `q · rot(u, -θ)` を掛けて `set_view` で書く
  (`turnedRotation`)。`rotate_view` は ChimeraX と逆向きに回るので使わない。
- `move`: 画面の軸を world に直し、中心を `-d·軸` 動かす (scene が +d に動いて見える)。
- `frames`: アニメーションはしない。有限の数は、ChimeraX が毎 frame 同じ角度・距離を繰り返すので掛けて一度に動かし
  (`turn y 3 30` は 90°)、`forever` は断る。
- `view matrix camera M`: 3×4 行列を行ごとに (列 0-2 が軸、列 3 が目の位置)。ChimeraX の camera は位置だけを持つが、CueMol は
  目の前 `distance` の中心の周りに回り、その前後 `slab` だけを描く。そこで、中心は視線が表示中の分子の中心を通る点に置き、
  distance はそこまでの距離にする。zoom は ChimeraX の水平の視野角 30° になる高さ (`2·d·tan15°/縦横比`)、投影は透視投影
  (`set_projection`)、slab は分子に合わせ直す (`set_view` の `fitSlab`)。引数無しは `view matrix camera ...` を `%.5g` で出す。
  model の行列は無い (CueMol の object は位置を持たない)。
- `graphics silhouettes`: ChimeraX は view 全体の設定、CueMol は renderer ごとの輪郭線 (`egtype=silhouette`) なので、面を描く
  全 renderer (Inspector の `NO_EDGE_LINE_TYPES` 以外) に書く。幅は ChimeraX が pixel、CueMol が Å なので、今の zoom で
  換算する (以後の zoom で太さが変わることを warn)。

**view**: ChimeraX の `view` と同じく、向きを変えずに、名指したもの (無ければ全部) が収まるように center・zoom・slab を
1 回の `set_view` で書く。範囲は object ごとの式の原子を、view の軸 (`right_vec` / `up_vec` / `forward_vec`) で読んで求める
(`camera.ts`)。計算は `MolCoord::fitView` (`MolCoordGeomImpl.cpp`) と同じ: 各辺 20% 広げ、4 A より細い軸は 4 A に、zoom は
幅か高さを view の縦横比で、slab は奥行き。既存の op を使わないのは、`focus_node` は node 1 つ、`center_view` は molecule
1 つで object の selection も書き換えるため。複数 object の範囲に fit する公開 op は作っていない (作ると catalog に構造化
した引数の種類が要り、MCP の schema・native console・selection の検査・qax の記録まで広がる)。camera の変更は undo しない。

## 7. テスト

`plugins/chimerax-console/worker/`:

- `cli/syntax.test.ts`: `;` と `#` の分け方、登録順の前方一致と sub-command、spec の省略と keyword の前方一致・
  重複、ファイル名の `\` を escape しないこと
- `spec/translate.test.ts`: 階層・insertion code・残基名・演算子の翻訳、model ごとの評価、16 進の色を spec にしないこと、
  未対応の語を断ること
- `display.test.ts`: show / hide / style / cartoon の合成 (式は小さな原子の集合で評価して比べる)、他の renderer に
  触らないこと、今の selection から始めること (undo / GUI の編集に追従)、style を変えても色が残り paint への切り替えは
  1 度だけであること
- `models.test.ts`: 番号を詰めず、使い回さないこと

dialect に依存しない基盤 (ダミーの文法の dialect で補完と実行が同じ文法を通ること、別 dialect の script を断る文言) は
`runtime/dialectNeutral.test.ts`。
