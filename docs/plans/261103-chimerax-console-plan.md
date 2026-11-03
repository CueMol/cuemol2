# ChimeraX 互換 console (ChX console) 基盤整備プラン

## Context

tritium の console plugin には native dialect と PyMOL dialect (旧 pymconsole, `PyM>`) がある。
3 つ目として ChimeraX 互換の dialect を足したいが、今の console は dialect が 2 つである前提で書かれている。

- dialect の id が約 12 箇所に直書きされている。
- 引数の読み方は PyMOL / Python 式 (カンマ区切りの `name=value`) しか無い。

このまま ChimeraX を足すと既存の 2 つと密結合になる。そこで今回は次の 2 つに絞る:

1. **dialect を足し外ししやすい基盤**を作る
2. その上に **ChX console の骨格と基本コマンド**を載せる

コマンドの拡充は基盤が入ってから少しずつ行う (§5)。ChimeraX の実スクリプトをすべて動かすことは今回の目標にしない。

- 呼び名は「ChX console」、prompt は `ChX>`。dialect id は `chimerax`、UI の表示は「ChimeraX」。
- TS で Web Worker に置く。ChX のコマンドは **ChimeraX の文法を解釈して op catalog の op 列に変換する層**
  にし、op は `invokeOp` で呼ぶ (§3.9)。agent・MCP・native console と同じ共通の操作定義を通るので、
  引数と selection の検査、ファイルの書き込み先の制限、操作の記録が揃う。
- 意味が一致するものだけ移し、近似で違う結果を出すより理由を言って断る。完全互換は目標にしない。
- ChimeraX のソースは `~/ext/ChimeraX/src/bundles/` にある。

  | ファイル | 内容 |
  |---|---|
  | `core/src/commands/cli.py` | 引数文法 |
  | `core/src/commands/_atomspec.peg` | atom spec |
  | `core/src/colors.py` | 色名 |
  | `atomic/src/colors.py` | 元素色 |
  | `std_commands/src/*.py` | 各コマンド |

- tritium 側の手本は `tritium/react-gui/src/plugins/console/worker/dialects/pymol/` と
  `docs/architecture/console-pymol-dialect.md`。

## 1. PR の分け方

CI を何度も走らせないよう、dialect の基盤 (registry 化と、runtime を dialect 中立にする refactoring) と
ChX console を 1 つの PR に積む。基盤の仕様は `docs/architecture/op-catalog.md` §5
(dialect の一覧と `DialectSyntax`)、`console-completion.md`、`local-api-server.md` §5 にある。
以下は、その上に載せる ChX console の作業。

## 3. ChX console の基盤と基本コマンド

### 3.1 登録 (PR 1 で触る共有ファイル)

- `shared/dialectMeta.ts` に 1 行:
  `{ id: 'chimerax', label: 'ChimeraX', prompt: 'ChX>', txnPrefix: 'chx: ', actionSource: 'chx', historyKey: 'cuemol.console.history.chimerax', scripts: [{ ext: '.cxc', submit: 'text' }], cliColor: 'green' }`
- `worker/dialects/index.ts` に 1 行: `chimerax: CHIMERAX_DIALECT`
- `cli/src/skill/SKILL.md` の説明

### 3.2 構成 `worker/dialects/chimerax/`

