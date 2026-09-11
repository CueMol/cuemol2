# ADR-0002: Scene-tree inline rename — three triggers, single controller

- Status: accepted (click-pause-click trigger superseded 2026-09-10)
- Date: 2026-05-13
- Mapping rows: [`panel.workspace.tree`](../mapping/panels.md#panelworkspacetree)

## Context

UXP renames a scene-tree row via a modal `window.prompt` dialog launched
from the right-click "Rename…" item. We want a Tritium experience that
matches OS file-manager conventions (Finder / Explorer): the user can
rename inline by typing into the row label without opening a modal, and
the rename can be triggered by **F2**, the **right-click menu**, or a
**Finder-style click-pause-click**.

The three triggers must agree on which row is being edited. If each
trigger owned its own state, the UI would have race conditions (e.g. F2
opens the editor, but a stale ctxmenu callback also tries to open it on a
different row). The click-pause-click trigger also needs to coexist with
real double-click (Apply-to-view on camera rows, Properties on others)
without firing on every single click.

Camera rows have an extra constraint: at the C++ Scene API level cameras
have no in-place name setter once registered. A rename must atomically
destroy and re-register the camera under the new name.

## Decision

The `sceneEditingNodeId` state is the **single controller**.
All three triggers route through it via a `beginInlineRename(idStr)`
callback. The Blueprint `<InputGroup>` overlay is rendered when
`sceneEditingNodeId === node.id`.

**Triggers:**

1. **F2** on the selected row — instant.
2. **Ctxmenu "Rename…"** — instant (the `useSceneContextMenu` `rename`
   case just calls `beginInlineRename(idStr)`).
3. ~~**Finder/Explorer-style click-pause-click** — clicking an
   already-selected, single-selected, renameable row schedules
   `beginInlineRename` after a 500 ms delay. A real double-click within
   the window cancels the schedule (so selection / Apply-to-view /
   Properties still work normally).~~ **[2026-09-10 廃止]** 下記追記。

**Edit semantics:** Enter or blur commits, Esc cancels, empty or
unchanged input is a no-op.

**Renameable rows:** object / renderer / rendGroup / camera. Scene /
cameraRoot / styleRoot / style rows do not show the editor.

**Commit routing:**

- Camera rows → `renameCamera` worker (atomic
  `destroyCamera(old) + setCamera(new, cam)`).
- Other rows → generic `renameNode` worker.

## Consequences

- **Single source of truth** eliminates the multi-trigger race. Adding a
  fourth trigger later (e.g. a toolbar Rename button) means routing it
  through `beginInlineRename` — no new state.
- ~~**Click-pause-click adds a 500 ms perceived latency** on the pause
  path, but only when the user clicks an already-selected row. Real
  double-clicks still feel snappy because we cancel the schedule.~~
  **[2026-09-10 廃止]** 遅延ではなく**誤発火**が問題だった (下記追記)。
- **Camera atomic rename** keeps the UXP `onRenameCamera` parity but
  costs an extra C++ object lifecycle per rename. This is unavoidable
  given the Scene API surface and matches UXP behaviour.
- **The editor sits inside the Blueprint row label**, so the row hit-box
  is again a concern (same family as [ADR-0001](ADR-0001-scene-tree-dnd.md)).
  Empirically the InputGroup captures focus / typing correctly because
  Blueprint's row handlers do not interfere with input elements.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/hooks/useSceneTreeController.ts` —
  `sceneEditingNodeId` state and `beginInlineRename` callback wiring
- `tritium/react-gui/src/renderer/components/panes/InlineRenameInput.tsx`
  — the InputGroup overlay component
- `tritium/react-gui/src/renderer/components/panes/ScenePane.tsx` — the
  click-pause-click 500 ms scheduler
- `tritium/react-gui/src/renderer/hooks/useSceneContextMenu.ts` —
  `rename` case calls `beginInlineRename`
- `tritium/react-gui/src/renderer/worker/server/services/renameCamera.service.ts`
  — atomic destroy + setCamera
- `tritium/react-gui/src/renderer/worker/server/services/sceneOps.service.ts`
  — `renameNode` (generic non-camera path)

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel.js` — `onRenameCmd`,
  `onRenameCamera`

### Related ADRs

- [ADR-0001](ADR-0001-scene-tree-dnd.md) — DnD on the same row hit-box
- [ADR-0007](ADR-0007-scene-tree-multi-select.md) — Multi-select trigger
  interaction (single-selected-row check is required for click-pause-click)

## 追記 (2026-09-10): click-pause-click を廃止

ユーザー報告「tree をいじっているとすぐに name 変更モードに入る」。トリガ 3 を削除し、
rename の入口は **F2** と**右クリック Rename** の 2 つだけにした。

「選択済みの行を修飾キー無しで再クリックする」は、この ADR が想定していたより桁違いに
頻度が高い操作である: 3D view から pane に戻る、今どれが選ばれているか確認する、
ドラッグしかけてやめる — いずれも選択済み行の再クリックとして現れ、その全てが 500 ms 後に
rename を開いていた。rename 自体は稀な操作なので、頻出操作と衝突するジェスチャを
割り当てる価値がない。Finder は「名前テキスト上のクリックのみ」「マウスが動いたら無効」で
緩和しているがそれでも有名な罠で、VS Code のエクスプローラ・Xcode ナビゲータ・Blender の
アウトライナはいずれも採用していない。UXP の XUL tree (`workspace_panel.xul:16`
`editable="true"`) 由来の parity ではあるが、追随する価値のある挙動ではないと判断した。

これは [ui-style-guide](../ui-style-guide.md) の「listbox: 行の編集モード」規約
(行の単クリックは選択のみ / 編集は明示的操作でのみ) の適用でもある。同じ規約で Paint deck も
セル単位の表示 / 編集モードに分けた。

**Enter は割り当てない。** macOS の Finder / VS Code は Enter = rename だが、Windows では
Enter = 開く の慣習があり OS 間で意味がぶれる。頻度の低い操作に入口が 2 つあれば足りる。
将来 mac 限定で足すことは可能 (tree の key 処理で Enter は未使用)。

実装は `ScenePane.tsx` からタイマー一式 (`RENAME_CLICK_DELAY_MS` / `scheduleRename` /
`clearRenameTimer` / `selectedIdAtScheduleRef` と double-click との競合回避) を削除。
`handleNodeClick` は常に `onSelect` を呼ぶだけになった。回帰防止は
`__test__/scenePaneRenameKeys.test.tsx`「選択済み行の再クリックは (待っても)
`beginInlineRename` を呼ばない」。トリガ 1 / 2 と単一コントローラの判断は不変。
