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

- built-in plugin `chimerax-console` (表示名「ChX console」、既定オン) として、console plugin に dialect を足す
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
  sub-command として探し (`cartoon hide`)、当たらない語でコマンド名は終わる。打った語の大文字小文字は変えずに
  比べる (cli.py の `subcommands.get(word)` / `startswith(word)`): `select C & :sti` の `C` (炭素) は `select clear` の
  省略にならず、`Open` は知らないコマンド (ChimeraX と同じ)。registry は ChimeraX の登録順に並べ、
  `help` は名前順に出す。
- **引数** (`bindLine`。cli.py:3010-3080): 必須の位置引数 -> 任意の位置引数 -> keyword の順。
  - 任意の位置引数は、読めない語か、keyword の前方一致の語で終わる。ただし atom specification の引数
    (`mayBeEmpty`。cli.py の `Or(ObjectsArg, EmptyArg)`) は、無くても次の任意の引数へ進む (`color red`、`col byh`)。
  - keyword は前方一致。打った語の大文字小文字は変えず、keyword そのものか keyword を小文字にしたものが打った語で
    始まれば当たる (cli.py の `_start_of_keywords`: 「`show O` を直すため」)。`color C & :ber red` の `C` や `show O` の
    `O` は、`color` / `objects` の省略ではなく spec になる。候補が 1 つならそれ、複数なら camelCase の語数が最少の
    ものが 1 つならそれ。
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
- atom specification を取る引数で `#` か `#1` まで打って Tab を押すと、今の scene の model 番号を名前付きで並べる
  (`#1 1crn`)。番号を振っていない object にはここで振る (§4)。`#1/A:10` と続けることが多いので、後に空白を付けない。

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
| `sel` (今の選択) | 各分子の今の選択 (object の `sel`) の式。選択の無い分子では `none`。選択を書き換えるコマンド (`select sel ...`) でも、書き換える前の値から読む |
| scene の名前付き selection の名前 (`name` で定義したもの) | その名前 (CueMol の参照)。行を読む直前に、runtime が `bind` に渡す scene から名前の一覧を読む (`names.ts`、`withSceneSelectors`) |
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
- 未対応のもの (sub-model `#1.2`、`#!`、上の表に無い属性、引用符付きの名前、CueMol に無い selector (`ions`、
  IDATM 型など)) は、caret 付きの「not supported yet」で断る。

## 4. model 番号 (`models.ts`)

- ChimeraX は新しい model に使われていない最小の番号を振る (`core/models.py` の `Models.next_id`)。close した
  model の番号は次に開いたものが使う (`#1 #2 #3` から `#2` を閉じて開くと `#2`)。開いている model の番号は
  変わらない。scene ごとに `objUid -> N` を worker のメモリに持つ。これは scene の状態ではない、名前の付け方の補助表。
- 初見の object (GUI で開いたもの、undo / redo で戻ったもの、開き直した scene のもの) には scene 内の順で空いて
  いる最小の番号を振る。scene に無い uid の entry は先に捨てて番号を空ける (undo で消えた object を指さない)。
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
  まだ PaintColoring でない renderer にだけ行う (`ensurePaint`。renderer の coloring の class を見る。GUI のパネルの
  `canPaint` は分子に選択が無いと false になるので、判定に使うと選択の無いときに毎回切り替えてしまう)。`setRendererColoring` は呼ぶたびに新しい表を作るので、
  毎回切り替えると `color /A red; color /B blue` の 2 回目で A の赤が消える。
- 分子全体 (spec が `#1` や省略で、その分子の式が `*`) を全原子に当たる色 (単色、`bychain`、`bymodel`) で塗るときは、
  先に対象の renderer の paint を `clear_paint` で消してから入れる。前の entry はもう表に出ないので、同じ分子に
  `color` を繰り返しても表が伸び続けない (表が長いほど paint の操作と描画が重くなる)。炭素を残す `byhetero` /
  `byelement` と、spec が分子の一部のときは消さずに重ねる (どの entry が隠れたかの判定はしない)。
