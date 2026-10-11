# コンソール改善: zsh 風補完 / Markdown 出力 / CLI からの quit

## Context

`tritium_cli` (外部 CLI) と GUI のコンソールパネルは、どちらもアプリ側 worker の補完
(`src/plugins/console/worker/completion/complete.ts`、PyMOL `Parser._complete` の移植) を
呼んでいる。結果は「書き換え後の行 + 整形済みテキスト」(77 桁固定の段組み、
` parser: matching files:` 見出し) で返るため、クライアントは候補を選べず、表示も端末幅に合わない。
出力もプレーンテキストだけで、表や見出しを持つ出力 (help、op 結果) が読みにくい。
また CLI からアプリを終了する手段がない。

ユーザー要望 (確定済み):
1. zsh 風ファイル名補完を **CLI と GUI の両方**に。メニュー選択 / 端末幅の段組み・色分け /
   一致規則の緩和 (大小無視・隠しファイル・空白の引用) / 拡張子による優先。一致規則の変更は GUI にも適用
   (PyMOL 互換から外れてよい)。**コードはできるだけ共通化**
2. 出力の Markdown 化: `format: 'markdown'` を付けた出力だけ。`marked` の lexer を共通パーサにし、
   GUI は React、CLI は ANSI に描画
3. CLI の `quit` で GUI も終了 (確認ダイアログあり)。`quit --force` で確認なし終了

この計画はリポジトリ規約に従い、実装着手時に
`docs/plans/261010-console-zsh-completion-markdown-quit-plan.md` に写し、`docs/plans/_index.md` に 1 行追加する。

PR は 3 つに分ける (依存順): **PR1 CLI の TS 化・bundle + quit** → **PR2 zsh 風補完** → **PR3 Markdown**。

---

## PR1: CLI の TS 化・bundle と `quit`

> 実装時の変更: CLI は react-gui 内 (`src/cli/`) ではなく、workspace package `tritium/cli`
> (`@cuemol/tritium-cli`) として react-gui と並べた。共有コードは package `tritium/console-kit`
> (`@cuemol/console-kit`) に置く (PR2 / PR3 の `src/shared/console/`・`src/shared/markdown/` も
> ここに置く)。出力は `tritium/cli/dist/tritium_cli.mjs`。仕様は
> `../architecture/local-api-server.md` §5.1 / §5.4。

### 1-a. CLI を `src/cli/` の TS に移し esbuild で 1 ファイルに bundle
共通コード (`src/shared/...`) と `marked` を import するための前提。
- `tools/tritium_cli.mjs` -> `src/cli/tritium_cli.ts` (中身はほぼそのまま。必要に応じ `repl.ts` 等に分割)
- `scripts/build-cli.mjs`: esbuild (`bundle`, `platform: 'node'`, `format: 'esm'`, `target: 'node18'`,
  alias `@shared` -> `src/shared`, shebang banner) -> `out/cli/tritium_cli.mjs`。`esbuild` を devDependency に追加
- `package.json` の `build` / `package:dir` と `tritium/packaging/package.sh:32` に build-cli を連結
- `electron-builder.yml:151` の `from:` を `out/cli/tritium_cli.mjs` に。出力名は同じなので
  `build/cliWrapper.js` は変更不要
- `src/main/handlers/appPath.ts:107` の dev パスを `out/cli/tritium_cli.mjs` に
- `src/main/localApi/consoleEndpoint.test.ts:21` の import を TS ソースに
- `tsconfig.node.json` の include に `src/cli` を追加 (lint / 型検査の対象になる)

### 1-a2. go-task から CLI を起動 (`build_scripts/Taskfile.yml`)
`run_tritium` (Taskfile.yml:279-297) と並べて 2 つ追加する。
- `build_tritium_cli`: `dir: tritium/react-gui` で `node scripts/build-cli.mjs` を実行する (数秒で終わる)。
  `build_tritium` も build-cli を含む (1-a の `package.json` `build` 連結による)
