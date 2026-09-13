# pymconsole plugin (PyMOL コマンド互換コンソール、Python embedding なし)

Status: **Phase 1 実装済み** (`tritium/react-gui/src/plugins/pymconsole/`)。Phase 2 以降は未着手。
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
| UI 配置 | **bottom tab** "PyMOL" (`after: 'output'`) |
| plugin id | `pymconsole` / "PyMOL Console" / `defaultEnabled: false` (実験的) |
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

書かなかったもの: 各 command の service forwarding (service 側 test が既にある)、色名表の総当たり、見た目。

## Phase 2 (次 PR): selection 翻訳器 + Tier 1

- `worker/sel/`: 調査報告 §3.3 の構成 (tokenizer -> 再帰下降 parser -> AST -> **完全括弧付き** CueMol 式)。
  §3.4 の token 対応表が仕様。`-`/`+` の多義性は AST 経由でのみ解く。未対応 token は位置付きエラー
- クラスマクロは **alias 登録ではなく翻訳時のインライン展開** (`setStrData` で global alias を登録する案は
  worker 起動時の状態を持ち込むので採らない)。既存 global alias (`protein` `nucleic` `water` `helix`
  `sheet` `coil` `ligand` `hydrogen`) はそのまま使う
- `select` / `indicate` / `deselect`、`show` / `hide` / `as` (代表 renderer 規約)、`color`、
  `distance` / `angle` / `dihedral` / `count_atoms` / `get_chains`、`zoom sel` / `center sel`、
  `isomesh` / `isosurface` / `isolevel`

## Phase 3 (以降、需要次第)

`@script.pml`、`fetch` の cancel、`save`、`label` / `spectrum` / `set_color`、anim
(`mplay` `mstop` `frame` `mview`)、`align`/`super` -> SSM 代替、PyMOL 設定名 alias 表の拡充、
暗黙コンテキスト (直近 selection 名の省略)、`log`。

## 検証

- `npx tsc -p tsconfig.web.json --noEmit` / `tsconfig.node.json` -- 両方 0 error
- `npm test` -- 417 files / 3834 tests pass
- `pnpm run lint` -- 0 error、`npm run lint:style` -- 既存 14 件のまま、`pnpm run lint:comments` -- OK
- `task build_tritium` -- 成功。worker bundle にパーサとコマンド、renderer bundle に panel が入ることを確認
- 目視確認 (E2E): 既定オフで tab が無いこと、Settings > Plugins で ON にして
  `help` / `fetch 1crn` / `bg_color white` / `zoom 1crn` / `turn y, 90` / `view v1, store` /
  `delete 1crn; fetch 1crn` の Cmd+Z 1 回 / read-only 後に Redo が残ること / IME / tab 切替での状態保持