- `byhetero` は炭素以外、`byelement` は炭素も、元素ごとの entry (Jmol の色) を入れる。atom の renderer だけに入れ、
  cartoon の色は変えない (ChimeraX と同じ)。entry を作る元素は生体分子と ligand に多いものに限る (`PAINTED_ELEMENTS`)。
- `bychain` / `bymodel` は atom・cartoon・surface のどれにも入れる (`colorSchemes.ts`)。
  - `bychain`: spec の触れる chain ごとに `chain X` との積の entry。色は ChimeraX の表 (`atomic/colors.py`
    `chain_colors`、a-z と 0-9、大文字小文字を区別しない)。表に無い chain id には、ChimeraX は id を seed にした Python の
    乱数で色を作るので再現できない。同じ範囲 (128-255) の色を id の hash から作り、違うことを warn する。
  - `bymodel`: model の色 (`atomic_color_names`: #1 tan、sky blue、plum、light green、salmon、light gray、deep pink、
    gold、dodger blue、purple)。11 番目以降は表を回して warn する (ChimeraX は他と見分けやすい色を作る)。
  - `bypolymer` / `byidentity` は断る (配列ごとの ChimeraX の seed 付き乱数の色を再現できない)。
  - `random` は断る。ChimeraX は原子ごとの乱数の色で、paint では原子 (残基で近似しても残基) の数だけ entry が要る。
    約 2000 残基の分子で 1 万回の `add_paint_at` になり、GUI が長く busy になった。使われる場面も少ない。
- `rainbow` は palette に沿って補間した色の entry を入れる。`residues` (既定) は chain ごとに spec の polymer 残基を順に
  並べ、位置 (0..1) を 64 段に量子化し、同じ色の連続した残基を `resi a:b` の 1 つの entry にまとめる (1 chain あたり最大
  64 entry)。`chains` は model ごとに chain id 順、`structures` は model ごとに 1 色。palette は組み込みの名前
  (`rainbow` (既定、青から赤) `grayscale` `red-white-blue` `blue-white-red` `cyan-white-maroon` `cyan-gray-maroon`
  `lipophilicity` と別名)、`c1:c2:...`、位置付きの `v1,c1:v2,c2:...`、先頭の `^` で反転 (`colorarg.py` `ColormapArg`)。
- **surface** (`surface.ts`): ChimeraX と同じく chain ごとに 1 つ、`dsurface` の `chx:surface:<chain>` を、surface に
  触れたとき (`surface`、`show ... surfaces`) に作る。接している chain どうしをまとめて計算すると、chain の間の面が消える
  ため。表面を作る原子 (`sel` = `(chain X) and (protein or nucleic)`) と表示する原子 (`showsel`。含まれない原子の頂点は
  描かない) を分け、表示・非表示は `showsel` だけを `set_node_prop` で書く。`sel` は変えないので表面は計算し直さない。
  新しく作った surface の `showsel` は `none` から始める (`showsel` が空だと全部を描く)。`surface enclose` は指定した
  原子群を囲む別の renderer `chx:surface:enclose` にする。`surface close` は spec の触れる chain の surface (と enclose)
  を `delete_node` する。patch の境界の細部は ChimeraX と違いうる。
- **surface の色・透明度**: `color` の target `s` (既定の `acsbpf` も) は、**ある** `chx:surface:*` に atom と同じ paint
  entry を入れる (色を付けるだけで surface は作らない)。surface の色付けは `colormode=molecule` で、その renderer の
  paint を使う。最初の `color` で paint に切り替わるので、指定していない部分も paint の既定の色になる。透明度は renderer
  の `alpha` (§6 `transparency`)。
- **ラベル**: 残基ラベルは `chx:label:residues`、原子ラベルは `chx:label:atoms` (`*namelabel`)。種類ごとに renderer を
  分けるのは、`label delete` で種類を省いたとき両方から、指定したときその種類からだけ外すため (1 つの renderer では、
  残基ラベルを消すと同じ原子の原子ラベルまで消える)。CueMol のラベルは原子に付くので、残基ラベルは残基ごとの代表原子
  (`CA`、無ければ `C4'`、どちらも無い ligand・水・イオンは残基の最初の原子) に `aid` の selection で付ける。原子を指す
  spec (`/A:10@CB`) も先に残基に広げる (`byres`)。ChimeraX の既定の位置 (残基の中心) とは異なり、ラベルは代表原子の
  位置に出る。
