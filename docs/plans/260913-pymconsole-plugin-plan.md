# pymconsole plugin (PyMOL コマンド互換コンソール、Python embedding なし)

Status: **Phase 1 + Tab 補完 (Phase 1.5) + Phase 2 実装済み** (`tritium/react-gui/src/plugins/pymconsole/`)。
Phase 3 は未着手。
関連: [pym console 調査報告](pymconsole-research-260529.md)、
[tritium plugin](../architecture/tritium_plugin/_index.md)、
[AI agent plugin](../architecture/ai-agent-plugin.md)。

## 背景

PyMOL ユーザーが analogy で tritium を使えるように、PyMOL コマンド言語に**部分互換**の
コンソールを built-in plugin `pymconsole` として追加する。完全互換は非ゴール。

[調査報告 260529](pymconsole-research-260529.md) は「パーサを embedded Python
(`src/python/cuemol/pym/`) に置き、C++ に `runPymCommand` を足し、cuetty / tritium / pymod で
共有する」(案 A) を確定していたが、**本計画ではこれを採らない**:

- **Python embedding を使わない**。パーサ・ディスパッチャは **TS で Web Worker に置く**
  (調査報告の案 C)。tritium 単体で完結し、C++ 変更ゼロ、`PythonBridge.runString` の欠陥
  (戻り値 void / stdout がグローバルに差し替え済み / GIL) を一切踏まない
- cuetty / pymod との「同一コマンド体系の共有」は**非ゴールに変更**。C++ plugin レーンが
  入った時点で再検討する
- 調査報告の §3 (selection 翻訳の分析・token 対応表)、§4 (200 コマンドの写像総表)、
  §6 (Tier 分け)、§8 (概念差分と吸収方針) は**そのまま設計の正本**として使う

土台は AI agent plugin。「worker 内で既存 service を `fn(ctx, args)` で直呼び / 1 操作 = 1 undo txn /
変更したら commit・read-only は rollback / service 結果 3 方言の吸収 / module store /
`TextAreaField onSubmit` + IME guard / LRU 履歴」を流用し、LLM 層だけを外した形。

## 決定事項

| 論点 | 決定 |
|---|---|
| UI 配置 | **bottom tab** "PyM" (`after: 'output'`) |
| plugin id | `pymconsole` / 表示名 "PyM Console" / `defaultEnabled: false` (実験的) |
| `show`/`hide` の写像 (Phase 2) | **object x rep ごとに代表 renderer 1 つ**。show = sel の和集合、hide = 差集合 |
| `select name, expr` (Phase 2) | `saveSelDef` で alias 登録 + `applyMolSelString` で可視化 |
| 初回 PR | **Phase 1** (parser + console UI + selection 不要の Tier 0 コマンド) |

## Phase 1 の実装

### パーサ (PyMOL の移植)

`~/ext/pymol-open-source/modules/pymol/{parsing,parser,shortcut}.py` からの移植。**独自拡張なし**。

| ファイル | 移植元 | 内容 |
|---|---|---|
| `parser/splitCommands.ts` | `parser.py:237-330`, `parsing.split()` | `\` 継続、`#` コメント、`;` 分割 (quote / 括弧の中は分割しない)、`_ ` / `/` / `@` の prefix |
| `parser/parseArgs.ts` | `parsing.parse_arg` | `,` 区切り、`name=value`、nester (`(...)` は内側の `,` ごと 1 引数)、引用、空引数、`literal1` |
| `parser/bindArgs.ts` | `parsing.prepare_call` / `dump_arg` | STRICT / LEGACY 展開 / `?` usage / 必須欠落。エラー文言も PyMOL と同じ |
| `parser/commandLookup.ts` | `shortcut.py:129-160` | 完全一致 -> 一意な前方一致 -> underscore 略記 (`b_c` -> `bg_color`) |

移植して分かった細部: `zoom (chain A` (閉じ括弧なし) は PyMOL でも**エラーにならず**素の文字列として
通る。`syntax error (type 1)` になるのは `((chain A)` のように閉じ括弧があって数が合わないとき。
test でこの 2 つを区別して pin してある。

### 実行 (`worker/runCommand.ts`)

**1 submit = 1 service 呼び出し = 1 undo txn**。commit 規則は agent plugin と同じ:

