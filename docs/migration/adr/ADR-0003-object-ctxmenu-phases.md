# ADR-0003: Object context menu — phase decomposition and per-phase choices

- Status: accepted
- Date: 2026-05-12
- Mapping rows: [`panel.workspace.ctxmenu.object`](../mapping/panels.md#panelworkspacectxmenuobject)

## Context

The UXP object-row context menu accumulates many independent commands —
Show / Hide / Rename / Delete / Properties, a Selection submenu, Copy /
Paste, New Group, New Renderer, object-level Paint, and Save As. Doing
all of them at once would block too many other migration items behind a
single PR; doing them in arbitrary order would tangle worker services
that need to share helpers (e.g. Selection and Around use the same
`makeSel` + `selStrTransforms` helpers).

We therefore broke the object ctxmenu into Phases, each focused on a
coherent slice of UXP behaviour, and each landing as its own PR with the
required worker services.

## Decision

The object ctxmenu lands in six phases. Per-phase summary:

**Phase 3a — header items.** Show / Hide / Rename / Delete / Properties
(stub). Properties uses the read-only key/value `getNodeInfo` stub
shared with the panel toolbar.

**Phase 3b — Selection submenu.** all / unselect / invert / protein /
nucleic / water / sugar / hydrogen / sidechain via `selectObjectMol`
worker.

**Phase 4a — Copy / Paste.** Worker-singleton clipboard
(`StreamManager.toXML/fromXML`); pasted renderer name uniquified against
the parent mol's existing renderers.

**Phase 4d — New Renderer.** `getNewRendererOptions` pre-fetches
`{rendererTypes, defaultName, objName, objClassName, isMol, targetObjId,
groupName}`, resolving the target object uniformly across object /
renderer / rendGroup rows (object → self; renderer / rendGroup →
`rend.getClientObj()`, with renderer rows inheriting `rend.group`). The
shared `NewRendererDialog` reuses `RendererOptionsPane` (the same
component the file-open flow uses, mirroring UXP's
`setupRenderer.xul ↔ fopen-renderopt-page.xul` overlay). On confirm,
`createRendererOnObject` calls the shared `setupRenderer` helper inside a
"Create new <type> renderer" undo txn and assigns `rend.group` if
present.

**Phase 5d — Object-level Paint.** UXP `ws.onPaintMol` is shared between
renderer and object branches. We add `paintObjectSelection` +
`getObjectPaintInfo` services on `rendererColoring.service` that operate
directly on `MolCoord.coloring` / `MolCoord.sel`. The `color-menu.xul`
replica submenu (used by renderer Paint, see [ADR-0004](ADR-0004-renderer-ctxmenu.md))
is reused on the object row, gated by a pre-fetched `canPaint`
(PaintColoring class + non-empty `mol.sel`).

**Phase 6a — Around / Around-byres.** Around (3/5/7/10 Å) and
Around-byres (3/5/7 Å) under the same Selection submenu. `SelectMolKind`
widened with `around{3,5,7,10}` / `aroundByres{3,5,7}`. `resolveSelStr`
rewrites the previous selection via shared
`helpers/selStrTransforms.rewriteAround` (the same helper used by the
viewport ctxmenu); no-op when prev sel is empty (matches UXP
`molSelAround` early return).

**Save As.** `objectSave.service` adds `getObjectSaveInfo` (writers via
`StreamManager.findCompatibleWriterNamesForObj` ∩ `getInfoJSON2`
category=1; default file name = `<obj.name>.<ext>` when `obj.src` is
empty, `copy_of_<leaf>` + `dirname` otherwise — UXP
`Qm2Main.onSaveAsObj` parity) and `saveObjectToFile` (runs the
`createHandler → setPath → convToLink=true → attach → write → detach`
chain with cleanup-on-throw). New `DIALOG_OBJECT_SAVE` IPC handles the
multi-filter native save dialog and recovers the filter index from the
chosen file extension (Electron does not return it natively).

## Consequences

- **Each phase is independently reviewable** and lands as its own PR
  with self-contained worker services.
- **Helpers (`selStrTransforms`, `makeSel`, `setupRenderer`) are shared
  across the object / renderer / rendGroup branches**, so adding a Phase
  to one branch typically gives the others the same capability for free.
- **Properties was a stub through every phase of this ADR** — it used the
  read-only key/value `getNodeInfo` bridge. It was superseded later by the
  Inspector work in [ADR-0015](ADR-0015-generic-property-inspector.md):
  `showProperty` now opens the Inspector, which defaults Object targets to
  the structured Properties tab (`ObjectCommonSection`). The "Phase 5
  per-type editor" wording only ever applied to *renderer* types; UXP's
  `object-propdlg.xul` has a single "Common" tab and no per-type object
  pages, so nothing further is owed on the object branch.
- **Regenerate surface (Phase 6c) landed separately** — see
  [ADR-0047](ADR-0047-molsurf-regenerate.md).

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/hooks/useSceneContextMenu.ts` — object
  branch
- `tritium/react-gui/src/main/sceneContextMenu.ts` — main-process menu
  builder, object branch
- `tritium/react-gui/src/renderer/worker/server/services/sceneOps.service.ts`
  — Show / Hide / Rename / Delete / Properties shared service
- `tritium/react-gui/src/renderer/worker/server/services/sceneClipboard.service.ts`
  — copy / paste
- `tritium/react-gui/src/renderer/worker/server/services/createRendererGroup.service.ts`
  — New Group
- `tritium/react-gui/src/renderer/worker/server/services/createRendererOnObject.service.ts`
  / `getNewRendererOptions.service.ts` — New Renderer
- `tritium/react-gui/src/renderer/worker/server/services/rendererColoring.service.ts`
  — `paintObjectSelection` / `getObjectPaintInfo` (Phase 5d)
- `tritium/react-gui/src/renderer/components/inspector/ObjectCommonSection.tsx`
  — Properties (via the ADR-0015 Inspector, not this ADR's stub)
- `tritium/react-gui/src/renderer/worker/server/services/regenMolSurf.service.ts`
  — Regenerate surface (ADR-0047)
- `tritium/react-gui/src/renderer/worker/server/services/helpers/selStrTransforms.ts`
  — `rewriteAround` (Phase 6a)
- `tritium/react-gui/src/renderer/worker/server/services/objectSave.service.ts`
  — Save As

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel_ctxtmenu.js` — object
  branch (`wspcPanelObjCtxtMenu`, `onPaintMol`, `molSelAround`,
  `pasteRendImpl`)
- `uxp_gui/cuemol2/base/content/workspace_panel.js` — `Qm2Main.onSaveAsObj`

### Pending

- (none — every inventory feature of `panel.workspace.ctxmenu.object` is
  wired; the row is `done`.)

### Related ADRs

- [ADR-0004](ADR-0004-renderer-ctxmenu.md) — Renderer ctxmenu, shares
  Paint / New Renderer / clipboard helpers
- [ADR-0047](ADR-0047-molsurf-regenerate.md) — Regenerate surface
  (Phase 6c), the last non-Properties item of this branch