- **`open` の auto style** (`autoStyle.ts`、ChimeraX の `structure.py` `apply_auto_styling`): 開いた molecule を
  polymer の chain 数・原子数・polymer の残基数で分け (閾値は ChimeraX と同じ)、5 つの renderer の selection と paint を
  書く。

  | 分類 | 条件 | 表示 | 色 |
  |---|---|---|---|
  | non-polymer | polymer の chain が無い | 全原子 stick | model の色、炭素以外は元素の色 |
  | small polymer | chain 5 未満、原子 20 万未満、残基 5000 未満 | cartoon (protein / nucleic)、ligand と金属から 3.6 A 以内の残基を stick (`byres ((L) expand 3.6)`)、その中の金属とイオンは sphere、炭素に付いた水素は隠す。残基が 10 以下 (短いペプチド) なら全原子 stick で cartoon 無し | 同上 (cartoon も model の色) |
  | medium polymer | chain 250 未満、原子 100 万未満 | 全原子 sphere、ligand は stick、水は ball | 全 chain が同じ配列なら chain の色、ligand と水は元素の色 |
  | large polymer | それ以外 | 全原子 sphere | model の色 |

  CueMol で区別できないものは近似する: イオンはハロゲンと金属の原子 (ChimeraX は 1 原子の残基)、炭素に付いた水素は
  標準残基の極性水素の名前の裏 (ChimeraX は結合から決める IDATM 型 `HC`)。medium / large で配列の違う chain があると、
  ChimeraX は配列ごとの色にするが、CueMol では model の色のまま warn する。ChimeraX の lighting の切り替え、核酸の
  tube/slab、糖鎖の SNFG 表示は行わない。
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
| `open` | `names`、`name`、`format`、`fromDatabase` | `fetch_entry`、`fetch_url`、`fetch_emdb`、`load_file`、`create_renderer`、`set_renderer_styles`、`set_renderer_selection`、`set_renderer_coloring`、`add_paint_at` | 4 文字の PDB id、`db:id` (`pdb` `pdbe` `pdbj` `redo` `alphafold` `pubchem` `emdb` ほか)、`id fromDatabase db`、http(s) の URL はデータベースから取得する ([database-fetch](database-fetch.md) §3。ファイルとの優先順位は ChimeraX と同じ)。AlphaFold は開いた後に pLDDT で塗る。`.cxc` は script として実行。`.qsc` は scene として開く (txn の外、行に単独)。molecule は ribbon (`chx:cartoon`) で読み、ChimeraX の auto style で表示と色を決める (§5)。molecule でないもの (map) は File > Open と同じに開く。`Opened <name> as #N` と言う |
| `close` | `[models]` | `delete_node` | spec が無ければ全部 |
| `delete` | `atoms`、`attachedHyds` (無視) | `delete_atoms` | |
| `show` / `hide` | `[spec] [what]`、`target` | `set_renderer_selection`、`set_visible`、`create_renderer`・`set_node_prop` (surface) | what: `atoms` `bonds` `cartoons` `ribbons` `surfaces` `models` (`pseudobonds` は warn)。target の文字 `a b c r m s p`。surface は §5 |
| `cartoon` / `cartoon hide` | `[spec]`、`smooth` / `suppressBackboneDisplay` (無視) | `set_renderer_selection` | |
| `style` | `[spec] stick\|ball\|sphere`、`dashes` / `ringFill` (無視) | `set_renderer_selection` | |
| `color` | `[spec] [色 \| byhetero \| byelement \| bychain \| bymodel]`、`target`、`transparency` / `halfbond` / `what` (無視) | `set_renderer_coloring`、`clear_paint`、`add_paint_at` | target の既定は ChimeraX と同じ `acsbpf` (`s` はある surface に塗る)。色は名前、hex (`#rgb` から 16 桁まで、alpha 付きも)、`rgb()` `rgba()` `hsl()` `hsla()` `gray()` (数値は整数なら 0-255、小数点付きなら 0-1、`%`、色相は `deg` / `rad` / `grad` / `turn`)、`r,g,b[,a]` の百分率 (`colors.ts`)。CueMol の paint は alpha を持たないので、色が alpha を述べていれば warn して不透明で塗る |
| `rainbow` | `[spec] [residues\|chains\|structures]`、`target`、`palette`、`transparency` (無視) | `set_renderer_coloring`、`add_paint_at` | §5。`polymers` は断る (配列を比べない) |
| `view` | `[spec]`、`frames` / `pad` (無視)、`view <名前>` | `set_view`、`apply_camera` | 下記。spec でない語は名前付き view として戻す |
| `view name` / `view list` / `view delete` | `name` / `name\|all` | `save_camera`、`list_cameras`、`delete_camera` | ChimeraX の予約語 (`clip` `cofr` `delete` `list` `matrix` ...) を前方一致で含む名前は断る。CueMol のカメラは視点だけで、ChimeraX のように model の位置は戻さない |
| `view matrix` | `camera M` (12 数値)、`models` / `coordinateSystem` は断る | `set_view` ×2、`set_projection` | 下記 |
| `turn` | `[axis] [angle] [frames]` (既定 y、90°) | `set_view` (`rotation`) | 下記。`center` `coordinateSystem` `rock` `wobble` `models` `atoms` は断る |
| `move` | `axis [distance] [frames]` (Å、既定 1) | `set_view` (`center`) | 下記。`coordinateSystem` `models` `atoms` は断る |
| `cofr` | 引数無し / `centerOfView` | (読み取り) | `Center of rotation: x y z  center of view` と出す。CueMol は view の中心で回すので、対象や点を指定する形は「視点が動いてしまう」として断り、`view <spec>` を案内する |
| `zoom` | `[factor] [frames]`、`pixelSize` | `set_view` (`zoom`) | CueMol の zoom は view の高さ (Å) なので `zoom / factor`。1 pixel = zoom / 高さ (px) Å。引数無しは `Pixel size at center of rotation is ...`。`frames` は warn (ChimeraX は倍率を frames 全体で達成するので掛けない) |
| `set` | `bgColor`、`silhouettes` `silhouetteWidth` `silhouetteColor` | `set_node_prop` | 引数無しは背景色を出す。他の keyword は warn |
| `graphics silhouettes` | `[true\|false]`、`width` `color`、`depthJump` (無視) | `set_node_prop` (`egtype` `eglinew` `egcolor`) | 下記 |
| `select` | `[spec]`、`residues`、`minimumLength` などは warn | `set_mol_selection`、`count_selection` | 各分子の選択を置き換え、spec の届かない分子の選択は消す (ChimeraX の選択は全体で 1 つ)。`N atoms selected` と出す |
| `select add` / `subtract` / `intersect` / `clear`、`~select` | `[spec]` (`intersect` は必須) | `set_mol_selection` | 今の選択と和・差・積を取って書く。spec が無ければ `add` は全部、`subtract` は全部を引く |
| `name` | `name spec` / `name name` (定義を出す) | `define_selection` | spec の式が分子ごとに違う (model を指す、model をまたぐ zone) と断る。CueMol の名前付き selection は、使う分子ごとに評価する 1 つの式だから |
| `name delete` / `name list`、`name frozen` | `name\|all` | `remove_selection` | `name frozen` は断る (今の原子の集合を固定する手段が無い) |
| `info`、`info models` / `chains` / `residues` / `atoms` | `[spec]`、`attribute`、`saveFile` (無視) | (読み取り) | ChimeraX の書式 (`#1, 1crn, shown`、`chain id #1/A chain_id A`、`residue id #1/A:12 name ALA`、`atom id #1/A:12@CA`)。結合の数と IDATM 型 (`info atoms` の既定の attribute) は CueMol に無いので出さない。atom の attribute は name・element・bfactor・occupancy |
| `alias` / `alias list` / `alias delete` / `~alias` | `name text`、`$1`-`$9`・`$*` | (中のコマンドの op) | 下記 |
| `surface` | `[spec]`、`enclose`、`probeRadius`、`color`、`transparency`、`gridSpacing` `resolution` `visiblePatches` など (無視) | `create_renderer`、`set_node_prop` (`showsel` `proberad` `alpha`)、`add_paint_at` | spec の触れる chain ごとの surface に spec の patch を足す (§5) |
| `surface hidePatches` / `~surface`、`surface close` | `[spec]` | `set_node_prop` (`showsel`) / `delete_node` | |
| `transparency` | `[spec] percent [what]`、`target` (既定 `s`) | `set_node_prop` (`alpha`) | `alpha = 1 - percent/100`。target の a / b は 3 つの atom renderer、c / r は ribbon の 2 つ、s は surface。CueMol の透明度は renderer 単位で原子ごとではないので、spec が model の一部のときは断る |
| `label` | `[spec] [atoms\|residues]` (既定 residues)、`text`、`attribute`、`color`、`size` (`font_size`)、`onTop` (`label_on_top`)、`height` `bgColor` `offset` `font` (無視) | `set_atom_labels`、`set_node_prop` | 書式は残基 `{resn} {resi}`、原子 `{name}`。`text` は文字どおり (`{` `}` は escape)。`attribute` は残基の `name` `number` `chain_id`、原子の `name` `element` `bfactor` `occupancy` `alt_loc`。実数は ChimeraX の `%.3g` に合わせて `{bfac:.3g}`。`pseudobonds` `bonds` `models` のラベルは断る |
| `label delete` / `~label` | `[spec] [atoms\|residues]` | `set_atom_labels` (`format: null`) | 種類を省くと両方を消す (ChimeraX と同じ)。残基ラベルは spec の残基の全原子から外す (付いているのは代表原子だけ) |
| `distance` | `objects` (ちょうど 2 原子)、`decimalPlaces` (既定 3)、`color` `dashes` `radius` など (無視) | `measure_geometry` | 最初の原子の molecule の `chx:distance` (`atomintr`) に描く。model をまたぐときは 2 つ目の object を uid で渡す (同名の model があるため)。`Distance between /A ARG 10 CA and /A GLY 20 CA: 15.598Å` (model が複数なら `#1/A ...`)。値は `measure_geometry` の `data.exactValue` (丸めない値) を `decimalPlaces` で整形する。3D のラベルは CueMol の書式のまま。原子が 3 つ以上 (ChimeraX は min/avg/max を出す) は断る |
| `distance delete` / `~distance` | `[spec]` | `delete_node` / `list_interactions`・`remove_interaction` | 引数無しは全 molecule の `chx:distance` を消す。2 原子を指定すると、その対の測定だけを消す (`list_interactions` の原子の表記 `A ARG 10 CA` で照合) |
| `align` | `atoms toAtoms atoms`、`move` (structures だけ)、`each` `matchChainIds` `cutoffDistance` などは断る | `superpose` (`LSQ`) | 原子を順に対にする最小二乗。両側がそれぞれ 1 model で、原子数が同じで 3 以上であることを先に確かめる。RMSD は重ねた後の座標から計算し、`RMSD between N atom pairs is x angstroms` と出す |
| `matchmaker` / `mmaker` | `atoms to spec`、`pairing` `alg` `matrix` `cutoffDistance` `showAlignment` など (無視) | `superpose` (`USalign`) | 基準 (1 model) 以外の model ごとに重ねる。ChimeraX は配列アラインメントと遠い対の除外の繰り返しで、CueMol は US-align (構造アラインメント) なので、重なり方が違いうることを毎回 warn する。RMSD は出さない (US-align の対が分からない) |
| `save` | `filename`、`format`、`models`、`width` `height` `transparentBackground`、`supersample` `pixelSize` `quality` (無視)、`selectedOnly` `displayedOnly` `relModel` `allCoordsets` は断る | `export_scene` / `save_scene` / `save_object` | `.png`: 片方の大きさだけなら view の縦横比で他方を決める。`.qsc`: 行に単独で txn の外 (`outsideTxn`)。`.pdb`: 1 model だけ、`link: false` (object の元のファイルを変えない)。`.cxs` は断って `.qsc` を案内する |
| `undo` / `redo` | | (runtime) | 行に単独のとき txn の外で (`undoStack`) |
| `usage` / `help` | `[command]` | | |