| ファイル | 役割 |
|---|---|
| `index.ts` | `CHIMERAX_DIALECT`。`DialectSyntax` (`op-catalog.md` §5) を `cli/` で実装してつなぐ |
| `cli/split.ts` | 改行と、引用符の外の `;` で分ける。コマンド名の位置の `#` から行末はコメント。PyMOL の行末 `\` 継続は持たない (Windows パスが壊れるため) |
| `cli/tokenize.ts` | 空白で区切る。`'..'` / `".."` で quote する。escape の処理は String / Enum 型だけで行い、FileName 型ではしない (cli.py:1208 と同じ。`"C:\Users\..."` を壊さない) |
| `cli/argTypes.ts` | cli.py の Annotation の TS 版。各型は `parse(text) -> { value, consumed } \| fail` で、取れる限り取る。基盤として用意するのは Bool、Int、Float、String、Enum、Or、ListOf、NoArg、Color、Objects (spec)、FileName |
| `cli/resolve.ts` | コマンド名の解決 (§3.3) |
| `cli/bind.ts` | 引数の束縛 (§3.3) |
| `spec/parse.ts`、`spec/emit.ts` | atom spec を CueMol の selection 式に変換する (§3.4) |
| `spec/selectors.ts` | builtin の selector 名 |
| `state.ts` | `chx:` renderer の sel と paint から、object ごとの表示状態を読む (§3.5) |
| `models.ts` | `#N` と CueMol object の対応表 (§3.6) |
| `display.ts` | コマンドの結果を `chx:` renderer への op 列に変える (§3.7) |
| `colors.ts` | builtin の色名 (CSS4 と、空白入りの別名) と `#hex`、Jmol の元素色 |
| `commands/registry.ts` | コマンド表 (ChimeraX の登録順)、`help`、`usage` |
| `commands/*.ts` | 領域ごとのコマンド |
| `sources.ts` | 補完の候補源: commands、models、selectors、colors、enum、files |

### 3.3 コマンド名と引数の読み方 (cli.py に合わせる)

**コマンド名** (`_find_command_name`, cli.py:2814):

- 語ごとに完全一致を探し、無ければ**登録順で最初の前方一致**を採る。ambiguous の error にはしない。
- registry は ChimeraX の `std_commands/bundle_info.xml` の登録順に並べる。例: `col` は `color` に、`del` は `delete` になる。
- 複数語のコマンド (`cartoon hide`) は、次の語を subcommand として探す。一致しない語 (`/B`、`#1`) でコマンド名は終わる。
- help の一覧は登録順とは別に名前順で出す。

**引数** (cli.py:3010-3080):

- 必須の位置引数、任意の位置引数、keyword の順に束縛する。
- 任意の位置引数は、型が合わないか、次の語が keyword の前方一致になったところで終わる。
- keyword:
  - camelCase で、大小を区別しない前方一致。
  - 候補が一意なら採用する。複数あっても、語数が最少のものが一意なら採用する。
  - 同じ keyword を 2 回書くと error。
- Enum も前方一致する。完全一致を優先し、ambiguous なら error。
- spec 省略可の引数 (`Or(Objects, Empty)`) を扱える。`color red` や `color byhetero` は spec 無しで全体に効く。

### 3.4 atom spec の変換 (`_atomspec.peg`)

PR 1 で扱う範囲:

- 階層の指定:

  | ChimeraX | CueMol |
  |---|---|
  | `#1`、`#1,3-5` (model) | model 番号の表で object を決める |
  | `/A,B` (chain) | `chain A,B` |
  | `:10-20,30`、`:10A`、`:10A-20B` (残基番号) | `resi 10:20,30`、`resi 10A`、`resi 10A:20B` |
  | `:ALA`、`:5HT` (残基名) | `resn ALA`、`resn 5HT` |
  | `@CA,CB` (原子) | `name CA,CB` |

  階層同士は `&` で結合する。
- **残基番号か残基名かの判定** は ChimeraX `atomspec.py` の `_Part._parse_as_res_id` と同じにする。
  - 範囲の両端それぞれが `^[-+]?\d+[A-Za-z]?$` に当たれば、残基番号として読む。末尾の 1 文字は insertion code。
    ChimeraX は `int(n)` を試し、失敗したら `int(n[:-1])` と末尾 1 文字の insertion code として読む。
  - 当たらなければ残基名 (`resn`) として読む。
  - CueMol 側の構文は、`scanner_sel.lxx` の `SEL_INSRES` (`[-+]?(0|[1-9][0-9]*)[a-zA-Z]`) と、
    `parser_sel.yxx` の `SEL_INSRES SEL_COLON SEL_INSRES` などの範囲。
    数字部分は整数に直して出す (先頭の 0 を落とす。`SEL_INSRES` は `010A` を受け付けないため)。
  - 範囲の端の `start` / `end` (`:start-20`) は、CueMol に片側だけの範囲が無ければ PR 1 では断る。
- wildcard の `*` と `?`。
- 論理演算 `&` `|` `~` と括弧。ChimeraX と同じく優先順位は無く、右結合で読む。
- selector: `all`、`sel`、`protein`、`nucleic`、`ligand`、`ions`、`solvent`、`backbone`、`sidechain`、
  `helix`、`strand`、`coil`、元素記号。既存の global alias か、その場の展開に写す。
