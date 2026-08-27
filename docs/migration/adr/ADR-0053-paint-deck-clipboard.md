# ADR-0053: Paint deck clipboard (Cut / Copy / Paste) and Delete all

- Status: accepted (clipboard スコープの判断のみ [OS clipboard interop](../../architecture/os-clipboard-interop.md) が supersede)
- Date: 2026-08-23
- Mapping rows: [`panel.coloring.deck.paint`](../mapping/panels.md#panelcoloringdeckpaint)

> **2026-08-23 追記**: 本 ADR の決定 1「clipboard のスコープ = worker 内 module singleton」は
> [OS clipboard interop](../../architecture/os-clipboard-interop.md) で OS クリップボードに置き換えられた
> (CueMol2 との相互運用と、将来の tritium 複数インスタンス間 copy&paste のため)。
> 決定 2 (Cut = 1 txn) と決定 3 (paste 位置 / 逆順挿入)、および行を文字列で保持して
> 貼り付け先で再コンパイルする方針はそのまま有効で、むしろプロセスを跨げる根拠になっている。

## Context

2026-08-21 の移行監査 (`mapping/_audit-260821.md` セクション 1、項目 1-3) が
残していた唯一の未追跡ギャップ。UXP の Paint deck は 6 コマンドを持つが
(`coloring-deck-paint.xul:32-67` のツールバー + `:73-95` の context menu)、
tritium の PaintTable は Add / Delete / Move up / Move down の 4 つしか実装して
いなかった。欠けていたのは **Delete all** (ツールバー `paintpanel-delallbtn`) と
**Cut / Copy / Paste** (context menu) の 4 コマンドである。

UXP の clipboard は OS clipboard を `application/x-cuemol2-json-paint`
(`qsc-copipe.js:28,48`) という独自 flavor で使い、中身は
`[{"sel": "...", "col": "..."}]` という **JSON 文字列**だった
(`coloring-panel.js:1010-1026` `onCopy` / `_copyPaintEntryImpl`)。
オブジェクト参照ではなく文字列を載せていたため、コピー元の renderer が消えても、
別 scene に貼り付けても paste が成立していた。

## Decision

4 コマンドとも worker service として実装し
(`worker/server/services/coloring/paintClipboard.ts`)、
`ServiceMap` に `copyPaintEntries` / `cutPaintEntries` / `pastePaintEntries` /
`clearPaintEntries` / `getPaintClipboardInfo` の 5 行を追加した。
UI は既存の `.color-actions` ボタン行の拡張 (context menu ではない) で、
Delete all を list 編集グループの末尾に、Cut / Copy / Paste を 2 つ目の
ButtonGroup として置く。

判断が必要だった 3 点は以下の通り。

**1. clipboard のスコープ = worker 内 module singleton。** OS clipboard では
なく `sceneClipboard.service.ts` (scene ノードの Copy/Paste) と同じ worker
プロセスローカルの singleton を使う。worker は単一スレッドなので全 service が
同じ状態を共有でき、`WorkerContext` に通す必要がない。**行の中身は UXP と同じく
文字列** (`MolSelection.toString()` / `AbstractColor.toString()`) で保持し、
paste 時に貼り付け先の scene uid で `makeSel` / `makeColor` により再コンパイル
する。したがって **renderer 間・scene 間・object↔renderer 間の paste は成立する**
(UXP が JSON 文字列から得ていた性質と同一)。失うのは CueMol プロセス間の
paste だけで、これは scene ノード clipboard で既に受け入れている trade-off。

**2. Cut の undo 粒度 = 1 txn。** UXP `onCut` は `onCopy` + `onDeleteCmd` の
連鎖で、txn を開くのは delete 側だけ (copy は scene を変更しない)。同じ構成に
し、`'Cut paint entry'` という 1 つの txn で削除する。ユーザーから見て
「Undo 1 回で切り取った行が戻る」となる。

**3. paste 位置 = UXP `_pasteImpl` に準拠。** 行が選択されていれば
その行の直前に、選択が無ければ末尾に追加する。insert-before の場合は
**固定 index に逆順で** `insertBefore` を呼ぶことで、貼り付けたブロックが
clipboard 上の順序を保つ (UXP は `adds.reverse()` してから前挿入する。
同じ結果を得るための同じ手口)。paste 後は先頭の貼り付け行を選択状態にする
(UXP の `rangedSelect(nstart, nend)` を単一選択に畳んだもの)。

## Consequences

- Paste ボタンは clipboard が空の間 disabled になる。UXP は
  `onCtxtMenuShowing` に「TO DO: check clipboard」とコメントを残したまま常時
  有効だったので、これは UXP からの改善方向の逸脱。gate 用に
  `getPaintClipboardInfo` を置き、Copy/Cut は結果の `count` で、pane の初回
  mount 時のみ問い合わせで同期する。
- ~~**複数行の Cut / Copy は service 契約としては可能だが、UI からは 1 行のみ。**~~
  **[2026-08-27 解消]** service は当初から `idxs: number[]` を受け、正規化
  (昇順・重複除去・範囲外除去) と降順削除まで実装済みだったが、tritium の
  PaintTable が単一行選択 (`selectedRow: number | null`) だったため呼び出し側は
  常に 1 要素を渡していた。UXP の tree は `seltype="multiple"` だったので、これは
  残存する parity gap だった。PaintTable に `selectedRows: Set<number>` +
  anchor を入れて Cmd/Ctrl+click トグルと Shift+range に対応し、Delete / Cut /
  Copy が選択全体に効くようになった。複数削除用には `removePaintEntries` を
  追加 (降順削除・単一 txn)。**Move up/down は単一選択のまま**にした — UXP は
  multi 対応だが `nodes[0]` / `nodes[nlen-1]` だけをアンカーにするため非連続の
  選択を連続ブロックへ畳んでしまい、ユーザーの並びを壊す。意図的な逸脱。
- **[2026-08-27] Cut / Copy / Paste / Delete all は toolbar から context menu へ移した。**
  当初はこの ADR の判断どおり `.color-actions` にボタンとして置いたが、8 個は
  パネルを狭めると 2 行に折り返してしまう。UXP の配置 (`paintPanelCtxtMenu`)
  に戻し、toolbar は Add / Delete / Move up / Move down の 4 つだけにして
  `flex-wrap: nowrap` を保証した。キーボードの Cmd+X/C/V は `paint-deck` の
  clipboard scope 経由で変わらず効く。
- clipboard は worker の生存期間だけ持続する。アプリ再起動で失われるが、
  scene ノード clipboard と同じ寿命なので挙動は一貫している。
- paste 時に compile できなかった行 (名前付き選択が貼り付け先の scene に無い等)
  はその行だけ捨てて残りを貼る。UXP の per-entry `try/catch` と同じ。全行が
  compile できなければ txn を開かずに `ok:false` を返す。

## Notes

- 実装: `worker/server/services/coloring/paintClipboard.ts` (5 service)、
  `coloring/types.ts` の args/result 型、`rendererColoring.service.ts` の
  再エクスポート + `services` 登録、`worker/shared/WorkerCalls.ts` の
  `ServiceMap` 5 行。
- UI: `components/panes/ColorPane.tsx` の `PaintTable` (ボタン 4 つ +
  `canPaste` prop) と本体側ハンドラ、`data/appIcons.ts` の `ui.cut` /
  `ui.paste` (Copy は既存の `ui.duplicate` を流用 — RenderResultPane の
  clipboard コピーと同じ glyph)、`styles/_color-panel.css` の
  `.color-actions` に `flex-wrap` + `gap`。
- C++ 変更なし。`PaintColoring.qif` に `clear()` / `append` / `insertBefore` /
  `removeAt` / `getSelAt` / `getColorAt` / `size` が既にある。
- UXP 参照: `uxp_gui/cuemol2/base/content/coloring-panel.js`
  `onCopy` (:1010) / `onCut` (:1028) / `onPaste` (:1035) /
  `_copyPaintEntryImpl` (:1088) / `_pasteImpl` (:1121) /
  `_getPaintSelImpl` (:1176) / `onDeleteCmd` の delete-all 分岐 (:909-943)、
  `coloring-deck-paint.xul`、`components/jsmods/cuemol2ui-lib/qsc-copipe.js`。
- テスト: `__test__/paintClipboardService.test.ts` (worker 側 15 case —
  文字列再コンパイル / 逆順挿入 / 降順削除 / txn ラベル / materialize)、
  `__test__/colorPaneWire.test.tsx` に wire 5 case (ボタン → service 名 +
  payload、Paste の gate)。