**alias** (`commands/aliasCommands.ts`): worker のメモリに表を持つ (ChimeraX と同じく session の間だけ、全 scene 共通)。

- 定義は `;` を含めて行の残り全部 (alias.py の `WholeRestOfLine`)。`splitLines` は `alias` で始まる行を `;` で分けない。
- 呼び出しは、その行を走らせる直前の `resolve` で表を引く (`resolveChx`)。runtime は submit や `.cxc` の全文を先に
  分けるので、分ける段階で展開すると、同じスクリプトの前の行で定義した alias を使えない。
- 呼び出しは 1 つのコマンドとして bind され、その `run` が `$1`-`$9` / `$*` を展開し、分けて、同じ txn の中で順に
  解決・bind・実行する。alias は自分自身を展開しない。入れ子は 10 段まで。
- txn の外で走るべきコマンド (`undoStack` か `outsideTxn` のもの) を含む alias は、何も実行せずに断る。子の `run` を
  直接呼ぶと runtime の検査が抜け、txn の中で走ってしまうため。

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
幅か高さを view の縦横比で、slab は奥行き。既存の op を使わないのは、`focus_node` は node 1 つ、`focus_selection` は molecule
1 つ、`focus_nodes` (複数 node の和に fit) は node 単位で object ごとの原子式を取らないため。camera の変更は undo しない。