- 変更があった -> **commit** (後続が失敗しても)。C++ `rollbackTxn` は見えた変更を巻き戻すため
- 何も変更していない -> **rollback**。空 txn の commit は redo スタックを消すため
- 失敗したら**残りを中止**。1 txn の中で継続すると Cmd+Z の単位が説明できなくなる

`undo` / `redo` は txn の中では実行できないので runner が名前で intercept し、txn を閉じてから実行する。
worker が持つ module 状態は **`cwd` 1 つだけ**。

### コマンド (Tier 0 = selection 不要、21 本)

`load` `fetch` `delete` `set_name` `cd` `pwd` `ls` / `enable` `disable` `get_names` /
`zoom` `center` `reset` `turn` `move` `view` `refresh` / `set` `get` `unset` `bg_color` /
`png` `undo` `redo` `quit` `help`

- PyMOL の signature はソースから転記。**PyMOL に無い引数は足さない**。CueMol に対応の無い
  PyMOL 引数 (`state` / `format` / `animate` / `ray` ...) は spec に載せて受け取り、
  ユーザーが既定以外を渡したときだけ `warn` で「ignored」と出す (位置引数のズレも防げる)
- `load` の `format` はリーダーを明示指定し、拡張子 / content sniff を飛ばす。PyMOL の `load` は
  **拡張子だけ**で形式を決め content sniff を持たない (`importing.py` の `filename_to_format`)。
  同じ拡張子を共有する形式は形式名で指定するしかなく、特に structure-factor CIF は座標 CIF と
  `*.cif` を共有するうえ PyMOL には両者を分ける形式名が無い (`cif` が両方) ので、CueMol の
  リーダー名 `mmcifmap` を直接受け取る。受け付ける値は**登録済みリーダーを実行時に読む**ので、
  C++ にリーダーが増えてもこのファイルは変えなくてよい。PyMOL の形式名
  (`cif` `ccp4` `map` `mrc` `xplor` `mol` `top` `ent`) は別名表で写す
- `load` が作る renderer は**オブジェクトの種類で選ぶ**。共通の既定は object の種類に関係なく
  `simple` (分子の線表示) で、C++ `Object::createRenderer` は互換性を検査しない
  (`isCompatibleObj` は GUI に出す一覧を作るためだけに使われ、生成の門番にはなっていない) ため、
  density map に SimpleRenderer が付いて**何も描かれない**状態になっていた。分子は PyMOL に合わせて
  `simple` (PyMOL の `auto_show_lines`)、それ以外は `getCompatibleRendererNames` が返す先頭
  (map なら `contour`、surface なら `molsurf`)。C++ の一覧はアルファベット順なので分子で先頭を
  採ると `anisou` になってしまう点に注意。libcuemol2 側でガードする案は、`.qsc` 読み込み
  (`Object::readFrom2` は `createRenderer` を通らない) など影響範囲が読めないので採らない
- 名前 -> uid は `resolveObjects` (`listSceneObjects` + 完全一致 / `all` / glob)
- `zoom` / `center` に object 名を渡さない (= `all`) 場合、CueMol に「全 object を包む fit」が
  無いので**最初の object に fit して warn** する
- 色は `commands/pymolColors.ts` (PyMOL の `layer1/Color.cpp` から生成した 187 名 + `greyNN` 計算)。
  **PyMOL が再定義している CSS 名** (`aquamarine` は PyMOL では (0.5,1,1)) も表に入れて PyMOL 側を
  優先し、表に無い名前は `ColCompiler` に素通しする
- `set` / `get` / `unset` は `getGenericProps` で entry を引いて型を確定してから書く。PyMOL 設定名の
  alias 表は **2 行だけ** (`bg_rgb`、`orthoscopic`)。長い表は property 一覧の不完全な二重化になるため

### renderer

- `PymConsolePanel` (bottom tab) = toolbar + transcript + prompt
- prompt は **`TextAreaField submitKey="enter"`**。`TextField` に IME 安全な `onSubmit` が無いのと、
  script の貼り付けに複数行が要るため。Shift+Enter で改行
- ↑/↓ の履歴 recall はキャレットが先頭行 / 最終行にあるときだけ (`isImeKey` で変換中は素通し)
- bottom tab は非アクティブ時に unmount されるので、transcript と draft は module store
  (`consoleSessionStore`)、runner は Root (`PymConsoleRoot`) に置く

### core への昇格 (plugin id を書かない汎用のもの)

