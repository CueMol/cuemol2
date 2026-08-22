# ADR-0004: Renderer context menu — Coloring, Paint, Style, Change-type

- Status: accepted (Edit / Create style dialogs verified in-app 2026-08-22)
- Date: 2026-05-13
- Mapping rows: [`panel.workspace.ctxmenu.renderer`](../mapping/panels.md#panelworkspacectxmenurenderer)

## Context

The UXP renderer-row context menu carries the most diverse set of
commands of any tree row: header items, Copy, a static Coloring submenu,
a dynamic Paint(SS) submenu populated from `StyleManager.getStyleNamesJSON`,
a Paint color-picker, a Style (shape) submenu populated from registered
style entries, a renderer-selection submenu, a Generate-surface item
(isosurf only), a Change-type submenu, and Edit-style / Create-style
dialogs.

Several of these need pre-fetched data from the worker (style entries,
renderer-paint info, compatible types). We cannot pre-fetch all of them
on every right-click — that would block menu show on a noticeable
round-trip. We also cannot fetch from the menu callback because the
Electron menu is built synchronously in the main process from the
renderer-supplied template.

There is also a pile of UXP corner-cases (`*selection` / `*group` /
`atomintr` / `disorder` exclusions, molsurf forcing `colormode =
"molecule"`, type-suffix regex matching for Style entries) that needs to
be ported faithfully or features will subtly differ.

## Decision

**Pre-fetch on right-click**, then build the menu from the resolved
data. Each submenu has its own pre-fetch service that returns
exactly the shape the menu needs — no re-resolution in the menu builder.

**Coloring (Phase 3c-1, static).** CPK molcol/dark/light → `applyStyles`
after stripping `/Paint$/`. B-factor / Rainbow → `createObj` + assign.
Gated by class name (`*selection` / `*namelabel` / `atomintr` hide the
submenu). molsurf forces `colormode = "molecule"`. Helper:
`styleutil.ts`.

**Paint(SS) (Phase 3c-2, dynamic).** `getPaintColoringStyles` reads
global + scene `getStyleNamesJSON`, filtered by `/Paint$/`.
`RendColoringId` widened to `` `style-${string}` ``.

**Paint color-picker (Phase 3c-3a).** Replica of UXP `color-menu.xul`.
`paintRendererSelection` runs under "Insert paint entry" undo txn.
Gated by `getRendererPaintInfo.canPaint`.

**Style submenu (Phase 3c-3b).** `getRendererStyleEntries` filters by
type-suffix `/<type>$/i` + edge `/^EgLine/` (edge omitted for simple /
trace / spline / contour / `*namelabel` / `*selection`).
`applyRendererStyle` runs `styleutil.remove` + `push` + `applyStyles`
under "Change style" txn. Type-name regex metachars are escaped before
the suffix match.

**Change selection submenu.** Current / All / Protein / Nucleic / Water
/ Ligand / Sugar via `setRendererSelection`: 'current' reuses parent
`mol.sel`; others compile via `makeSel`. Assignment to `rend.sel` runs
under "Set renderer sel" undo txn. Submenu hidden for `*selection`.

**Generate surface obj (isosurf only).** `generateRendererSurfObj`
calls `rend.generateSurfObj()`, adds the result to the scene with
unique name `${mol.name}_sf{N}`, attaches a `molsurf` renderer with
unique name `molsurf{N}`, and transfers `colormode` (the `multigrad`
branch copies `multi_grad` + `elepot`; otherwise `defaultcolor`) under
"Generate surfobj" undo txn.

**Change type (Phase 6b).** `getRendererChangeTypes` pre-fetches
`obj.searchCompatibleRendererNames()` filtered to non-synthetic /
non-atomintr / non-disorder, excluding the current type; submenu hidden
when empty (doubles as the gate, including the `*selection` / `*group`
/ `atomintr` / `disorder` source-renderer cases). `changeRendererType`
mirrors UXP non-selection branch: `strMgr.toXML2(rend, newType)` →
`fromXML` → `applyStyles(getDefaultStyleName(newType))` (pre-attach),
then `obj.destroyRenderer` + `obj.attachRenderer` under "Change rend
type" undo txn. UXP `*selection` conversion path is deliberately
skipped — it requires the new-renderer setup dialog.

**New Renderer (Phase 4d).** Renderer rows resolve parent obj via
`rend.getClientObj()` and inherit `rend.group`; otherwise the flow
matches the object ctxmenu (see [ADR-0003](ADR-0003-object-ctxmenu-phases.md)).

**Edit style / Create style (Phase 6c).** Blueprint replacements for
UXP `apply_rend_style.xul` / `rendstyle_create.xul`.

- *Edit style.* Pre-fetches current applied styles (parsed from
  `rend.style`) + grouped Add-popup entries (type-suffix / edge /
  coloring filters from `populateAddMenu`) via `getRendererStyleEditInfo`.
  Dialog supports list reorder + an Add popup with already-applied items
  dimmed. Commit dispatches `applyRendererStyleList` (joins with "," and
  calls `rend.applyStyles` under "Change style" undo txn).
- *Create style.* Pre-fetches writable style sets (filters out readonly
  + global "system") via `getCreateRendStyleInfo`. Dialog renders a
  listbox + `<base name>` input with the renderer's `type_name` shown as
  a postfix. Commit calls `createStyleFromRenderer` worker which appends
  the type_name and invokes `StyleManager.createStyleFromObj` (C++
  overwrites same-name nodes internally — UXP's confirm dialog is
  dropped per the auto-overwrite pattern used elsewhere).

## Consequences

- **Pre-fetch on right-click** keeps the menu reactive but adds a
  round-trip per right-click. Acceptable because right-click is a
  deliberate action, not a hover.
- **One worker service per submenu** keeps each unit-testable, at the
  cost of more files in `worker/server/services/`. The aggregated count
  is documented in `WorkerCalls.ts` (see Tier 4.1 of the refactoring
  plan for whether to auto-generate that file).
- **Class-name gates are hard-coded** (`*selection`, `*namelabel`,
  `atomintr`, etc.). This mirrors UXP behaviour but means new renderer
  class names need to be considered each time a submenu is added.
- **`*selection` Change-type is not supported** — a deliberate scope cut
  vs UXP. Adding it requires the new-renderer setup dialog wiring.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/hooks/useSceneContextMenu.ts` —
  renderer branch
- `tritium/react-gui/src/renderer/worker/server/services/rendererColoring.service.ts`
  — Coloring + Paint(SS) + Paint color-picker
- `tritium/react-gui/src/renderer/worker/server/services/rendererStyle.service.ts`
  — Style submenu + Edit-style dialog backend
- `tritium/react-gui/src/renderer/worker/server/services/setRendererSelection.service.ts`
  — Change sel submenu
- `tritium/react-gui/src/renderer/worker/server/services/generateRendererSurfObj.service.ts`
  — Generate surface obj
- `tritium/react-gui/src/renderer/worker/server/services/getRendererChangeTypes.service.ts`
  / `changeRendererType.service.ts` — Change type
- `tritium/react-gui/src/renderer/worker/server/services/createStyleFromRenderer.service.ts`
  — Create style dialog backend
- `tritium/react-gui/src/renderer/worker/server/services/helpers/styleutil.ts`
  — shared style helpers

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel_ctxtmenu.js` — renderer
  branch
- `uxp_gui/cuemol2/base/content/color-menu.xul` — Paint color-picker
  source
- `uxp_gui/cuemol2/base/content/apply_rend_style.xul` — Edit style
  dialog source
- `uxp_gui/cuemol2/base/content/rendstyle_create.xul` — Create style
  dialog source

### Known issues

**Resolved 2026-08-22 — Edit / Create style dialogs.** From 2026-05-13 this
ADR recorded that the two dialogs "do not behave correctly in-app", deferred
for triage. The re-check found nothing wrong: both work. Verified in-app --
the Add popup's three sections and their already-applied exclusion, the
applied styles reaching the rendering, style reordering with working
undo/redo, and Create style writing a correctly named style into the chosen
set (visible afterwards in the Explorer scene context menu).

A line-by-line comparison against UXP (`style/apply_rend_style.js`,
`style/rendstyle_create.js`) had already found the ported logic equivalent at
every step -- list parse, low/high priority order, insert position, move
up/down, the `join(',')` + `applyStyles` commit inside one undo txn -- so
either the original observation was of a defect fixed incidentally since, or
it was a misreading of the priority order. No code change was needed to close
it.

### Pending

- Edit interaction list (Phase 6c, deferred)

### Related ADRs

- [ADR-0003](ADR-0003-object-ctxmenu-phases.md) — Object ctxmenu, shares
  Paint / New Renderer / clipboard helpers