- `run_tritium_cli`: `desc: "Run tritium_cli against the dev app. Usage: task run_tritium_cli -- -c 'help'"`
  - `deps: [build_tritium_cli]`、`interactive: true` (対話 REPL に TTY を渡す)
  - `dir: "{{.USER_WORKING_DIR}}"`: CLI の cwd を task を実行した場所にし、相対パスがそこから解決されるようにする。
    実行は `node "{{.ROOT_DIR}}/../tritium/react-gui/out/cli/tritium_cli.mjs" {{.CLI_ARGS}}`
  - env は `run_tritium` と同じ (`LIBCUEMOL2_ROOT` / `BUNDLE_APPS`) に `TRITIUM_CLI_DEV_APP` を加える
    (値は react-gui の絶対パス)
- 開発用アプリの自動起動: 今の `ensureApp` (tritium_cli.mjs:110-136) は `ELECTRON_RUN_AS_NODE`
  (パッケージ版の wrapper) のときだけアプリを起動し、素の node では NOT_RUNNING になる。そこで
  `TRITIUM_CLI_DEV_APP` があるときは、そのディレクトリで
  `pnpm exec electron-vite preview --skipBuild -- --tritium-cli` を detached で起動する。
  electron-vite は `--` 以降を `ELECTRON_CLI_ARGS` でアプリに渡す (確認済み)。`--skipBuild` なので
  事前に `task build_tritium` が要る。既存の `--tritium-cli` 処理 (`src/main/index.ts`) で
  CLI アクセスが開くことを確認する
- `CLAUDE.md` の Common tasks の表に `task run_tritium_cli` を 1 行追加する

### 1-b. `/app/quit` ルート (main 単独で応答。renderer relay は使わない)
- 新規 `src/main/localApi/appEndpoint.ts`: `endpoint: 'console'` (CLI アクセス設定と連動)、
  `paths: ['/app/quit']`、POST `{ force: boolean }`。`src/main/localApi/index.ts:71-82` の handlers に追加。
  `server.ts` は Electron 非依存を保つため、`quit(force)` を callback で注入
- 通常: `focusMainWindow()` (`src/main/windows/mainWindow.ts:40`) + macOS では `app.focus({ steal: true })`
  の後に `app.quit()`。既存の `before-quit` -> close funnel -> `ConfirmCloseTabDialog` の経路にそのまま乗る
  (ウィンドウが隠れていると確認が見えず永久待ちになるため focus は必須)
- force: `FORCE_QUIT` handler (`src/main/handlers/windowActions.ts:63-70`) と同じフラグ
  (`setForceQuit` / `setAppQuitting` / confirmed) を立てて **`app.exit` ではなく `app.quit()`**
  (`will-quit` の `stopLocalApi` 等の後始末を走らせる)
- 結果の通知: `src/main/quitState.ts` に quit の結果 (`'quit' | 'cancelled'`) を待つ promise を追加。
  `WINDOW_CLOSE_PROCEED {proceed:false}` (windowActions.ts:33-41) で `cancelled`、
  `will-quit` で `stopLocalApi()` の**前**に `quit` を resolve。ハンドラはそれを待って
  `{ outcome }` を返す
- `src/shared/types/localApi.ts` に `AppQuitRequest` / `AppQuitResponse` 型を追加

### 1-c. CLI の `quit`
- 単独行の `quit` / `quit --force` は CLI 側で処理する (`exit` と同様。対話・`-c`・スクリプトの全モード)
- 確認待ちの間はスピナーを出す ("Waiting for CueMol to confirm...")。`quit` なら "CueMol quit." と出して終了、
  `cancelled` なら "Quit cancelled in CueMol." と出してセッションを続ける
- 旧アプリ (ルートなし、404) は現状 NOT_RUNNING と解釈されるので、404 を "this CueMol does not support quit" と区別する
- PyMOL dialect の `quit` (`miscCommands.ts:164`、パネルでは警告のみ) は変えない

---

## PR2: zsh 風補完 (worker が候補を集め、共通モジュールでメニューを動かす)

### 2-a. worker: 構造化した候補を返す (`complete.ts`)
- `CompletionOutcome` / `CompleteOutcome` / wire の `ConsoleCompleteResponse` に optional の
  `candidates?: { label: string; replacement: string; kind: CandidateKind; group: string }[]` を追加。
  `replacement` は「その候補を選んだときのカーソル前の行全体」(既存の
  `prefixAt(line, regionStart, name) + hit + sep` をそのまま候補ごとに計算)。
  これでクライアントは行の組み立てを知らずに候補を巡回できる。
  `CandidateKind = 'dir' | 'file' | 'exec' | 'link' | 'command' | 'value' | 'argument' | 'variable'`
