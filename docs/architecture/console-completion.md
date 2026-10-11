# Console の Tab 補完

console panel (GUI) と `tritium_cli` (CLI) の Tab は同じ補完を使い、zsh の
`auto_list` + `auto_menu` + `menu select` と同じように振る舞う。

## 分担

| どこ | 何をするか |
|------|-----------|
| worker `plugins/console/worker/completion/complete.ts` | 行 (カーソル前) を読み、候補を集める |
| `tritium/console-kit/src/completion.ts` | 候補の型、段組み (`layoutSections`)、メニューの状態遷移 (`moveMenu` / `menuText`) |
| GUI `plugins/console/renderer/ConsolePanel.tsx` | キーを menu の操作に変え、候補のグリッドを描く |
| CLI `tritium/cli/src/tritium_cli.ts` (`installCompletion`) | 同上を端末で。readline の `_ttyWrite` を包んでキーを先に見る |

## worker の答え

`complete` service と `POST /console/complete` は同じ形を返す:

- `replacement`: カーソル前の行の書き換え (null なら変えない)。候補が 1 つならそれと区切り
  (` ` / `, `)、複数なら共通 prefix (入力より長いときだけ。区切りなし)
- `candidates` (2 つ以上のとき): `{ label, replacement, kind, group }`。`replacement` は
  **その候補を選んだときのカーソル前の行全体** (区切り込み)。client は行を組み立て直さず、
  選んだ候補の `replacement` を書くだけ。`kind` (`dir` / `file` / `exec` / `link` /
  `command` / `value` / `argument` / `variable`) は色分け、`group` は見出し (グループが
  2 つ以上のときだけ出す)
- `messages`: 該当なしなどの警告だけ。一覧はテキストにしない

`_` で始まる名前は内部用として一覧に出さない (完全一致なら補完はする)。

## メニュー

1. 1 回目の Tab: 候補が複数なら一覧を出す (共通 prefix まで伸ばす)
2. 2 回目の Tab: 先頭の候補を選んで書き込む。以後 Tab / Shift-Tab で次 / 前、矢印でグリッド上を移動
   (上下は列をたどって次の列へ、左右は同じ行で列を移り端で折り返す)
3. Enter: 確定 (実行しない)。Esc (CLI は Ctrl-G も): 一覧を出したときの行に戻す。
   その他のキー: 確定してそのキーの動作をする。GUI は候補のクリックでも確定する

一覧は column-major (i 番目は `i % rows` 行目)。列数は GUI はパネルの幅 (等幅フォントの
文字数)、CLI は端末幅から決める。CLI で画面より高い一覧は、選択の周りの行だけを出す。

## ファイル名の一致規則

PyMOL ではなく zsh に合わせる:

- `.` で始まる名前は、入力が `.` で始まるときだけ出す
- 入力どおりに一致するものがなければ、大文字小文字を無視して探し直し、実際の綴りで書き込む
- `,` `;` を含む名前や前後に空白がある名前は引用符で囲む (中の空白はそのままでよい)
- `ArgCompletion.files`:
  - `openable`: reader (object と scene) の拡張子を持つファイルとディレクトリだけを出す。
    1 件もなければ全ファイル (zsh の `_files -g`)。native の `load` / `load_*` の `path`、
    PyMOL の `load`
  - `dirs`: ディレクトリだけ。`cd` (両 dialect)
- 色: ディレクトリは青 (CLI は太字も)、実行ファイルは緑、リンクは CLI がシアン・GUI が
  `--console-link`。GUI で太字を使わないのは、等幅フォントに太字がないと別フォントで
  描かれて幅が `ch` からずれるため

## テスト

- `complete.test.ts`: 候補ごとの `replacement`、グループ分け、ファイルの一致規則
- `console-kit/src/completion.test.ts`: 段組みとメニューの移動
- `ConsolePanel.test.tsx`: 一覧 -> Tab で巡回 -> Esc で戻る -> Enter は実行しない
