# ADR-0026: Camera visibility-flags editor — scene-tree enumerate + clear-rebuild apply

- Status: accepted (host E2E verified; PR pending)
- Date: 2026-06-12
- Mapping rows: [`dialog.tool.visflagset-edit`](../mapping/tool_dlgs.md#dialogtoolvisflagset-edit), [`panel.workspace.ctxmenu.camera`](../mapping/panels.md#panelworkspacectxmenucamera)

## Context

A camera can capture a per-element visibility set (which objects / renderers are
shown when the camera is applied with vis flags), saved via
`Camera.saveVisSettings` and applied via `loadVisSettings`. The camera context
menu already wired Save/Apply-with-vis-flags and Clear-vis-flags, but the UXP
"Edit visibility flags" dialog (`tools/visflagset-edit-dlg`) — an editable tree
of `Inc` (captured) + name + `Vis` (captured visibility) per scene element — was
left as a disabled menu stub (Phase 6c). The C++ Camera already exposes the full
API (`getVisSetJSON`, `visAppend(tgtid, bVis, bObj)`, `visRemove`,
`clearVisSettings`, `vis_size`), and the dispatch case (`cameraEditVisFlags`)
existed but only logged "not implemented".

## Decision

Implement the editor as a Blueprint modal (`EditCameraVisFlagsDialog`) launched
from the camera context menu, backed by a new worker service
`cameraVisFlags.service`:

- **Read = enumerate + merge.** `getCameraVisFlags` parses the scene tree
  (`parseSceneTreeJSON(scene.getSceneDataJSON())`) to list every object /
  renderer / renderer-group, then cross-references the camera's stored set
  (`getVisSetJSON`, a `{ "<uid>": { include, visible } }` map). Each row's
  `included` reflects set membership; `visible` is the stored flag when included
  and the element's live visibility otherwise. The set alone is insufficient (it
  only holds captured elements), so the scene tree is the source of the full row
  list.
- **Write = clear + rebuild.** `setCameraVisFlags` runs, in one undo txn,
  `clearVisSettings()` then `visAppend(tgtId, visible, isObj)` for the included
  rows only. Because the dialog lists every current scene element, a full rebuild
  yields exactly the desired set and naturally drops stale uids (deleted
  elements). This sidesteps `visAppend`'s "already exists" error on in-place
  updates (no per-row visRemove/visAppend bookkeeping).
- **Launch.** Enable the existing "Edit vis flags…" menu item and complete the
  `cameraEditVisFlags` dispatch case (prefetch `getCameraVisFlags` → show dialog
  → `setCameraVisFlags` on confirm), threading `showEditCameraVisFlags` through
  the scene-ctxmenu dialog-hook context like the other ctxmenu dialogs.

## Consequences

- No C++/`.qif` changes — the Camera vis API was already complete; the work is a
  worker service + a modal + enabling the pre-built menu/dispatch skeleton.
- Clear+rebuild is simple and correct for the dialog's whole-set semantics, but
  it does rewrite the entire set on every OK (fine: vis sets are small and the
  op is a single undo step). It is not suitable for partial/streaming edits, but
  the dialog has none.
- `isObj` is derived from the scene-tree node type (`object` vs
  `renderer`/`rendGroup`) and passed to `visAppend`'s `bObj` flag, matching how
  the C++ stores object- vs renderer-scoped entries.

## Notes

- Implementation: `worker/server/services/cameraVisFlags.service.ts`
  (`getCameraVisFlags` / `setCameraVisFlags`; `ServiceMap` rows in
  `worker/shared/calls/`); `components/dialogs/EditCameraVisFlagsDialog.tsx`
  (+ `EditCameraVisFlagsDialogProvider.tsx`, registered in
  `contexts/DialogContext.tsx`); wiring in
  `main/contextMenu/sceneCtxTemplates.ts` (menu item enabled),
  `hooks/sceneContextMenu/dispatchSceneCtxAction.ts` (`cameraEditVisFlags` case),
  `hooks/useSceneContextMenu.ts` (dialog-hook threading).
- C++ contract: `src/qsys/Camera.qif` — `getVisSetJSON` / `visAppend` /
  `visRemove` / `clearVisSettings` / `vis_size`. `getVisSetJSON` value shape is
  `{ uid, type, include, visible }` per entry (`src/qsys/Camera.cpp`).
- Reuses the name-keyed camera access pattern (ADR-0005, `cameraOps.service`).
- Tests: `__test__/cameraVisFlagsService.test.ts`,
  `__test__/editCameraVisFlagsDialog.test.tsx`.