| 昇格したもの | 移動先 | 理由 |
|---|---|---|
| `normalizeServiceResult` | `worker/shared/serviceResult.ts` | service 結果 3 方言の吸収。agent と 2 consumer |
| `buildHeadlessFileOpenOptions` | `worker/server/services/file/headlessOpen.ts` | ダイアログ無しで `FileOpenOptions` を組む唯一の経路。`worker/shared/fileOpenDefaults` に置けないのは、そこが renderer からも import されるため |
| recall ロジック (`RecallState` / `recallUp` / `recallDown`) | `renderer/utils/commandRecall.ts` | agent の composer と console の prompt で 2 consumer。agent の `promptHistory.ts` は storage だけ残す |
| `panel.pymconsole` icon key | `h3-kit/primitives/appIcons.ts` | `AppIconKey` は閉じた union |

## AI agent tool との共有化は「今はやらない」

将来 agent の tool 定義と console の command 定義を TS 側で共有したい、という要望があるが、
**この計画では共有層を作らない**。

**理由**: (a) 重なる操作は agent 側に既に動いて test もある実装があり、共有コードは console 側ではなく
agent 側から出てくるのが自然。今 console だけを見て形を決めると後で agent をその形に曲げる作業になる。
(b) 引数モデルが構造的に違う (agent = JSON Schema で型付き・名前指定のみ / console = 全部文字列、
位置とキーワード両対応、`LEGACY` 展開あり、`set` は対象の property 型を引かないと coerce できない)。
粒度の向きも逆 (agent は 20 本上限で畳みたい、PyMOL は名前を増やす)。共通なのは `mutates` と
「既存 service を呼ぶ本体」と結果正規化の 3 つだけ。(c) 判断基準は「仮説の consumer か、今日 2 つある
consumer か」— 後者 (上表の 3 つ) だけを core へ移した。

**代わりに入れた規則**: **command の `run` 本体に PyMOL 固有の関心を持ち込まない**。文字列パース・
`name=value` 展開・PyMOL 設定名の alias 表・PyMOL 語彙のエラー文言・selection 翻訳は `parser/` と
`commands/helpers.ts` に置き、`run` は「型に直して既存 service を呼ぶ」だけ。後の共有化が
**ファイル移動 + import 書き換え**で済み、書き直しにならない (`commands/types.ts` に明記)。

**着手の引き金**: agent の tool を増やす / 畳む作業が発生したとき / 同じ不具合を両方で直す羽目に
なったとき (最も明確な signal) / 3 つ目の consumer が出たとき。

**先送りのコスト**: Phase 1 の 21 command のうち agent tool と重なるのは 7 つ
(`load` `fetch` `set`/`get`/`unset` `enable`/`disable` `png` `zoom`/`center` `get_names`)。
ここで薄い adapter が二重になる (各数十行)。残りには agent 側の相手がいない。

## テスト (3 ファイル)

| ファイル | pin する契約 |
|---|---|
| `worker/parser/parse.test.ts` | `;` が quote / 括弧の中では切れない / `#` と継続行 / prefix / nester が 1 引数になる / `name=value` / `literal1` / 括弧不一致の 2 分岐 / STRICT と LEGACY / `?` usage / 前方一致と略記と曖昧 |
| `worker/runCommand.test.ts` | 変更ありは commit 1 回 / read-only は rollback / 途中失敗は残りを中止しつつ既変更は commit / 未知 command は scene を触らない |
| `renderer/PymConsolePanel.test.tsx` | submit が runner に流れ entries が行として出る / ↑ で直近の履歴が draft に入る |
| `worker/completion/complete.test.ts` | 完全一致コマンドが兄弟を列挙する / 略記 / 一意なら suffix / 共通接頭辞は厳密に長いときだけ伸びる / `[...]` 内の `,` を数えない / 値ソースに `argsSoFar` が渡る / エントリ無し・曖昧・ソース null の file fallback |
| `worker/completion/columns.test.ts` | 列優先レイアウト (行優先だと同じ文字数・同じ行数で並び順だけ狂う) |

書かなかったもの: 各 command の service forwarding (service 側 test が既にある)、色名表の総当たり、見た目。

## Phase 1.5 (実装済み): Tab 補完

PyMOL の補完を移植した。**独自 UI (ドロップダウン等) は作らない** -- 操作感覚が変わるため、
候補一覧は PyMOL と同じく transcript に印字する。

移植元と対応:

| ファイル | 移植元 |
|---|---|
| `worker/parser/shortcut.ts` | `shortcut.py` の `Shortcut.interpret`。`commandLookup.ts` はこれの薄い wrapper になった |
| `worker/completion/complete.ts` | `parser.py` の `_complete` + `complete_sc` (正規表現・fallback・印字文言まで) |
| `worker/completion/columns.ts` | `parsing.list_to_str_list` (幅 77 / margin 2 / **列優先**) |
| `worker/completion/sources.ts` | `completing.py` の候補ソース群 (`object_sc` / `selection_sc` / `setting_sc` / `color_sc` ...) |
| `PymCommand.completions` | `completing.py` の `auto_arg` 表 (`[source, description, suffix]`) |

**アルゴリズムの要点** (PyMOL のまま):

- Tab は**行全体を置換**し caret は行末へ。**繰り返しても cycling しない** (再度一覧を印字するだけ)
- コマンド位置 (行に `' '` も `'@'` も無い) は `prefixSearchOnExact` で検索するので、
  `set<TAB>` は補完せず `set set_name` を列挙する。一意なら `+ ' '`
- 引数位置は `,` の数で決める。**`[...]` の中だけ無視**し、括弧と quote は無視しない (PyMOL の癖)。
  引数は `prefixSearchOnExact` **無し**なので、完全一致する候補があればそれで確定する
- 一意一致のときだけ suffix (`''` / `' '` / `', '`) が付く。共通接頭辞まで伸ばす場合は付かず、
  **pat より厳密に長いときだけ**伸ばす
- コマンドの略記は正式名に書き換え、最後の `,` の空白を `, ` に正規化する
- エントリが無い / コマンドが曖昧 / ソースが `null` を返す → **ファイル名補完に fallback**
  (ディレクトリは `/` 付き、`$VAR` は環境変数)

**PyMOL からの逸脱は 2 つだけ**:

1. **`set <名>, <TAB>` で値を補完する**。PyMOL はここにエントリが無くファイル名を出す。
   enum なら `enumdef`、boolean なら `on`/`off` を候補にし、それ以外 (数値・文字列) は PyMOL と同じ
   fallback。`settingValue` ソースだけが `argsSoFar` を受け取るのはこのため
2. **`selections` ソースは Phase 1 では名前だけ**。PyMOL は selection キーワード (`chain ` `resi ` ...)
   も列挙するが、実行できない式に補完してしまうため。Phase 2 で翻訳器が入り、この逸脱は解消した
   (下記)

**入れなかったもの**: `Ctrl+D` (候補を印字だけする) は PyMOL でも 3D ビュー内蔵の overlay コンソール
(`Ortho.cpp`) だけの機能で、Qt の QLineEdit には無い。「一覧を見るだけ」は Tab の
「複数候補なら印字し、共通接頭辞が伸びなければ行を変えない」挙動で足りる。`Ctrl+Up` (prefix 履歴検索) は
macOS で OS (Mission Control) が横取りするため、入れるなら別キーの割り当てが要る。

**renderer 側**: `PymConsolePanel` の `handleKeyDown` で Tab を**常に消費** (focus 移動に使わない。
Shift+Tab は逃げ道として残す)。複数行 (script 貼り付け) のときは **caret のある行だけ**を送って置換する
(PyMOL のコマンドラインは 1 行なのでこの区別が無い)。候補一覧は `consoleSession.append` で印字 --
補完は runner を経由しない (undo txn を開かないため、`complete` は `runCommand` とは別 service)。

## Phase 2 (実装済み): selection 翻訳器 + Tier 1

### 翻訳器 (`worker/sel/`)

`tokenize.ts` -> `parse.ts` (再帰下降) -> `emit.ts` (**完全括弧付き** CueMol 式)、入口は
`translate.ts`。`-`/`+` の多義性は AST 経由でのみ解く (単独 token なら演算子、語中なら範囲 /
区切り)。未対応 token は位置付きエラー (caret 行付き)。

演算子優先順位は PyMOL `layer3/Selector.cpp` の `SELE_*` 下位バイトから採った:
selectors 0x80 > `not` 0x70 > `and`/`-` 0x60 > `or`/`+`/`in` 0x40 > `around`/`expand` 0x30 >
`byres` 0x20。CueMol `molstr/parser_sel.yxx` が**同じ順序**を宣言しているので、並べ替えは不要。
それでも AST を経由して全項を括弧で包むのは、両者の結合規則の差に依存しないため。

