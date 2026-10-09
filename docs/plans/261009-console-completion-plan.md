# console の Tab 補完の作り直し

## Context
- 補完は「その場所で正しく書けるものを全部出す」べきもの。実際に使って、次の 2 つが見つかった。
  - `load <file>, <Tab>` で renderer しか出ず、`options=` などの名前付き引数が出ない。
  - `op<Tab>` がエラーになる。
- これまで `name=` の判定や、ファイルから renderer type を出す処理を足してきた。どれも今の作りの上に継ぎ足した場当たり的な修正で、根本の原因は残っている。
- **根本の原因** (`plugins/console/worker/completion/complete.ts`)
  1. 今どの引数かを**カンマの数**で決めている。
     - 除外しているのは `[...]` の中のカンマだけで、`(...)` や引用符の中は除外しない。実行時 (`parser/parseArgs.ts`、括弧の中は 1 つの引数) と食い違う。
     - 名前付きの引数は、後から正規表現で足したもの。
  2. `ConsoleCommand.completions` が**位置の番号で並んだ配列**なので、1 つの位置に候補源が 1 つしかない。その位置に書ける名前付き引数が候補にならない。
  3. 候補源が前の引数を**位置の番号**で参照している (`rendererTypes:0`、`readerOptions:0`、PyMOL の `settingValue` = `argsSoFar[0]`)。
     - 名前付きで書くと (`load path=f, ...`)、その位置に `name=value` の文字列がそのまま入るので、参照がずれる。
  4. 補完の後ろに付ける区切りが**位置ごとに固定** (`suffix`)。次の 2 つで変えられない。
     - 候補ごとの違い (`name=` や `obj.` の後ろには付けない)
     - 残りの引数があるかどうか
  5. 候補が無いと**いつもファイル名に fall back** する。PyMOL 由来の動きで、native ではファイルを受け取らない位置でもファイル一覧が出る。
- **進め方**: 同じブランチ `feat/command-naming` の同じ PR に入れる。実装に入るときにこの計画を `docs/plans/261009-console-completion-plan.md` としてリポジトリに置き、`_index.md` に 1 行足す。

## 設計

### 0. reader のオプションは、形式ごとの load コマンドで渡す (`catalog/ops/fileOps.ts`)
- 今の `load_file` の `options=` (1 つの引数に `key=value` を並べる形) は、分かりにくく書きにくい。これをやめる。
- `companion=` もやめる。
- 汎用の `load` (`load_file`) の引数は `path` / `rendererType` / `selection` / `name` に固定する。オプションは reader の既定値を使う。
- オプションを指定したいときは、形式ごとの op を使う。
  - 各 op の引数名は固定で、型が付く。null (省略) は reader の既定値。
  - File Open のオプション dialog の pane と同じ分け方。
  - `fileOpenTypes.ts` の option 型と同じ名前を使う。

  | op | 対象 | 形式ごとの引数 |
  |---|---|---|
  | `load_pdb` | PDB と mmCIF | `loadModel`、`loadAnisou`、`loadAltConf`、`loadSegid`、`build2ndry`、`autoTopology` (boolean) |
  | `load_mtz` | MTZ | `columnF`、`columnPhi`、`columnWeight` (string)、`resolutionLimit`、`gridSpacing` (real) |
  | `load_ccp4` | CCP4 / MRC map | `normalize` (boolean)、`truncateMin`、`truncateMax` (real)、`mapType` (auto / xtal / em)、`subsample` (integer) |
  | `load_msms` | MSMS surface | `vertFile` (path) |
  | `load_namd` | NAMD coordinates | `psfFile` (path) |
  | `load_amber` | AMBER prmtop | `coordFile` (path) |

- `columnPhi`、`columnWeight`、`truncateMin`、`truncateMax` を指定すると、それを使うためのスイッチ (phase / weight / truncate) も on になる。
- 形式に合わないファイルを渡したら断る。
  - 例: `load_mtz f.pdb` →「f.pdb is not an MTZ file」。
  - ファイルの reader は `getCompatibleRendererNames` で調べる。