- 単一候補 / 共通 prefix への伸長 (`replacement`) は現行どおり
- `messages` は「該当なし」などの警告だけに減らす。候補一覧のテキスト化 (` parser: matching ...:` 見出しと
  `formatColumns`) はやめる。グループ名はクライアントが「複数グループがあるときだけ」見出しとして出す
- ファイル候補 (`fileCandidates` / `fileOffers` / `completeFilename`) の一致規則:
  - 隠しファイルは stem が `.` で始まるときだけ出す
  - 大文字小文字: 一致がなければ大小無視で再試行 (zsh の `m:{a-z}={A-Z}` に相当)。一致したら
    typed 部分も実名の大小に置き換える
  - kind は `lstat` で判定 (dir / link / 実行ビット付きなら exec)
  - 空白などパーサが区切りとみなす文字を含む名前は引用して挿入 (`parser/parseArgs.ts` の引用規則に合わせる)
  - 拡張子: `ArgCompletion` (`runtime/types.ts:78-`) に `extensions?: string[]` を追加。指定されていれば
    「その拡張子 + ディレクトリ」だけ出し、1 件もなければ全ファイルに戻す (zsh の `_files -g`)。
    PyMOL の file fallback では `load` 系に構造ファイルの拡張子を指定
    (具体的なリストは既存の reader 一覧から取る)

### 2-b. 共通モジュール `src/shared/console/` (DOM / Node 非依存)
- `completionGrid.ts`: `layoutGrid(labels, width) -> { columns, rows, cellWidth }`。column-major。
  `worker/completion/columns.ts` の `formatColumns` / `commonPrefix` をここへ移し、幅を引数にする
- `completionMenu.ts`: zsh の `auto_list` + `auto_menu` + `menu select` を表す純粋なステートマシン
  - 1 回目の Tab (複数候補): 共通 prefix まで伸ばして一覧を出す (現行どおり)
  - 2 回目の Tab: メニュー開始。先頭候補を挿入しハイライト
  - Tab / Shift-Tab で次・前、矢印でグリッド上を移動 (columns を使う)
  - Enter: 確定 (実行しない)。Esc / Ctrl-G: 元の行に戻して閉じる。その他のキー: 確定して入力を続ける
  - 入出力は `{ line, caret }` と候補配列だけ。各クライアントはキーを action に変換して渡し、
    返ってきた行と選択位置を描画する

### 2-c. CLI (`src/cli/`)
- `makeCompletionList` を、`completionMenu` を使って描画するビューに置き換える
  - 端末幅 (`process.stdout.columns`) で `layoutGrid`。ハイライトは反転表示
  - 色: dir は青太字、exec は緑、link はシアン。`NO_COLOR` と非 TTY では無色
  - メニュー中のキーは readline に渡す前に `keypress` で横取りする (既存の `prependListener` を拡張)
- 文字幅は CJK を考慮する (`visibleLength` を東アジア幅対応に。依存は増やさない)

### 2-d. GUI (`ConsolePanel.tsx`)
- `.console-completions` の帯を、候補セルのグリッドに置き換える (Popover は使わない。
  textarea のフォーカスを奪わないため)。列数は帯の幅と等幅フォントの文字幅から求め、`layoutGrid` に渡す
- keydown (`ConsolePanel.tsx:194-242`) で、メニューが開いている間は Tab / 矢印 / Enter / Esc を
  `completionMenu` に渡す。これを履歴 (ArrowUp/Down) より先に判定する
- 色・ハイライトは `_variables.css` のトークンと `.h3-list-row.is-selected` 相当の既存スタイルを使う。
  完了後 `task inspect_tritium_ui` で dark / light を確認

---

## PR3: Markdown 出力 (主目的: help の可読性向上)

Markdown 化の主目的は help を読みやすくすること。仕組みは汎用 (`format: 'markdown'`) にするが、
**PR3 で Markdown にする出力は help だけ**。op 結果などは後で必要になったら同じ仕組みに乗せる。