クラスマクロは **alias 登録ではなく翻訳時のインライン展開**。`setStrData` で global alias を登録
する案は worker 起動時の状態を scene に持ち込む (`.qsc` に保存され、ユーザ定義名に shadow される)
ので採らない。既存 global alias (`protein` `nucleic` `water` `helix` `sheet` `coil` `ligand`
`hydrogen`) はそのまま使い、`polymer` / `backbone` / `sidechain` / `guide` は式に展開する。

PyMOL の二項演算子 `within` / `near_to` / `beyond` は、**CueMol の `around` / `expand` との
交叉に展開**する。両者の `around` / `expand` の意味は一致していて (CueMol `SelAroundImpl2.cpp` は
expand で子ノード自身の原子を含み around で含まない、PyMOL `Selector.cpp` は `near_to` のときだけ
`base[4]` を除く)、したがって:

```
s1 within  D of s2  ->  (s1) and ((s2) expand D)
s1 near_to D of s2  ->  (s1) and ((s2) around D)
s1 beyond  D of s2  ->  (s1) and not ((s2) expand D)
```

未対応のものは**名前を挙げて理由付きで拒否**する (`neighbor` / `segi` / `index` /
`x`,`y`,`z` / `rep` / `color` など)。特に `neighbor` と `extend` は CueMol の parser を通るが
実装が無く**何も選択しない**ので、通してはいけない。

### コマンド

| ファイル | コマンド |
|---|---|
| `selectCommands.ts` | `select` `indicate` `deselect` `count_atoms` `get_chains` |
| `repCommands.ts` | `show` `hide` `as` `color` |
| `measureCommands.ts` | `distance` `angle` `dihedral` |
| `mapCommands.ts` | `isomesh` `isosurface` `isolevel` |
| `viewCommands.ts` (拡張) | `zoom` / `center` が object 名で当たらなければ selection として解釈 |

- **代表 renderer 規約** (`repCommands.ts`): object x rep ごとに `pym:<rep>` という名前の renderer
  1 つ。`show` は sel の和集合、`hide` は差集合、`as` は置換 + 他の `pym:` を非表示、
  `hide <rep>` (selection 無し) は renderer 自体を非表示。**prefix が本質** — GUI で作った
  renderer を console が書き換えないための境界
- **`select`** は alias 登録 (`saveSelDef`) と可視化 (`applyMolSelString`) の両方をやる。CueMol の
  named selection は式の別名であって固定の原子集合ではないので、`help` でそう明記した
- **計測** は selection をそのまま取り、**各 selection を重心 1 点として 1 本のラベル**を引く。
  PyMOL は原子の全組み合わせを回して組数ぶんラベルを引く仕様で、特に `dihedral` は `distance` の
  `cutoff` に相当する絞りが無く (既定 `mode=0` では結合チェックも無効)、4 つの 100 原子 selection で
  5000 万本になる。**この仕様は移植しない**。CueMol の `AtomIntrElem::AI_SEL` が元々重心を読む設計
  なので、それに合わせる。`mode` / `cutoff` は受け取って警告付きで無視する。
  ラベルは `helpers/atomintr` が描くので、マウスで取った計測と同じ label set に入る。
  数値は C++ の `getValue` から取る (画面のラベルと必ず一致する。TS 側で計算し直さない)
- **map**: `isomesh` -> `contour`、`isosurface` -> `isosurf` renderer を map object 上に作り、
  `siglevel` に level を書く。`isolevel <名>` は scene 中の同名 map renderer を探す。
  `selection` / `carve` / `buffer` は `MapRenderer` の mol boundary
  (`bndry_molname` / `bndry_sel` / `bndry_rng`) に写す。`getBndryBBox` が選択の bbox を range で
  膨らませた**直方体**にマーチング範囲を絞り (= PyMOL の `buffer`)、`inMolBndry` が range より遠い
  グリッド点を落とす (= `carve`)。**range が 1 つで 2 つの引数を兼ねる**ので `carve` 優先、無ければ
  `buffer` を使う (PyMOL も `Executive.cpp` で逆向きに同じ代入をしている)。両者を独立に指定すること
  だけができない。selection が無いときは中心まわりの箱で、新規 renderer の中心は view に合わせる
  (file-open と同じ `applyMapCenterPolicy`)。
  boundary は分子名 1 つを取るので、対象は**式が名指しした分子**、無ければ最初の分子 (警告付き) --
  `zoom` や計測と同じ規則