- 公開範囲: console と MCP (`tool: false, mcp: true`)。
  - agent には汎用の `load_file` だけを出す (tool の一覧を短く保つため)。
- 共通の処理は 1 つの関数にまとめる: path の解決 (`callerPath`)、`buildHeadlessFileOpenOptions`、`loadObject`。
- 形式ごとの op は、形式の差分 (オプションをどの FormatOptions に入れるか) だけを持つ。
- 削除するもの:
  - `list_reader_options`: 各 op の引数一覧 (`help load_pdb`、MCP の schema) で分かるため。
  - `readerOptions.ts` の文字列を解析する部分 (`applyReaderOptionText`)
  - 引数の種類 `readerOptionText`
  - console の `readerOptions:` 補完の候補源
- テスト: `readerOptions.test.ts` を置き換えて 1 件にする。
  - 内容: 形式ごとの op の引数が FormatOptions の値になり、スイッチも on になること。
  - 形式に合わないファイルを断ることも確かめる。

### 0b. reader の選び方を GUI と統一する
- **今の状態**
  - GUI (File > Open、drop、最近使ったファイル):
    - 拡張子を受け持つ reader 用のフィルタがちょうど 1 つなら、拡張子で決める。
    - 2 つ以上、または 1 つも無ければ、中身を見て決める (`contentFirst: true`、sniff)。
    - この規則が 2 か所に重複していて、拡張子の照合のしかたも少し違う。
      - `main/helpers/inferContentFirst.ts` (`hasExt`)
      - `renderer/utils/classifyDropFile.ts` (`endsWith`)
  - console / MCP / agent の `load_file`:
    - 常に `contentFirst: false` (`getCompatibleRendererNames` → `loadObject`)。
    - `.qsc` かどうかは正規表現で判定している。
- **統一のしかた**
  - 判定の規則を `shared/openFileKind.ts` (main / renderer / worker のどれからも使える) の 1 つの関数にする。
    - 関数: `classifyOpenFile(path, objFilters, sceneFilters) → { kind: 'obj' | 'scene' | 'unsupported', contentFirst }`
    - 拡張子の照合は `shared/fileExt.ts` の `hasExt` (`*.pdb.gz` のような複数の `.` を含む拡張子に対応) にそろえる。
  - `inferContentFirst` と `classifyDropFile` は、この関数を呼ぶだけにする (呼び出し側の挙動は変えない)。
  - worker の `load_file` と形式ごとの load も、フィルタを worker の `getOpenFilters` から取り、同じ関数で判定する。
    - `scene`: `.qsc` として開く (正規表現の判定をやめる)。
    - `unsupported`: 断る。
    - `obj`: `contentFirst` を付けて reader を選ぶ (`getCompatibleRendererNames`)。
  - その後は GUI の `OpenObjByPath` と同じ順番で処理する: 選んだ `readerName` で既定のオプションを作り、`loadObject(..., readerName)` に渡す。
- 形式ごとの load (`load_pdb` など) は、同じ判定で選ばれた reader がその形式でなければ断る。
  - 例: `load_mtz f.pdb` →「f.pdb is not an MTZ file (read as pdb)」
- **テスト**: `shared/openFileKind.ts` に 1 件。
  - フィルタが 1 つなら拡張子で決める。2 つ以上 / 無しなら sniff。`.qsc` は scene。`*.pdb.gz` も一致する。
  - 既存の `inferContentFirst` / `classifyDropFile` のテストは、そのまま通ること (挙動を変えていないことの確認)。

### 1. 入力途中の行を、実行時と同じ規則で読む (`parser/`)
- `parseArgs` の字句解析の部分を `scanArgs(line, mode)` として切り出す。
  - 各引数について `{ name, value, start (行の中の開始位置) }` を返す。
  - 末尾の書きかけの引数 (閉じていない括弧や引用符) は、throw せずに「入力中の引数」として返す。
  - `parseArgs` は今のインターフェースのまま、その上に作る。実行時の挙動は変えない。