## 7. テスト

`plugins/chimerax-console/worker/`:

- `cli/syntax.test.ts`: `;` と `#` の分け方、登録順の前方一致と sub-command、spec の省略と keyword の前方一致・
  重複、ファイル名の `\` を escape しないこと、元素記号で始まる spec を keyword や sub-command の省略と取り違えない
  こと (`color C & :ber red`、`show O`、`select C & :sti`)
- `commands/viewCommands.test.ts`: spec を付けた `view` が `set_view` に引数を欠かさず渡すこと (欠けた引数は op に
  `undefined` で届き、`rotation` が足されたときに `view sel` が例外で落ちた)
- `spec/translate.test.ts`: 階層・insertion code・残基名・演算子の翻訳、model ごとの評価、16 進の色を spec にしないこと、
  未対応の語を断ること
- `display.test.ts`: show / hide / style / cartoon の合成 (式は小さな原子の集合で評価して比べる)、他の renderer に
  触らないこと、今の selection から始めること (undo / GUI の編集に追従)、style を変えても色が残り paint への切り替えは
  1 度だけであること
- `models.test.ts`: 番号を詰めず、使い回さないこと
- `commands/reprCommands.test.ts`: surface が chain ごとに polymer から作られ `showsel` に spec の patch だけが入ること、
  `hide ... surfaces` が surface を消さず `showsel` を狭めること、`transparency` の target と renderer の対応と model の
  一部を断ること、残基ラベルの代表原子の fallback
- `commands/analysisCommands.test.ts`: `distance` がちょうど 2 原子だけを測ること、`matchmaker` が基準以外の model
  ごとに重ねること
- `colorSchemes.test.ts`: chain の色を大文字小文字を区別せずに引くこと、`rainbow residues` が 64 段以下の範囲にまとめ、
  青から赤で、`^` で逆になること
- `autoStyle.test.ts`: ChimeraX の大きさの閾値、短いペプチドを stick にすること、small polymer の selection の式
- (`cli/syntax.test.ts` の前方一致に、`sel` `su` `tr` `tu` `sa` `la` `di` `mm` `al` の短縮形)

dialect に依存しない基盤 (ダミーの文法の dialect で補完と実行が同じ文法を通ること、別 dialect の script を断る文言) は
`runtime/dialectNeutral.test.ts`。