### 3-a. help 文章の Markdown 化 (構造化 + 概要文の書き直し)
**MCP との共通化は壊さない (最重要)**。native の op 由来コマンドでは、op の `description` と
`Param.description` が MCP / 内蔵 agent の tool schema と console help の**唯一の出どころ**
(`plugins/mcp/worker/mcp.service.ts`、`plugins/agent/worker/tools/index.ts:51`、
`native/index.ts:84`、`fromCatalog.ts:291`)。console 用に説明文を別に持つことはしない。
- help の**構造** (見出し・書式・引数の表) は console 側でメタデータから組み立てる。**本文**は
  op の `description` をそのまま Markdown として描画する (今の平文も Markdown として正しく表示される)
- 文章を Markdown で整えたいときは、op の `description` 自体を書き直す。そうすると MCP と help の
  両方に効く (3-b)
- console 専用の文章は、op を持たないものに限る: help の概要文、native builtins と PyMOL コマンドの `summary`
- 組み立ては共通関数 `plugins/console/worker/help/helpMarkdown.ts` に集める (両 dialect から使う)
  - `commandHelp(cmd, origin?)`: `## <name>` / 書式 (`usageLine`、`parser/bindArgs.ts`) をコードブロックで /
    本文 (native 生成コマンドは op の description、それ以外は `summary`) / 引数の表 /
    alias の注記 (`(get_scene_state with ...)` を引用ブロックで)
  - 引数の表: 名前・型・既定値・説明。native 生成コマンドは op の `Param` (`catalog/params.ts`: kind,
    description, values, optional) から作り、enum は値を列挙する。builtins と PyMOL コマンドは
    説明を持たないので、名前と既定値の列だけにする
  - `commandIndex(groups)`: 主題ごとに `### <主題> (help <group>)` + 「コマンド | 概要」の表
- native (`dialects/native/index.ts:44-97`): `printGroup` と直書きの概要文を、上記と次の
  Markdown の「使い方」節に置き換える。「書式」「引数の区切り方」「renderer / node の指定
  (`1crn/cartoon1`、`#uid`)」「プロパティ (`set 1crn/cartoon1.width, 2`)」「コマンド名の付け方」を
  小見出し・箇条書き・コード例で書き直す (現行の文意は保つ)
- PyMOL (`dialects/pymol/commands/registry.ts:30-65`): 一覧を表に、「help <command>」の案内と
  「select は名前付きの式で、使うたびに評価し直す」の注意を Markdown で書き直す
- 概要文は文字列リテラルの Markdown として `helpMarkdown.ts` 近くに置く (英語。ASCII のみ)

### 3-b. 長い op description を軽い Markdown に (MCP と help の両方に効く)
- 400 字を超える 5 件 (`set_node_prop`、`render_image`、`set_view`、`capture_view`、`measure_geometry`) を、
  箇条書きと `code` だけの軽い Markdown に書き直す。見出し・表は使わない (モデルには記号が増えるだけで、
  tool 定義は毎リクエスト送られるため)。引数の説明は `Param.description` に既にあるので重複させない
- 1-2 文の短い description は変えない
- MCP の description は Markdown 原文のまま渡る (変換しない)。`schemaPin.test.ts` のスナップショットを更新し、
  内蔵 agent で該当 tool を使う依頼を数件試して挙動が変わらないことを確かめる
- Markdown で意味が変わる記号 (行頭の `-` / `*`、`|` など) が既存の description に含まれていないかを確認する

### 3-c. Markdown を運ぶ仕組みと描画
- `ConsoleEntry` (`shared/consoleTypes.ts:40-45`) と `ConsoleWireEntry` (`shared/types/localApi.ts:85-88`) に
  optional の `format?: 'markdown'` を追加。`consoleSessionStore` は spread で素通しするので変更不要
- worker: `CmdContext` (`runtime/types.ts:28`) に `printMarkdown(text)` を追加し、
  `EntrySink.push` (`runtime/runCommand.ts:96-114`) に format 引数を足す
- `marked` を dependency に追加。`src/shared/markdown/parse.ts` で `marked.lexer` を包み、
  使う token (heading / paragraph / strong / em / codespan / code / list / table / hr) だけの型に絞る