- `bindArgs` の割り当て規則 (位置の引数は全体の番号の名前に入る、legacy では未知の `name=` を展開する) を `assignArgs(params, parsed, mode)` として切り出す。
  - `{ bound: Record<名前, 文字列>, unbound, errors }` を返し、throw しない。
  - `bindArgs` は、その上で今と同じ検査 (足りない・多すぎる・知らない名前) をする。
- これで、補完と実行が、括弧・引用符も含めて同じ規則で引数を読む。
- **引数の割り当て規則を dialect ごとに持つ** (`ConsoleDialect.argRule`、`assignArgs` に渡す):
  - **native: Python の呼び出しと同じ規則** (独自の言語なので PyMOL に合わせる必要はない)。
    - 位置引数は先頭から順に引数を埋める。
    - 名前付き引数は名前で入る。
    - 名前付きの後に位置引数があればエラー: 「positional argument after a keyword argument」。
    - 同じ引数を 2 回書いたらエラー: 位置と名前付きの重複も、名前付き同士の重複も含める。
    - 補完も同じ規則に従う。名前付きを 1 つ書いた後は、`name=` の候補 (まだ書いていない引数) と、名前付きで書いている引数の値だけを出す。
  - **PyMOL dialect: 今の規則のまま** (PyMOL 互換が要るので変えない)。
    - 位置引数は、名前付きも数えた全体の番号の引数に入る。
    - legacy 展開あり。
    - 重複は後に書いたほうで上書きする。
    - 補完も、この規則で割り当てた結果に従う。

### 2. 入力中の引数に何が書けるか
- 新しい `completion/context.ts` が、行から次のものを作る。
  - コマンド
  - `bound`: 前の引数を**名前で**持つ。位置で書いたものも名前で書いたものも同じ扱い。
  - 入力中の引数 `{ keyword, text, start }`
  - 候補の枠 (slot)
- 枠の決め方:
  - **`name=` 付きで書いている**: その引数の値だけ。
  - **位置で書いている**: 次の 2 つを両方出す。
    - その位置の引数の値
    - **まだ書かれていない引数**の `name=` (種類「argument」)
- 名前付き引数の候補は両 dialect で出す。PyMOL も名前付き引数を受け付けるので、「正しいものを全部出す」原則に合わせる。
- 名前で書き済みの引数は、位置で書く枠からも外す (`assignArgs` と同じ規則)。

### 3. 候補源の宣言 (`runtime/types.ts`)
- `ConsoleCommand.completions: (ArgCompletion | null)[]` (位置の配列) をやめる。
- 代わりに、各引数に候補源を持たせる: `ParamSpec.complete?: { source; description; open? }`。
  - `open: true` は、値が続くので区切りを付けない引数を表す (selection、property path、自由入力)。
- 候補源には `argsSoFar` の代わりに `SourceContext.bound: Record<名前, 文字列>` (名前で引ける) を渡す。
- 前の引数を位置の番号で見ていた候補源は、名前で見るように変える。
  - native: `rendererTypes:<引数名>`、`fileRendererTypes:<引数名>`、`props:` / `propValues:` / `pathValues:` / `rendererChangeTypes:`
  - PyMOL: `settingValue`
- 各 dialect での移行:
  - native: `completionOf` (`dialects/native/fromCatalog.ts`) に、`objectIndex` などの番号ではなく引数名を渡す。
  - PyMOL: 各コマンドの `completions: [...]` を各引数に移す (`dialects/pymol/commands/*` の約 25 か所。機械的な作業)。
  - builtin (`close_scene`、`switch_scene`、`create_scene`、`help`) も同じように移す。

