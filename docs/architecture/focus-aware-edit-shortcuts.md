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
- 残る制約: paint deck の行選択は単一行のままなので Cmd+C も 1 行のみ
  ([ADR-0053](../migration/adr/ADR-0053-paint-deck-clipboard.md) の parity gap は未解消)

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