- GUI: `src/renderer/h3-kit/markdown/MarkdownBlock.tsx`。token から React 要素を組み立てる
  (`dangerouslySetInnerHTML` は使わない。生 HTML の token はテキストとして出す)。
  `ConsoleTranscript.tsx:46-50` で `format === 'markdown'` のときだけこれを使う。
  スタイルは `.type-*` role とトークン経由
- CLI: `src/cli/markdownAnsi.ts`。見出しは太字 + 色、コードはシアン、表は罫線付きで端末幅に収める
  (2-c の文字幅関数を使う)。非 TTY では Markdown 原文をそのまま出す (パイプ先で再利用しやすいように)
- help 以外の出力は従来どおりプレーンテキスト。ログファイル (`commandLog.ts`) には Markdown 原文が残る

---

## テスト (最小集合。目視確認で挙動が確定してから書く)
- `complete.test.ts`: 候補ごとの `replacement` の契約 1 件、隠しファイル・大小無視・拡張子 fallback を
  1 件ずつ。既存の `printed(... 'matching ...')` を検査しているテストは新しい形に合わせて直す
- `completionMenu.test.ts`: 2 回目の Tab でメニュー開始 -> 巡回 -> Esc で元の行に戻る、の 1 シナリオ。
  グリッド上の矢印移動 1 件
- `ConsolePanel.test.tsx`: Tab 2 回でハイライトされた候補が prompt に入る結合テスト 1 件 (既存の
  `.console-completions` テストは置き換え)
- `appEndpoint` (または `consoleEndpoint.test.ts` に追加): `/app/quit` が `force` を quit callback に渡し、
  `cancelled` / `quit` をそのまま返す 1 件
- `markdown`: 表を含む token 列から React 描画 1 件、ANSI 描画 1 件 (表の幅合わせ)
- `helpMarkdown`: native 生成コマンドの help が「書式のコードブロック + op の description を本文 +
  enum 値を含む引数の表」になる 1 件 (本文が MCP の description と同一であることも同じテストで確かめる)。
  `help` の出力が `format: 'markdown'` で返る契約 1 件 (既存の help 文面テストは追随修正)

## 検証
1. `cd build_scripts && task build_tritium` (renderer + CLI bundle。`out/cli/tritium_cli.mjs` ができる)
2. 既存のアプリを `pgrep -fl "tritium/node_modules/.pnpm/electron"` で確認・終了してから `task run_tritium`。
   起動マーカーを確認し、`task run_tritium_cli` で次を確かめる。アプリを止めた状態でも
   `task run_tritium_cli` を試し、開発用アプリが自動起動して接続できることを確認する
   - `load ~/Doc<Tab>`、大文字小文字違い、`.` 始まり、空白を含むファイル名、2 回目の Tab でのメニュー、
     矢印 / Esc / Enter、端末幅を変えたときの段組み
   - `help`、`help <主題>`、`help load` (native)、`help select` (PyMOL) の Markdown 描画
     (表・コードブロック・見出し)、狭い端末での表の収まり、`| cat` で原文が出ること
   - `quit` -> 未保存のシーンで確認ダイアログが前面に出る -> Cancel で "Quit cancelled"、
     Don't Save で終了。`quit --force` で確認なしで終了し `~/.cuemol/local-api.json` が消える
3. GUI パネルで同じ補完操作と `help` の表示。`task inspect_tritium_ui -- --target console` で dark / light
4. ユーザーの目視確認 -> フィードバックの反映
5. `cd tritium/react-gui && npm test`、`npx tsc -p tsconfig.web.json --noEmit`、
   `npx tsc -p tsconfig.node.json --noEmit`、`task lint_tritium_style`
6. `task package_tritium` で作ったパッケージで、`Resources/cli/tritium_cli` が bundle 版で動くこと

## ドキュメント
- 実装後、`docs/architecture/console-cli.md` (なければ新規、`_index.md` に追加) に、補完の wire 形式
  (`candidates`)・メニューの状態遷移・`format: 'markdown'`・`/app/quit` の仕様を書く
- `tools/tritium_cli.mjs` の移動に伴い `tritium/CLAUDE.md` の記述を更新