### 4. 候補は文字列ではなく item にし、区切りは候補ごとに決める (`completion/complete.ts`)
- 候補を LSP の CompletionItem に倣った item にする: `CompletionItem { text, kind, then }`。
  - `kind`: `'value'` / `'argument'` (`name=`) / `'file'` など。一覧の見出しに使う。
  - `then`: 確定した後の扱い。
    - `'next'`: 値が終わった。まだ割り当てられていない引数が残っていれば `, ` を付け、無ければ何も付けない。
    - `'continue'`: 続けて入力する。何も付けない (`name=`、`obj.` / `obj/`、ディレクトリ、selection)。
- 候補源は `(string | CompletionItem)[]` を返す。文字列は、その枠の既定 (値で `then: 'next'`、`open` の枠なら `'continue'`) として扱う。既存の候補源は大半がそのまま使える。
- これで、位置ごとに固定だった `suffix` (`last ? '' : ', '`) をやめる。文字列の末尾の見た目から区切りを推測することもしない。
- 参考にした実装 (同じ考え方のもの):
  - Python の click / argcomplete: 実行時と同じ parser で入力途中の行を読み、その引数の completer に聞く (設計 1・2)。
  - zsh の `_arguments` / fish: 位置の引数の値と、まだ使っていないオプション名を同時に出す (設計 2)。
  - IPython / jedi: 引数の位置で `name=` を出す。
  - LSP の CompletionItem: 候補ごとに種類と挿入のしかたを持つ (この節)。

### 5. 照合と表示
- 照合は今の規則を残す。
  - 引数全体で試してから、最後の単語で試す。
  - 省略形を展開する (`interpretShortcut`)。
  - 共通部分が今の入力より長いときだけ伸ばす。
  - `_` で始まる名前は一覧に出さない。
- 照合は全部の枠の候補をまとめた集合に対して行う。
- 候補が複数残ったら、**枠ごとに見出しを付けて**一覧する。
  - `parser: matching renderer type:` とその列
  - `parser: matching argument:` とその列
- 補完した行を組み立てるときは、元の行を `start` の位置で切って使う (`argsSoFar` をつなぎ直すのをやめる)。ユーザーが入れた空白や引用符をそのまま残すため。

### 6. ファイル名の補完
- ファイル名は、**path 型の引数の `files` 候補源**として補完する (native の `path`、PyMOL の `load` / `save` / `@`)。`$VAR` は今のまま。
- 「候補が無ければファイル名」は **dialect の設定** (`ConsoleDialect.fileFallback`) にする。
  - PyMOL は互換のため on のまま。
  - native は off。候補が無ければ「no matching …」と言う。

### 7. 範囲外
- panel と `tritium_cli` は、caret のある**行全体**を送ってくる。行の途中での補完には対応しない。対応するにはリクエストの形を変える必要があり、今回は変えない。

## 変更する主なファイル
- reader の選び方: 新規 `shared/openFileKind.ts`、`main/helpers/inferContentFirst.ts`、`renderer/utils/classifyDropFile.ts`、`renderer/worker/server/catalog/ops/fileOps.ts` (形式ごとの load もここ)、`renderer/worker/server/catalog/readerOptions.ts` (文字列の解析を削除)
- `plugins/console/worker/parser/parseArgs.ts`、`bindArgs.ts`: `scanArgs`、`assignArgs` を足す。
- `plugins/console/worker/completion/complete.ts`、新規 `context.ts`
- `plugins/console/worker/runtime/types.ts`: `ParamSpec.complete`、`SourceContext.bound`、`ConsoleDialect.fileFallback`、`ConsoleDialect.argRule`
- `plugins/console/worker/runtime/runCommand.ts`: 実行時の `bindArgs` に dialect の規則を渡す。
- ドキュメント: `docs/architecture/op-catalog.md` §5 の「引数」の説明に、native の割り当て規則 (Python と同じ) を書く。
- `plugins/console/worker/dialects/native/{fromCatalog,index,builtins}.ts`
- `plugins/console/worker/dialects/pymol/{sources.ts, commands/*.ts}`: completions を各引数に移す。`settingValue` を名前で読む。
- 再利用するもの:
  - `interpretShortcut` (`parser/shortcut.ts`)
  - `formatColumns` / `commonPrefix` (`completion/columns.ts`)
  - `completeFilename` (`files` 候補源にする)
  - `getCompatibleRendererNames` / `settableReaderOptions` (候補源で使用中)