- emit は全項を括弧で包む (PyMOL 側 `sel/emit.ts` と同じ考え方。コードは共有しない)。

範囲外のもの (`#1.2` の submodel、zone `@<` / `:<`、`::attr` / `@@attr` の属性 test、`[..]` の wildcard、
IDATM 型などの selector) は、caret 付きの「not supported yet」で断る。parser には文法として入れておき、
emit の側で断る。こうしておけば、後で対応するときは emit だけの変更で済む。

### 3.5 状態は scene の中だけに置く (undo / redo は op に任せる)

ChX の表示状態は、**scene の中の `chx:` renderer そのもの** (sel と paint) とする。
dialect はメモリにも、別の保存先にも、表示状態の写しを持たない。

- コマンドのたびに、対象 object の `chx:` renderer の sel と paint を読み、結果を op で書き戻す。
- op はすべて submit の undo txn の中で走る。scene が undo / redo で戻れば、ChX が次に読む状態も一緒に戻る。
  GUI の Cmd+Z でも、console の `undo` でも同じ。
- ChX のための undo の仕組みは別に作らない。
- 編集はすべて op として action log に残る。qax を再生すれば、ChX で作った表示がそのまま再現する。
- GUI で `chx:` renderer の sel や paint を変えた場合も、それがそのまま次の ChX コマンドの出発点になる
  (ずれる元の状態が無い)。

### 3.6 model 番号

- ChimeraX の `#N` は open 順に振られ、close しても詰めない。
- 表 (`objUid -> N` と、次に振る番号) は、worker のメモリに置く**補助表**とする。scene の状態ではない。
  - 引くときに、uid が scene に無ければその entry は無いものとして扱う。undo で消えた object を指さない。
  - 初見の object (GUI で開いたもの、undo / redo で戻ったもの、開き直した scene のもの) には、
    scene 内の順で次の番号を振る。
- 制約として doc に書くこと: scene を保存して開き直すと、番号は振り直しになる (ChimeraX の session とは違う)。
  - 番号は表示の状態ではなく、名前の付け方にすぎない。振り直しても表示は壊れないので、保存はしない。

### 3.7 表示モデルと色

- **renderer**: object に最初に ChX のコマンドを使うとき (`open` の直後を含む)、
  atom 用の 3 つと cartoon 用を**まとめて作る**。表示しない間の sel は `none`。
  dialect が所有する renderer (名前の頭が `chx:`) にだけ書き込み、それ以外の renderer には触らない。

  | renderer | 種類 | sel の意味 |
  |---|---|---|
  | `chx:stick`、`chx:ball` | `ballstick` | その style で表示中の原子 |
  | `chx:sphere` | `cpk` | その style で表示中の原子 |
  | `chx:cartoon` | `ribbon` (核酸は `nucl` を添える) | ribbon を表示する残基 |

- **show / hide / style / cartoon** は、renderer の sel を合成して書き換える (`set_renderer_selection`)。
  合成のしかたは PyMOL dialect と同じで、show は OR、hide は AND NOT。
  - `show <spec> atoms`: spec の原子のうち、まだどの atom renderer にも入っていないものを `chx:stick` に足す。
  - `hide <spec> atoms`: 3 つの atom renderer すべてから spec を引く。
  - `style <spec> <s>`: 表示中の原子のうち spec に当たるものを、他の 2 つから引いて `<s>` に足す。
- **color**: atom 系の target (a / b) は、3 つの atom renderer の paint に同じ entry を入れる
  (`add_paint_at` で先頭に挿入する)。
  - paint への切り替え (`set_renderer_coloring` の `paint-type-paint`) は、renderer がまだ PaintColoring でないときだけ行う。
    判定は `getRendererPaintInfo(...).canPaint`。`rendererOps.ts` の既存の着色 op と同じ条件にする。
  - 理由: `setRendererColoring` (`services/coloring/applyColoring.ts`) は呼ぶたびに `createDefPaintColoring` で新しい表を作って置き換える。
    毎回切り替えると、`color /A red; color /B blue` の 2 回目で A の赤が消える。
  - renderer はまとめて作るので、作った直後に 1 回だけ paint に切り替える形にしてもよい。
  cartoon 系の target (c / r) は `chx:cartoon` に入れる。
  - renderer を最初にまとめて作るので、`color red target a` の後に `style sphere` に切り替えても赤のまま
    (色が別の renderer に取り残されない)。
  - `byhetero` / `byelement` は、元素ごとの entry をまとめて入れる。
