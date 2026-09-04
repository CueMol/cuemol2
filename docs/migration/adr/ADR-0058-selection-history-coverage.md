# ADR-0058: Selection history records every applied selection

- Status: accepted (host E2E verified)
- Date: 2026-09-04
- Mapping rows: [`widget.molsellist`](../mapping/custom_widgets.md#widgetmolsellist), [`panel.selection`](../mapping/panels.md#panelselection)

## Context

UXP `util.selHistory` (`uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/util.js`)
is appended from every surface that applies a selection: the renderer / object
property pages (`property/renderer-common-page.js`, `cartoon-propdlg.js`,
`molsurf-page.js`, `contour-propdlg.js`, `isosurf-propdlg.js`), the file-open /
New Renderer options page (`fopen-renderopt-page.js`), the tool dialogs, the
workspace panel Select submenu (`workspace_panel_molsel.js`), the view context
menu, click / shift-click / rectangle selection (`topbar/navi-toolribbon.js`
through `cuemolui.chgMolSel(..., true)`), the sequence panel and the molecular
structure panel. Only Invert / Unselect passed `aSaveHis=false`.

The tritium port kept the store (`h3-kit/MolSelList/selHistory.ts`, a
localStorage MRU) but left recording to each host, and only the SelectionPane's
hand-typed apply, the paint table cell, the file-open dialog and nine tool
dialogs pushed. The most used inputs never reached the history: the inspector's
selection rows (`sel`, `anchor_sel`, `showsel`, `bndry_sel`), the New Renderer
dialog (the same `RendererOptionsPane` as file open), the scene tree's
Selection submenu, the renderer "Change sel" submenu, the 3D-view context menu,
rectangle / lasso picks and the Mol Struct pane buttons.

## Decision

Record every selection a user action applied, from the renderer thread, using
the value the successful command applied:

- A host that owns the expression pushes it after the write succeeded:
  `InspectorProvider.setProp` / `setMany` for `object<MolSelection>` writes
  (`isMolSelectionType`, so every selection row is covered in one place),
  `useRendererOptions.commitHistory` for both the file-open and New Renderer
  dialogs, the SelectionPane "Define name" action, and the MolStructPane
  Select / Center / Zoom buttons.
- A worker service that builds the expression itself returns it, because the
  worker has no localStorage: `selStr` on `selectObjectMol`,
  `setRendererSelection`, `naviCtxSelect` / `naviCtxAddSelect` /
  `naviCtxInvertSel` / `naviCtxToggleSidechain` / `naviCtxAround`, and
  `selStrs` (one per updated object) on `rectSelect` / `lassoSelect`. The
  renderer records through `recordAppliedSel(res)`.
- Incremental picks coalesce: sequence-panel residue click / drag
  (`toggleResidueSelection` / `rangeSelectResidues`) and the 3D-view
  double-click toggle / extend (`naviResidSel`) apply the whole `mol.sel`
  and return it as `selStr`; `recordIncrementalSel` replaces the previous
  pick's entry when it is still the most recent one, so a run of clicks
  leaves only its final state instead of one entry per click. Anything
  recorded in between ends the run.
- The SelectionPane builder ops stay unrecorded
  ([ADR-0051](ADR-0051-selection-pane-live-sel.md)).
- The push guard is unchanged (`''`, `*`, `none` are dropped). Invert and
  Toggle sidechain results are recorded: UXP skipped Invert, the rule is now
  uniform. The cap grows from 40 to 100 entries.

Rejected: recording from the C++ `sel` PROPCHG event. It would also record
undo / redo, `.qsc` loads (one entry per renderer) and scripts, and the event
carries no value, so each would cost a read-back.

## Consequences

- The history reflects what the user did in any surface; `*` / empty
  selections still never appear.
- Rectangle / lasso entries are `aid` range lists (`aid 12:40,77:90`): long
  but reapplicable. The History menu truncates them and shows the full text as
  the tooltip.
- Worker results gained a field. `SelectionResult.selStrs` is parallel to
  `selectedObjIds`.
- The history stays a single global list (not per scene), as in UXP.

## Notes

- Implementation: `h3-kit/MolSelList/selHistory.ts` (`recordAppliedSel`,
  `recordIncrementalSel`, `MAX_ENTRIES`), `worker/shared/genericProps.ts`
  (`isMolSelectionType`),
  `state/inspector/InspectorProvider.tsx`,
  `dialogs/fopen-opt-dlgs/useRendererOptions.ts`,
  `features/selection/{SelectionPane,MolStructPane}.tsx`,
  `hooks/sceneTree/useSceneTree{Node,Renderer}Ops.ts`,
  `features/sequence/SequencePanel.tsx`,
  `features/molview/{useNaviContextMenu.ts,useNaviClickHandler.ts,RectSelectOverlay.tsx}`;
  worker `select/selectObjectMol.ts`, `rend/setRendererSelection.ts`,
  `navi/naviCtxtMenu.ts`, `navi/naviTool.ts`, `select/applySelectionHits.ts`,
  `select/seqPanelOps.ts`.
- UXP parity: `uxp_gui/cuemol2/base/content/molsellist.js` `addHistorySel`,
  `cuemol2-utils.js` `chgMolSel` / `chgMolSelObj` (`aSaveHis`), `util.js`
  `selHistory` (cap 10; `*` / `none` stored but hidden in the combobox).
- Related: [ADR-0044](ADR-0044-selection-quick-pick.md) (History tab),
  [ADR-0051](ADR-0051-selection-pane-live-sel.md) (builder ops stay
  unrecorded).