- ドキュメント: `docs/architecture/op-catalog.md` §5 の補完の項目と、`docs/plans/` の計画書。

## テスト (最小集合。既存の `complete.test.ts` は新しい宣言の形に移す)
- **行 → 候補と補完後の行の表** (`complete.test.ts`、stub の dialect):
  1. 位置で書く枠で、値の候補と、まだ書かれていない引数の `name=` の両方が出る (`load f, <Tab>`)。
  2. `name=` の後は、どの位置でもその引数の値が出る。
  3. 候補源は、前の引数を名前で受け取る。位置で書いても名前で書いても同じ (`load_pdb path=f, rendererType=<Tab>` でも、f から作る分子の renderer type が出る)。
  4. 区切り: `name=` の後は付かない。値の後は、引数が残っていれば `, `、最後の引数なら付かない。
  5. 括弧と引用符の中のカンマは引数の区切りにしない (実行時と同じ)。
  6. native は、候補が無いときファイル名に fall back しない。PyMOL は fall back する。
- `parse.test.ts`:
  - `scanArgs` が書きかけの引数 (閉じていない括弧) を throw せずに返し、`start` を記録することを 1 件。
  - 割り当て規則の違いを 1 件。
    - native (Python と同じ規則) は「名前付きの後の位置引数」と「重複」をエラーにする。
    - PyMOL は同じ入力を今までどおり受け付ける (全体の番号で割り当て、後に書いたほうで上書き)。
- 補完の表に 1 件: native で名前付きを書いた後の枠には、`name=` の候補だけが出る。
- PyMOL の補完の既存の挙動 (省略形、`_` を隠す、共通部分、`$VAR`) は、今あるテストを移して確かめる。

## 検証
1. `cd /Users/user1/proj64/cuemol2_work2/build_scripts && task build_tritium` の後、`task run_tritium -- --tritium-cli`
2. panel と `/console/complete` endpoint で確かめること (native dialect):
   - `load <file>, <Tab>` で、renderer type と、`selection=` / `name=` が見出しを分けて出る。
   - `load_pdb <file>, cartoon, bu<Tab>` で `build2ndry=` になり、続けて `<Tab>` で `true` / `false` が出る。
   - `load_pdb path=<file>, <Tab>` (名前で書いた後) では、`name=` の候補だけが出る (native の規則)。
   - `load_mtz <file.pdb>` は「not an MTZ file」で断られる。
   - 拡張子を変えた PDB ファイル (例: `1crn.txt`) を `load` すると、GUI の File > Open と同じく中身を見て PDB として読む。
   - `load x.qsc` は scene として開く。
   - `load_mtz f.mtz, columnF=FWT, columnPhi=PHWT` が通る (MTZ のサンプルが手元にあれば)。
   - 次の補完が今までどおり動く: `set 1crn/simple1.width, <Tab>`、`props <Tab>`、`create_renderer 1crn, <Tab>`、`close_scene <Tab>`。
   - `count 1crn, (resid 1:10, <Tab>` で、括弧の中のカンマが selection の一部として扱われる。
   - native でファイルを受け取らない引数の位置で、ファイル一覧が出なくなる。
3. PyMOL dialect: 次が今までどおり動き、名前付き引数も候補に出る: `set ambient, <Tab>`、`color re<Tab>`、`load <ファイルの先頭><Tab>`、`@scr<Tab>`。
4. `tritium_cli` でも、同じ例で Tab が効く。
5. `npm test`、tsc (web / node)、ESLint (変更したファイルに warning が無いこと)