- **制約 (doc に書く)**: CueMol に原子ごとの表示フラグは無い。どの原子を描くかは renderer の sel だけで決まる。
  そのため、**非表示の原子の style は保持しない**。
  - 例 1: `style :ALA sphere` -> `hide :ALA atoms` -> `show :ALA atoms` では、ALA は既定の stick で出る。
    ChimeraX では sphere で出る。
  - 例 2: `style :ALA sphere` を ALA が非表示のうちに打つと効かない。
  - 直すには、もう一度 `style` を打つ。データは壊れない。
  - 保持するには、style ごとの原子集合を scene の名前付き selection に保存すればよい (`define_selection` op)。
    ただし selection の一覧が散らかり、状態も増えるので、PR 1 ではしない (§5 の候補にする)。
- ChimeraX の細かい規則は後続に回す。cartoon 表示中の残基で backbone 原子を隠す規則、
  `open` 直後の auto style の完全な再現などがこれに当たる (§5)。
  PR 1 の `open` は、cartoon と、ligand を stick で表示する簡易な既定にする。

### 3.8 基本コマンド (PR 1 で実装するもの)

| コマンド | 内容 |
|---|---|
| `open` | ファイル、4 文字の PDB ID の fetch (mmCIF)、`.cxc` スクリプト |
| `close` | `[models]` |
| `show` / `hide` | `[spec] [atoms\|cartoons\|models]`、`target a/c/r/m` |
| `cartoon` / `cartoon hide` | `[spec]` |
| `style` | `[spec] stick\|ball\|sphere` |
| `color` | `[spec] <色名 \| #hex \| byhetero \| byelement>`、`target` |
| `view` | `[spec]` (spec が無ければ全体に fit) |
| `delete` | `atoms` |
| `undo` / `redo`、`help`、`usage` | |

registry にあるコマンドでも、keyword を未実装にしたものは受け付けて `<cmd>: <keyword> is not supported yet; ignored`
と warn する。registry に無いコマンドは unknown command の error にする。

### 3.9 op catalog の使い方

今のアーキテクチャでは、op catalog (`renderer/worker/server/catalog/ops/*.ts`) が名前で呼ぶ操作の共通の定義で、
実行の入口は `invokeOp` だけ。agent の tool、MCP、native console はここを通る
(`docs/architecture/op-catalog.md` §1、§3)。一方で GUI と PyMOL dialect は、その下の worker service を
直接呼んでいる。GUI は設計上そうしており、PyMOL dialect は経緯でそうなっている。
ChX は前者 (op を通る側) に揃える。

- **規則**: ChX のコマンドは op を `invokeOp(op, ctx, args, opContextOf(cc, '<cmd>'))` で呼ぶ
  (`runtime/opContext.ts`。native の `fromCatalog.ts:470` と PyMOL の `rayCommands.ts:69` と同じ呼び方)。
  1 つの ChX コマンドが複数の op を順に呼んでよい。全体は submit の txn の中で走る。
- **op が無い操作**: 先に op を catalog に足してから使う。足した op は `expose` で console / MCP にも出す。
  agent に出すかは `docs/architecture/op-catalog.md` §3.1 の基準で決める。
  - service を直接呼んでよいのは、op-catalog.md §3.1 の基準で op にしないもの (表示の補助や読み取り専用の補助など) だけ。
    その場合は理由をコードの comment に書く。
  - scene への書き込みは、すべて op を通す。表示状態は scene の中の `chx:` renderer そのもの (§3.5) なので、op の外に書く状態は無い。
    model 番号の表 (§3.6) は scene の状態ではない補助表で、書き込みに当たらない。
