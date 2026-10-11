# Console の help と Markdown 出力

console panel と `tritium_cli` は、`format: 'markdown'` の付いた出力だけを Markdown として整形する。
今それを使うのは `help` だけで、ほかの出力はプレーンテキストのまま。

## 運ぶ形

- worker のコマンドは `CmdContext.printMarkdown(text)` で出す (`plugins/console/worker/runtime/types.ts`)。
  `EntrySink.push` が entry に `format: 'markdown'` を付ける (`runtime/runCommand.ts`)。
- entry の型は `ConsoleEntry.format?` (`plugins/console/shared/consoleTypes.ts`)、
  wire は `ConsoleWireEntry.format?` (`@cuemol/console-kit` `localApi.ts`)。`/console/run` の応答で CLI にもそのまま届く。
- text は Markdown 原文のまま。ログファイル (`commandLog.ts`) にも原文が残る。

## 読み取りと描画

- `@cuemol/console-kit` の `markdown.ts` が `marked` の `Lexer` (gfm) で読み、console で使うものだけの木
  (`MdBlock` / `MdInline`) に絞る。block は見出し / 段落 / コード / 箇条書き / 表 / 引用 / 横線、
  inline は strong / em / code span / 改行。リンクや生 HTML は、それが表す文字列として残す。
- GUI: `renderer/h3-kit/markdown/MarkdownBlock.tsx` が木から React 要素を組み立てる。HTML 文字列は使わない
  (`<script>` は文字列のまま出る)。スタイルは `styles/_markdown-kit.css` と `--md-*` トークン。
  - 太字 (見出し・strong・表の見出し行) は `font-weight` ではなく `-webkit-text-stroke`
    (`--md-bold-stroke`) で太らせ、色は `--md-strong` (dark は `#fff`)。日本語 macOS では `monospace` が
    Osaka-Mono になり、それには bold の書体がなく、Chromium は bold を幅の違う Osaka で描くため。
  - code span / code block は `--md-code` (dark は薄紫)。表は code block と同じだけ字下げする。
  - `ConsoleTranscript.tsx` は `format === 'markdown'` の entry だけ `MarkdownBlock` で描く。
- CLI: `tritium/cli/src/markdownAnsi.ts` の `markdownToAnsi(text, width, colour)`。端末幅で段落と箇条書きを
  折り返し、表は広い列から順に縮めて各セルを折り返す (code span は途中で切らない)。表は 4 桁字下げ。
  見出し・strong は SGR の bold だけ (色は端末の前景色のまま)、code は 256 色の 147。
  stdout が TTY でないときは整形せず Markdown 原文を出す (パイプ先で再利用できるように)。

## help の構成 (native)

`plugins/console/worker/dialects/native/index.ts`。組み立ての共通部は `plugins/console/worker/help/helpMarkdown.ts`。

| 入力 | 出力 |
|---|---|
| `help` | 主題 (`OP_GROUPS`) の表だけ: `help <subject>` / 主題名 / コマンド数。最後の行が `help syntax` |
| `help <subject>` | その主題のコマンドの表 (Command / Summary、1 コマンド 1 行) |
| `help syntax` | コマンドの書き方 (名前の付け方、カンマ区切り、node の指定、プロパティ) |
| `help <command>` (`<command> ?`) | 見出し、書式 (code block)、本文、引数の表 (名前 / 型 / 既定値 / 説明)、alias の注記 (引用) |

全コマンドを 1 ページに並べると長すぎて読めないため、`help` は主題の一覧で止める。

### MCP と文章の出どころを共有する

op から生成したコマンドの `help <command>` は、本文に op の `description`、引数の説明に `Param.description` を
そのまま使う。これは MCP server と内蔵 agent が tool schema としてモデルに渡すのと同じ文字列で、console 用の
説明文を別に持たない。文章を整えたいときは op の `description` 自体を書き直す (両方に効く)。
長い description (`set_node_prop` / `render_image` / `set_view` / `capture_view` / `measure_geometry`) は
箇条書きと `code` だけの軽い Markdown で書いてある。先頭の 1 文はコマンド表の Summary に使う。
console だけの文章は op を持たないもの (builtin と PyMOL コマンドの `summary`、`help syntax`) に限る。

## help の構成 (PyMOL)

`plugins/console/worker/dialects/pymol/commands/registry.ts`。PyMOL コマンドには主題の分類がないので、
`help` はコマンドの表と `select` についての注意 (名前付きの式で、使うたびに評価し直す)。
`help <command>` は native と同じ `commandHelp` で、引数の表は名前と既定値だけ (説明を持たないため)。

## テスト

- `dialects/native/help.test.ts`: `help` は主題だけ、`help <subject>` はコマンドを出す。op のコマンドの help が
  書式・op の description・enum 値と `Param.description` を含む引数の表になる。
- `h3-kit/markdown/MarkdownBlock.test.tsx`: 表がセルになり、生 HTML が要素にならない。
- `tritium/cli/src/markdownAnsi.test.ts`: 幅の広い表が端末幅に収まり、列が揃い、語が欠けない。