- **map の対象外**: PyMOL の `volume` と `isodot` は実装しない。`volume` は CueMol にも
  `gpu_mapvol` renderer があるので写せるが、`isodot` に相当する voxel ドット renderer は無く
  (調査報告 §5 では新規実装 250-350 行)、どちらも需要が薄いと判断した。
  `show volume` / `show dots` はその旨を返す

### C++ 側の追加 (`src/modules/molvis/`)

`AtomIntrElem` は元々 `AI_SEL` (selection = その重心) を持ち、`evalPos` が距離・角度・二面角の全描画
経路でそれを読む。にもかかわらず QIF に公開されていたのは距離の `append(sel, sel)` だけだった。
当初の設計意図どおり角度・二面角も selection を取れるようにする:

| 追加 | 場所 |
|---|---|
| `AtomIntrData` の 3/4 要素 selection ctor | `AtomIntrData.hpp` |
| `appendAngleBySelStr` / `appendTorsionBySelStr` | `AtomIntrRenderer.{hpp,cpp}` |
| `evalValue` (def を数値にする 1 箇所) と `getValue(id)` | 同上 |
| `appendAngle` / `appendTorsion` / `getValue` の公開 | `AtomIntrRenderer.qif` |

`appendSelImpl` が append 前に `evalValue` で評価を試し、**空 selection なら何も積まずに -1 を返す**。
以前は評価できない def が積まれて、毎回の再描画で黙って飛ばされていた。
serialization は要素ごとに汎用なので `.qsc` の往復は無変更で通る。

### core へ移したもの

- `commands/helpers.ts` の `molecules(ctx, sceneId, pattern?)` -- 同じ class 名フィルタが 4 箇所に
  増えたため集約

### 補完の追随

`selections` ソースが**翻訳器のテーブルから導出した** selection キーワードを名前一覧に足す
(`sel/translate.ts` の `selectionKeywords()`)。手書きの一覧にしないのは、対応を外した keyword を
補完し続けて「実行できない式に補完する」のを防ぐため。値を取る keyword は末尾 space 付き
(PyMOL と同じ)。`representations` と `mapRenderers` ソースを追加。

## Phase 3 (以降、需要次第)

`@script.pml`、`fetch` の cancel、`save`、`label` / `spectrum` / `set_color`、anim
(`mplay` `mstop` `frame` `mview`)、`align`/`super` -> SSM 代替、PyMOL 設定名 alias 表の拡充、
暗黙コンテキスト (直近 selection 名の省略)、`log`。

## 検証

- `npx tsc -p tsconfig.web.json --noEmit` / `tsconfig.node.json` -- 両方 0 error
- `npm test` -- 421 files / 3877 tests pass
- `pnpm run lint` -- 0 error、`npm run lint:style` -- 既存 14 件のまま、`pnpm run lint:comments` -- OK
- `task build_tritium` -- 成功。worker bundle にパーサとコマンド、renderer bundle に panel が入ることを確認
- Tab 補完: `<TAB>` で全コマンド / `se<TAB>` で一覧 / `b_c<TAB>` で `bg_color ` / `bg_color ye<TAB>` /
  `set aa_method, <TAB>` で enum 値 / `load ~/<TAB>` / 複数行の途中行での Tab / Shift+Tab で focus が抜ける
- 目視確認 (E2E): 既定オフで tab が無いこと、Settings > Plugins で ON にして
  `help` / `fetch 1crn` / `bg_color white` / `zoom 1crn` / `turn y, 90` / `view v1, store` /
  `delete 1crn; fetch 1crn` の Cmd+Z 1 回 / read-only 後に Redo が残ること / IME / tab 切替での状態保持
- Phase 2 の目視確認 (E2E): `show cartoon` -> `show sticks, chain A` -> `hide sticks, resi 1-10`
  で sel が和 / 差になること、GUI で作った renderer が書き換わらないこと、`as spheres` /
  `color red, byres (chain A around 5)` / `select core, polymer and not solvent` /
  `count_atoms core` / `distance d1, chain A and resi 10 and name CA, chain A and resi 20 and name CA` /
  `isomesh msh, <map>, 1.5` -> `isolevel msh, 2.0` / `zoom chain A` / 未対応語 (`within` `segi`) の
  エラー位置 / `zoom ch<TAB>` が `chain ` を補完すること