- **基本コマンドと op の対応** (いずれも既存の op):

  | ChX のコマンド | 使う op |
  |---|---|
  | `open` (ファイル / PDB ID) | `load_file`、`fetch_pdb`。読み込み後に `delete_node` で preset の renderer を除くか、preset 無しで読む引数があればそれを使う (実装時に `fileOps.ts` で確認する) |
  | `close` | `delete_node` |
  | `show` / `hide` / `cartoon` / `style` | `create_renderer` (`chx:*` の初回作成)、`set_renderer_selection`、`set_visible` |
  | `color` | `set_renderer_coloring` (paint への切替え)、`add_paint_at` (先頭に挿入) |
  | `view` | 範囲は ChX が求め、`set_view` で center と zoom を書く (下記) |
  | `delete` | `delete_atoms` |
  | 状態の読み取り | `get_scene_state`、`list_paint`、`count_selection` |

  - **`view` は新しい op を作らず、ChX の中で範囲を求めて、既存の `set_view` op で center と zoom を書く**。
    - 既存の op がそのまま使えない理由:
      - `focus_node` は node を 1 つしか取らない。
      - `center_view` は MolCoord 1 つが対象で、object の現在の selection も書き換える。
      - 順に呼ぶと、最後の対象にだけ fit してしまう。
    - 対象は object ごとの CueMol の式にする。ChX は atom spec を object ごとの式に翻訳する。
      §3.4 の emit は、model の指定を object の選択として扱い、残りを object ごとの式にする。
      - 例: `view (#1/A | #2/B)` では、#1 に `chain A`、#2 に `chain B` を使う。
      - 全対象で共通の式 (`chain A or chain B`) にすると、#1 の B まで範囲に入ってしまう。
    - 範囲は、object ごとの選択原子の座標の min / max を合成して求める。
      - 範囲を求めるのは読み取り専用の補助なので、§3.9 の例外として service か C++ の API を直接使う。
      - 使える API があるか (MolCoord の bound box の取得など) は実装時に確かめる。無ければ読み取り用の helper を足す。
      - object の selection は変えない。
    - ChimeraX `view` と同じく、向きは変えない (`std_commands/src/view.py`)。
      `set_view` に `center` と、範囲の大きさから求めた `zoom` を渡す。
      **`slab` も同じ呼び出しで渡す**。範囲の視線方向の厚さから求める。
      - 渡さないと、`set_view` は今の slab を保つ (`viewXform.ts` は slab が指定されたときだけ書く)。
        小さな領域に寄った後で全体を `view` すると、画面には収まっても手前と奥が切れたままになる。
      - 既存の `MolCoord::fitView` (`MolCoordGeomImpl.cpp` の `setSlabDepth(bbox の z の幅)`) と同じ求め方にする。
        ChimeraX の `view` も near / far の clip を合わせ直す (`view.py` の `view_objects`)。
      camera の変更は undo しない (`set_view` は `mutates: false`)。
    - 複数 object の範囲に fit する公開 op は作らない。作ると catalog に構造化した引数の種類を足す必要があり、
      MCP の schema・native console の引数変換・selection の検査・qax の記録まで広がる (第 3 回のレビュー #3)。
      MCP / agent から要望が出たら、§5 の候補から別途作る。
  - 「preset 無しで読む」引数が `load_file` / `fetch_pdb` に無ければ、op に引数を足す。
    service を直接呼ぶ形にはしない。
  - 実装中に op の粒度が合わないもの (例: 1 つの paint 表に複数の entry をまとめて入れたい) が出たら、
    その op の引数を拡張するか、新しい op を足す。
- **操作の記録**: op を通った編集は、service 側の `recordOp` で native の op として action log に残る。
  qax に書き出すと native で再生できる (`docs/architecture/action-log.md` §2.2)。
  ChX 独自の記録形式は作らない。
- **PyMOL dialect は今回は op に載せ替えない**。63 コマンドに及び、挙動を変えずに移すには別の計画が要る。
  ChX が足した op は PyMOL からも使えるので、載せ替えるときの足場になる。

### 3.10 レビューへの対応

1 回目のレビュー:

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 [P1] | worker のメモリの表示状態が undo / redo に追従しない | **有益** (当時の設計の実際の欠陥) | 表示状態の写しを持つのをやめ、scene の `chx:` renderer そのものを状態とする (§3.5)。編集はすべて op なので、undo / redo はそれで足りる。ChX 用の undo の仕組みも、新しい保存先も作らない |
| 2 [P2] | 非表示の原子の style を復元できない | **問題はあるが実益が小さい** | 対応しない。§3.7 に制約として書く。起きるのは「style を変えた原子を隠して、また表示する」順のときだけで、結果は既定の stick になるだけ。`style` を打ち直せば直り、データも壊れない。保持するには状態を scene に別に持つ必要があり、その代償 (selection 一覧が散らかる、状態の二重化) に見合わない。要望があれば §5 の候補から対応する |
| 3 [P2] | style を切り替えると色が失われる | **有益** (よくある操作順で起き、気付きにくい) | atom 用の renderer を最初にまとめて作り、atom 系の色は 3 つに同じ entry を入れる (§3.7)。状態を増やさずに済む |
| 4 [P2] | `view` の対応先の op では複数 model を fit できない | **有益** (引数なしの `view` は最もよく使うコマンドの 1 つで、selection を書き換える副作用も実害がある) | ChX の中で範囲を求め、`set_view` で書く (§3.9。第 3 回のレビューを受けて、新しい op を作る案から変更) |
| 5 [P2] | insertion code を残基名と誤読する | **有益** (誤った原子を選んでしまう。直すのも安い) | 判定を ChimeraX の `_parse_as_res_id` と同じにする (§3.4) |

2 回目のレビュー:

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 [P2] | paint への切り替えを毎回行うと、前の着色が消える | **有益** (連続した `color` という最も普通の使い方で起きる。`setRendererColoring` が毎回新しい表を作ることをコードで確認した。直すのは条件分岐 1 つ) | 未切り替えのときだけ切り替える (§3.7)。テストを 1 件足す |
| 2 [P2] | `fit_view` の selection が全対象で共通なので、`view (#1/A \| #2/B)` を表せない | **有益** (誤った範囲に fit してしまう) | 範囲を object ごとの式で求める (§3.9)。op は作らないことにしたので、引数の問題は ChX の中で閉じる。テストの条件を足す |

3 回目のレビュー:

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 [P2] | 補完の書き戻し (区切り・keyword の表記・quote) が PyMOL の文法のまま、補完のエンジンに残る | **有益** (このまま PR 1 に入ると、ChX の補完結果が実行できない。PR 0b で境界を決めないと、分離をやり直すことになる) | `DialectSyntax.complete` で dialect が補完の書き戻しまで持つ (`op-catalog.md` §5)。ダミー dialect のテストを「補完した行が実行できる」に強める |
| 2 [P2] | CLI が script を本文で送るかパスで送るかを、dialect の宣言では表せない | **有益** (固定表を外すと `.qax` の CLI 実行が壊れる。`inputs.ts` で確認した) | meta の `scripts` に `submit: 'text' \| 'path'` を持たせ、`path` は `/console/run` の `scriptPath` で送る (`local-api-server.md` §5) |
| 3 [P2] | `fit_view` の構造化した引数を表す種類が catalog に無い | **指摘は正しいが、op を作らない方が安い** | 公開 op はやめ、ChX の中で範囲を求めて既存の `set_view` を使う (§3.9)。catalog・MCP・qax への波及を避ける。公開 op は要望が出たら別途作る |
| 4 [P2] | registry 化で `CONSOLE_SOURCES` から `'qax'` が落ちる | **有益** (`open_log` 中の qax 再生が記録されなくなる退行。直すのは 1 行) | meta の source に `'qax'` を加えて作ると明記する (`op-catalog.md` §5) |

4 回目のレビュー:

| # | 指摘 | 判断 | 対応 |
|---|---|---|---|
| 1 [P2] | `view` で slab を渡さないと、手前と奥が切れたままになる | **有益** (寄った後の `view` という普通の操作で表示が欠ける。`viewXform.ts` が slab を指定時だけ書くこと、`MolCoord::fitView` が slab も合わせることを確認した。既存の op の引数で直せる) | 範囲の視線方向の厚さから slab を求め、同じ `set_view` に渡す (§3.9)。テストの条件に足す |
| 2 [P2] | PR 0 の検証に CLI / console-kit のテストと型検査が入っていない | **有益** (PR 0 で変える `scriptPath` と dialect 一覧の契約が、列挙した検証では一度も走らない。既存の task を足すだけ) | `task test_tritium_cli` を §7 の PR 0 と PR 1 の検証に足す |

## 4. 分離の規則 (守ること)

- `dialects/chimerax/` が import してよいもの:
  - `runtime/` と `parser/` の公開型
  - `completion/` の型
  - `shared/dialectMeta.ts`
  - op catalog (`@renderer/worker/server/catalog` の op と `invokeOp`)
  - worker service の直接呼び出しは、§3.9 で例外とした読み取り専用の補助だけ
- **`dialects/pymol/` と `dialects/native/` は import しない**。逆に、それらと runtime は `dialects/chimerax/` を import しない。
- runtime と completion のエンジンには、特定の dialect の名前や文法を書かない (`op-catalog.md` §5)。dialect ごとの違いは `DialectSyntax`、dialect meta、`ConsoleCommand` の flag で表す。
- 上の規則は eslint の `no-restricted-imports` (ディレクトリごとの override) で機械的に検査する。
  `dialects/chimerax/` からの `@renderer/worker/server/services/*` の import も、§3.9 で例外としたものを除いて禁止する。
- ChX を外すときは、`dialects/chimerax/` を消し、§3.1 の 2 行を消せば済む。
  ChX で作った scene には `chx:` renderer が普通の renderer として残る。ChX が無くても、GUI でそのまま扱える。
- 別の plugin に切り出す場合は、`DIALECTS` / `DIALECT_METAS` を plugin 間の寄与点にすれば、ディレクトリをそのまま移せる。
  今の plugin host (`renderer/plugin-host/types.ts` の `contributes`) は plugin 間の寄与点を持たないので、これは必要になったときに行う。

## 5. 後続のコマンド拡充 (今回はやらない)

基盤が入った後は、コマンドを 1 つ足すたびに次の 3 つだけを触る:

- `commands/<領域>.ts` の追加
- `registry.ts` への 1 行
- 必要ならテスト 1 件

op が足りなければ、先に catalog へ op を足す (§3.9)。その op は MCP / agent / native console でも使える。

候補と、調査で分かったことを下に残す。

**CueMol の既存機能で実装できるもの**

| 候補 | ChimeraX の意味 | CueMol での実装 |
|---|---|---|
| `view matrix camera` (12 数値) | 3x4 行優先で、列 0-2 が camera の軸、列 3 が位置。camera は -z を向く。既定は透視投影で水平 FOV 30° | `center = t + d·v`、`rotation = quat(Rᵀ)`、`zoom = 2·d·tan(15°)/aspect` |
| `zoom pixelSize p` | cofr (表示中の bbox 中心) での Å/px が p になるよう、camera を視線方向に動かす | center を固定して `distance` と `zoom` を比例で変える |
| `save x.png` | 既定サイズは view のサイズ。`supersample` は jitter AA | `export_image` op。CueMol は常に supersample するので、`supersample` は受け付けて無視する |
| `graphics silhouettes` | view 全体の輪郭線 | `chx:` renderer の `egtype=silhouette`。impostor で効くかは要確認 |
| `color` の `bychain` / `bymodel` / `random`、`rainbow` | | paint entry、`RainbowColoring` |
| `cartoon suppressBackboneDisplay`、backbone を隠す規則 | cartoon 表示中の残基では N / C / O を隠す。CA は側鎖が表示されていれば残す (molc.cpp:1450) | stick の sel から差し引く |
| `open` 直後の auto style (small polymer) | model 色 (#1 は tan) と元素色、ligand とその 3.6 Å 以内の残基を stick、金属は sphere | |
| `turn` / `move` / `cofr` / `select` / `surface` / `transparency` / `label` / `set bgColor` / `info` / `distance` / `align` / `matchmaker` / `name` / `alias` | | |
| atom spec の zone / 属性 test / submodel | | |
| 複数 object の範囲に fit する公開 op (`fit_view`) | | `targets: { objId, selection? }[]` の構造化した引数の種類を catalog に足し、MCP の schema・native console の引数変換・selection の検査・qax の記録 (objId を再解決できる形) を揃える |
| 非表示の原子の style の保持 (§3.7 の制約) | `hide` しても style を覚えていて、`show` で元の style に戻る | style ごとの原子集合を、scene の名前付き selection に保存する (`define_selection` op) |

**CueMol 側の機能追加が先に要るもの**

| 候補 | CueMol の現状 | 必要な実装 |
|---|---|---|
| `lighting` (preset、光源の強度、`shadows`、`multiShadow` AO、depth cue) | 光源は shader に hard-code されている。影は無く、AO は画面空間の GTAO だけ。fog は常に on で、開始位置を動かせない | 光源の uniform 化と property 化、shadow map、多方向 shadow による AO、fog の property 化 |
| `windowsize w h` | canvas の大きさは DOM の layout だけで決まり、View の `width/height` は読み取り専用 | 3D 領域を指定の px にする renderer -> main の IPC |
| `clip near/far/position` | `center` を中心とした対称な `slab` が 1 つあるだけ | View に near / far の offset を独立して持たせる (C++ `GUIView::computeSlabPlanes`) |

## 6. ドキュメント

- この plan は `docs/plans/261103-chimerax-console-plan.md` (`_index.md` に登録済み)。
- PR 1 のマージ時:
  - `docs/architecture/console-chimerax-dialect.md` を新設する。内容は位置づけ、文法、atom spec の変換表、model 番号、表示モデル、コマンド表、分離の規則。
  - `docs/architecture/_index.md` に 1 項目足す。
  - `op-catalog.md` §1 の構成図と依存の向きに ChX を足す (op を通る呼び出し元として)。PR 1 で足した op があれば §6 以降の op 一覧にも書く。
  - plan からは済んだ項目を削り、§5 だけを残す。
- UXP に無い機能なので、migration の ADR / mapping は対象外。

## 7. 検証

**PR 1**

1. `cd build_scripts && task build_tritium`。前のアプリが残っていないか `pgrep -fl "tritium/node_modules/.pnpm/electron"` で確かめ、残っていれば終了させてから `task run_tritium` で起動マーカーを確認する。
2. console の segment か `chimerax` の入力で切り替え、`task inspect_tritium_ui -- --target console` で表示を確認する。
3. `task run_tritium_cli -- --dialect chimerax -c 'open 1crn; cartoon; col byh; show :ALA atoms; style stick; view'` などを流し、ユーザーに目視確認を依頼する。フィードバックを反映して 1-3 を繰り返す。
4. 挙動が確定したらテストを書く (最小集合):
   - `cli/resolve.test.ts`: 登録順の前方一致 (`col`、`del`)、複数語のコマンド、`#` コメント
   - `cli/bind.test.ts`: 位置引数から keyword への遷移、keyword の大小無視・前方一致・ambiguous、spec の省略 (`col byh`)、FileName が `\U` を escape しないこと
   - `spec/translate.test.ts`: 階層・範囲・insertion code (`:10A`、`:10A-20B` は残基番号、`:5HT` は残基名)・`& | ~` の結合と、範囲外の語の拒否 (表駆動で 1 件)
   - `display.test.ts`:
     - show / hide / style / cartoon から `chx:` renderer の sel が合成され、他の renderer に触らないこと
     - `color red target a` の後に `style sphere` に切り替えても赤のままであること
     - `color /A red; color /B blue` で A の赤が残ること (paint への切り替えが 2 回目に起きないこと)
     - 状態を renderer から読み直す契約: renderer の sel を外から書き換えた後の `show` が、書き換え後の sel を出発点にすること (undo / GUI の編集に追従することの pin)
   - model 番号の表: close の後も番号を詰めないこと。scene に無い uid の entry を引かないこと
   - `view` のテスト: object ごとの式の範囲をまとめて、`set_view` を 1 回だけ (center・zoom・slab を一緒に) 呼ぶこと。object の selection を変えないこと
     (`view (#1/A | #2/B)` のとき、#1 の B を範囲に含めないこと)
5. 分離の確認: `dialectMeta.ts` と `dialects/index.ts` から chimerax の行を外しても、型検査と既存テストが通ること。PR の前に手元で 1 回確かめる (テストにはしない)。
6. `npm test`、`tsc` (web / node)、`task test_tritium_cli`、`task lint_tritium_style`、eslint (§4 の import 規則)
