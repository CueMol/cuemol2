# Cmd+C / X / V をフォーカス文脈で振り分ける (undo/redo も含む)

- Status: accepted
- Date: 2026-08-23
- Related mapping rows: [`menu.cuemol2.edit`](../migration/mapping/menus.md#menucuemol2edit), [`panel.workspace.tree`](../migration/mapping/panels.md#panelworkspacetree), [`panel.coloring.deck.paint`](../migration/mapping/panels.md#panelcoloringdeckpaint)
- Related: [OS clipboard interop](os-clipboard-interop.md) (クリップボード本体)

これは UXP からの migration に関する判断ではないため、`docs/migration/adr/` ではなく
ここに置いている (migration ADR は migration 専用に保つ)。

## Context

キーボードで scene ノードと paint 行の copy&paste をしたい、というユーザー要望。

**UXP 版 CueMol2 にはキーボード copy&paste が存在しない。** Edit メニューに Cut/Copy/Paste の
項目自体が無く (`cuemol2-menus.xul:263-300` は Undo/Redo/Clear undo data + 分子ツール類のみ)、
`<key>` 要素は 10 個だけでいずれも C/X/V を含まず、command controller
(`cmd_copy` 等) も皆無。scene ノードと paint 行の clipboard は**すべて context menu 専用**
だった。したがってこれは parity ではなく **tritium 独自の新規 UX** であり、UXP 側は変更しない
(ユーザー確定)。

tritium 側の出発点:

- Cut/Copy/Paste は **pure role 項目** (`menuTemplate.ts:94-96`) で、`menu.ts:125-127` が
  accelerator 付与前に return するため Electron がネイティブのテキスト編集として処理していた
- アクセラレータは**全 OS でネイティブメニュー経由**。`createMenu(win)` は全 OS で走り
  (Win/Linux はバーを非表示にするだけ)、React MenuBar のアクセル表記は表示専用、
  グローバル keydown パーサは存在しない
- 先例として `MENU_SELECT_ALL` が「role では表現できない挙動を channel 化して renderer 側で
  スコープ解決する」形を既に取っている (`utils/selectAllScope.ts`)

### 一緒に見つかった undo/redo の穴

Cmd+Z は custom 項目 → `CmdId.Undo` → `cm.undo(sceneId)` で、**テキスト欄ガードが無かった**
(`useUndoRedoState.ts:131-133`、`activeElement` を見る箇所ゼロ)。scene の undo stack が
非空の間は、テキスト欄で Cmd+Z を押すと入力の取り消しではなく **scene undo が走っていた**。
stack が空のときだけメニュー項目が disabled になり Chromium ネイティブへフォールスルーする、
という偶然に依存していた。同じフォーカス文脈ルーティングで解消する。

## Decision

**Cut/Copy/Paste を role から custom channel 項目に変え** (`MENU_EDIT_CUT/COPY/PASTE`)、
アクセラレータを明示宣言する。role のままではキーストロークが renderer に届く前に
ネイティブ処理されてしまい — **macOS ではメニューの key equivalent が web content より先に
キーを取る** — 振り分けの余地が無いため、これが唯一の経路である。

振り分けは `renderer/utils/editClipboard.ts` が担う:

1. **テキスト文脈** → main が focused element に対してネイティブ実行
   (`IPC.TEXT_CTX_ACTION`)。cut/paste/undo/redo は `activeElement` が編集可能要素のとき、
   copy は加えて**非空の document selection があるとき** (log パネルの選択コピー)
2. focused element の `[data-clipboard-scope]` 祖先に登録されたハンドラ
3. **直近に操作した scope**
4. どれにも当たらなければネイティブへフォールバック (テキスト欄外では実質 no-op)

**手順 3 は必須**である。Win/Linux の Edit メニューは React コンポーネントなので、
Copy をクリックした時点で DOM フォーカスがメニュー側へ移り、手順 2 は何も見つけられない。
`data-keep-clipboard-scope` を付けた要素 (menubar) へのクリックでは記憶を維持し、
それ以外の scope 外クリックでは破棄することで、メニュー経由とキーボード経由が同じ結果になる。

パネル側は `useClipboardScope(id, handlers, enabled)` で登録し、コンテナに
`data-clipboard-scope="<id>"` を付ける。scene tree は `ScenePane` の `sp-pane-scroll`
(F2 用に既に `tabIndex={-1}`)、paint deck は table wrap と action row の両方 (ツールバー
ボタンのクリックで scope 記憶が消えないように)。paint deck は Paint deck 表示中のみ登録する。

**undo/redo** は `MENU_UNDO/REDO` を `SPECIAL_HANDLERS` に移し、`dispatchEditUndoRedo` が
true (= テキスト欄でネイティブ実行した) を返さなかった場合のみ `edit.undo` / `edit.redo` を
dispatch する。toolbar の Undo/Redo ボタンは `CmdId` 直行のままなので、明示クリックは常に
scene undo になる。

**scene ノードの Cut を新設**する。UXP には無かったが、Cmd+C が効く場所では Cmd+X も効くのが
当然の期待であるため。**コピーが成功 (= OS クリップボードへの書き込み完了) した場合にのみ削除**
する。削除は既存の undo txn を通るので、**Cmd+Z 1 回で復元**される。

main 側では 5 チャネル (EDIT_CUT/COPY/PASTE + MENU_UNDO/REDO) に
`webContents.getFocusedWebContents()` ガードを置き、**main window 以外**にフォーカスがある
場合 (Rendering window / devtools) はそのまま native 実行する。role だった頃はこれが暗黙に
成立していたので、custom 化による回帰を防ぐ。

## Consequences

- Cmd+C / X / V が scene tree と paint deck で機能し、Edit メニューからも同じ動作になる。
  Win/Linux の React メニューにはアクセル表記も出るようになった (副次改善)
- **テキスト欄の Cmd+Z が入力の取り消しになる** (既存バグの修正)。scene undo stack の
  空/非空という偶然への依存が無くなった
- `MenuBar.tsx` の `document.execCommand` 分岐 (`EXEC_COMMAND_ROLES`) が dead code になり削除。
  clipboard 系はすべて channel 経由に一本化された
- ダイアログ表示中は `menuBlock.ts` が全メニュー項目を無効化するので、ショートカットも自動的に
  効かなくなる (メニュー経由にしたことで無料で得られる性質)
- **`selectedId` 空のときの guard が必要だった**: `Number('')` は 0 で、これは scene root の
  uid に一致する。ガードが無いと「何も選択していない状態での Cmd+V」が scene root への
  paste になってしまう
- クリップボードの**内容自体は undo 対象外**。Cut を undo すると行/ノードは戻るが、
  クリップボードは cut したものを保持し続ける (一般的なアプリと同じ)
- ~~残る制約: paint deck の行選択は単一行のままなので Cmd+C も 1 行のみ~~
  **[2026-08-27 解消]** paint deck が複数行選択に対応
  ([ADR-0053](../migration/adr/ADR-0053-paint-deck-clipboard.md))。ただしキーボード経由が
  実際に行へ届くようになったのは 2026-09-10 に deck を表示/編集モードへ分けてから (下記追記)

## Notes

- 実装: `shared/{ipcChannels,types/textCtxMenu,ipcContract,menuActionMap,menuTemplate}.ts` の契約 5 点、
  `main/menu.ts` (focused-wc ガード + `runNativeEdit`)、`main/ipcHandlers.ts`
  (`TEXT_CTX_ACTION` に undo/redo)、`renderer/utils/editClipboard.ts` (新規)、
  `renderer/hooks/useClipboardScope.ts` (新規)、`renderer/hooks/useMenuDispatch.ts`
  (5 SPECIAL_HANDLERS)、`renderer/hooks/useSceneTreeController.ts` (scene scope + Cut)、
  `components/panes/{ScenePane,ColorPane}.tsx` (scope 属性)、`components/MenuBar.tsx`
  (execCommand 分岐削除 + `data-keep-clipboard-scope`)、`App.tsx` (tracking 起動)
- `TextCtxAction` (context menu の役割) と `TextEditAction` (ネイティブ編集、undo/redo を含む)
  を分けた。前者は menu の項目集合、後者は main が実行できる操作の集合
- テスト: `editClipboard.test.ts` (10 件 — 全分岐 + 登録解除)、
  `menuDispatch.test.tsx` に focus 別 undo/redo と clipboard channel の 3 件、
  `useSceneTreeController.test.tsx` に scope 7 件 (**コピー失敗時に削除しない**を含む)、
  `colorPaneWire.test.tsx` に scope 3 件、`textContextMenu.test.ts` /
  `menuPipelineExhaustiveness.test.ts` の追随
- UXP 参照 (いずれも「無い」ことの根拠): `cuemol2-menus.xul:100-168` (keyset 全量)、
  `:263-300` (Edit メニュー)、`workspace_panel.xul` / `coloring-deck-paint.xul` の
  context menu 定義、`shortcut-manager.js` (動的キー登録は view 移動 2 件のみ)

## 追記 (2026-09-02): Windows / Linux ではキーが届いていなかった

Context の「アクセラレータは全 OS でネイティブメニュー経由」という前提は Windows / Linux では
成立していなかった。これらの OS ではキーがまず renderer (Blink) に渡り、Blink は Ctrl+X/C/V/A を
editing command として (編集不可要素にフォーカスがあっても) 消費するため、メニューの accelerator は
一度も fire せず、scene tree での Ctrl+C / V は最初から動いていなかった (macOS は NSMenu が先取り
するので動いていた)。

対処として、Windows / Linux では renderer の keydown dispatcher
(`renderer/shell/keybindings/useMenuKeyBindings.ts`) が `ipcChannel` 項目の全ショートカットを所有し、
隠し native menu からは accelerator を外した。本 doc の振り分け (`editClipboard.ts`) は
`dispatchMenuChannel` より下流なので無変更で、mac と同じ経路を通る。詳細は
[keyboard shortcuts](keyboard-shortcuts.md)。

## 追記 (2026-09): Rendering window の undo/redo

render 設定が scene に保存され undo 対象になったため
([scene-app-data](scene-app-data.md))、`MENU_UNDO/REDO` の「main window 以外は native 実行」
ガードに例外を設けた。フォーカスが Rendering window のときは `RENDER_WINDOW_EDIT_PUSH` を
その window に push し、window 側 (`useRenderWindowEditKeys`) が `dispatchEditUndoRedo` で
テキスト欄かどうかを振り分ける。Cut/Copy/Paste/Select All と devtools は従来通り native 実行。
Windows / Linux では同 hook の keydown listener が Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z を受ける。

## 追記 (2026-09-10): 行そのものが入力欄のパネル → モード分離で解決

Coloring panel の Paint deck は 1 行が Selection 入力 + Color 入力で埋まっており、行を
クリックすればフォーカスは必ずどちらかの `<input>` に入る。手順 1 をそのまま適用すると
**Cmd+C / Cmd+V は常に「そのセルのテキスト」**を意味し、行のコピー & ペーストはキーボードから
到達できなかった (ADR-0053 が「キーボードも clipboard scope 経由で効く」と書いていたのは、
実際には wrapper `tabIndex=-1` にフォーカスがある場合だけだった)。実害として、複数行を選んで
Cmd+C → Cmd+V しても何も貼られない (macOS では envelope 文字列がセルに貼られることもない —
native paste 先が別の入力欄であるため)。

**最初は router に例外を作った** (`ClipboardScopeHandlers.claimsEditable`: 宣言した scope は、
入力欄がテキストを選択していないとき手順 1 を追い越せる)。これは**対症療法で、同日中に撤去した**
— Cmd+Z が直らないからである。undo は clipboard router を通らず `MENU_UNDO` →
`dispatchEditUndoRedo` へ行き、そちらは独自に「編集可能要素に focus があれば native」と判定する。
`claimsEditable` を足しても、paste 直後の Cmd+Z は入力欄の native undo のままだった。

**根治は入力欄を置かないこと**だった。[ui-style-guide](../migration/ui-style-guide.md) に
「listbox: 行の編集モード」規約を置き、行は表示状態ではテキストと swatch (と popover を開く
chevron) を描き、テキスト編集は double-click / Enter / F2 / 右クリックメニューでのみ入る形に
した (paint deck と scene tree の両方に適用)。これで **focus は「行」か「明示的に開いた
エディタ」の二択**になり、手順 1 の「テキスト欄が勝つ」は例外なしで正しくなる —
Cmd+X/C/V も Cmd+Z も、ユーザーから見て今どちらのモードかが分かる状態で行き先が決まる。

router 側に残した変更は 1 つだけ: **modal 判定を編集可能判定より前に移した** (害が無く、
「modal がキーストロークを所有する」という意図をそのまま順序で表せるため)。

同じ入れ替えで、Paint deck の**右クリックが複数選択を 1 行に潰す**バグも消えた。右ボタンの
mousedown が default で入力欄にフォーカスを移し、`PaintSelCell.onFocus` → `onSelect(idx)` が
選択を 1 行に置換していたもので (React はこれを `contextmenu` より先に flush する)、一時は
`onRowMouseDown` で `e.button === 2` を `preventDefault` して塞いでいた。表示状態の行には
入力欄が無く、focus と行選択を結ぶ `onFocus` も無くなったので、その抑止ごと不要になった。
