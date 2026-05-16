# ADR-0012: Save Scene / Save Scene As — UXP parity (.bak, qsc_xml, option dialog)

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`menu.cuemol2`](../mapping/menus.md#menucuemol2) — File > Save Scene, File > Save Scene As

## Context

UXP's Save Scene path has subtleties that are easy to lose in a literal
re-implementation:

- `onSaveScene` falls through to Save As when `scene.src` is empty (or
  the file at that path has been deleted).
- Otherwise it backs up the existing file as `<path>.bak` *before*
  writing the new content (so a partial write doesn't lose the old
  scene).
- The writer used is `qsc_xml` — a specific writer name, not the
  generic "scene writer".
- The plain Save path **does not** show an option dialog — only Save As
  does. The option dialog (`qscwriter-option-dlg`) lets the user choose
  Embed / Compatibility / Compression / Text encoding, with constraint
  rules (QDF0 forces base64=false, compress=none).

We also have a Tritium-specific concern: macOS native menu accelerators
need a deliberate assignment for Save Scene As. UXP did not have a
keyboard shortcut for this, but `Shift+Cmd+S` is the OS convention and
was sitting unused on a stub `Save File As` item that is no longer
mapped.

## Decision

**Save Scene** (`CmdId.FileSave`):

1. Call `getSceneSaveInfo` worker to fetch `{ src, hasSrc }`.
2. If `src` is empty, or `IPC.FILE_EXISTS` returns false for `src`,
   fall through to Save As.
3. Otherwise, call `IPC.FILE_BACKUP_RENAME` (writes `<src>.bak`).
4. Call `saveScene` worker — uses the `qsc_xml` writer.
5. **No option dialog** on this path.

**Save Scene As** (`CmdId.FileSaveAs`):

1. Show native save dialog via `IPC.DIALOG_SAVE_SCENE` (filter `.qsc`).
2. Show `QscWriterOptionDialog` (Blueprint reframe of UXP
   `qscwriter-option-dlg.xul`):
   - Embed possible / Compatibility (QDF0 / QDF1) / Compression / Text
     encoding.
   - **QDF0 forces base64=false, compress=none.** The dialog enforces
     this client-side; the worker also validates.
3. Backup + write via `saveScene` worker.

**Accelerator.** `Shift+Cmd+S` (Mac) / `Shift+Ctrl+S` (Win/Linux) is
assigned to **Save Scene As** — taken from the stub `Save File As` item.

**ConfirmCloseTabDialog** (used by close tab and the quit chain) wires
its Save button to `CmdId.FileSave`. The close path aborts if the user
cancels the save dialog.

## Consequences

- **Backup-before-write protects against partial writes.** A crash
  mid-write leaves `<path>.bak` intact.
- **`qsc_xml` is the writer name** — hard-coded in the worker. If a
  new scene format is added, the writer name should become a
  parameter rather than a constant.
- **No option dialog on plain Save** — matches UXP and avoids
  surprising the user. Users who want to change format options must
  use Save As explicitly.
- **`Shift+Cmd+S` reassignment** is a UI improvement over UXP, not a
  parity loss. Documented here so future audits don't flag it as a
  divergence.
- **Save Scene path is the canonical Save** for both menu and
  ConfirmCloseTabDialog — adding any other "save scene" entry point
  should route through `CmdId.FileSave`, not duplicate the logic.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/worker/server/services/saveScene.service.ts`
  — `getSceneSaveInfo` + `saveScene` (uses `qsc_xml` writer)
- `tritium/react-gui/src/renderer/components/dialogs/QscWriterOptionDialog.tsx`
  — option dialog (Embed / Compatibility / Compression / Text
  encoding + QDF0 constraint)
- `tritium/react-gui/src/main/ipcHandlers.ts` —
  `DIALOG_SAVE_SCENE` (native dialog), `FILE_EXISTS`,
  `FILE_BACKUP_RENAME`
- `tritium/react-gui/src/renderer/commands/useFileCommands.ts` —
  `CmdId.FileSave` / `CmdId.FileSaveAs` registration

### UXP parity

- `uxp_gui/cuemol2/base/content/cuemol2_main.js` — `onSaveScene`,
  `onSaveSceneAs`, `writeSceneFile`
- `uxp_gui/cuemol2/base/content/qscwriter-option-dlg.xul` /
  `.js` — option dialog source

### Related ADRs

- [ADR-0010](ADR-0010-quit-chain.md) — `ConfirmCloseTabDialog` Save
  button uses `CmdId.FileSave` (this ADR's path)
