# ADR-0028: Style editor — 3-tab modal with live-applied style-set CRUD

- Status: accepted (host E2E verified; PR pending)
- Date: 2026-06-12
- Mapping rows: [`dialog.style-editor`](../mapping/other_dlgs.md#dialogstyle-editor), [`panel.workspace.ctxmenu.style`](../mapping/panels.md#panelworkspacectxmenustyle)

## Context

The UXP "Style editor" (`style/style_editor.xul`) edits a single style SET via
three tabs: Color (named colours + Add/Delete + colour picker), Selection (named
MolSel definitions + Add/Delete + name/value), and Styles (style entries +
Delete). It was the last pending piece of the style context menu (Phase 5a).

The C++ `StyleSet` already exposes everything needed (`getColorDefsJSON`,
`getColor`, `setColor`, `removeColor`; `getStrDataNamesJSON`/`getStrData`/
`setStrData`/`removeStrData` for the `sel` category; `getStyleNamesJSON`,
`removeStyle`), reachable via `StyleManager.getStyleSet(uid)`. `setColor` takes
a compiled `AbstractColor`, so colour strings must go through
`StyleManager.compileColor`. The separate renderer-level Apply/Create style
dialogs have an unrelated in-app behaviour bug that is tracked on
`panel.workspace.ctxmenu.renderer` and is explicitly out of scope here.

## Decision

Add a worker service `styleSetEdit.service` and a Blueprint `Tabs` modal
`StyleEditorDialog`, launched from the style context menu "Edit…":

- **Live-apply, not OK/Cancel.** Each Add / Delete / edit calls a worker service
  immediately (one undo step each, `firePendingEvents` to refresh the tree and
  other panels) and the dialog refetches `getStyleSetContents`; the dialog has
  only a Close button. This matches the ColorPane deck editors and avoids a
  diff-on-OK model. Per-edit undo (Cmd+Z) replaces the UXP OK/Cancel. This is
  the load-bearing departure from the UXP dialog.
- **Service surface:** one reader (`getStyleSetContents` → colours with resolved
  hex, selections from the `sel` str-data category, style entries with type) and
  five writers (`setStyleSetColor` compiles then `setColor`; `removeStyleSetColor`;
  `setStyleSetSelection`/`removeStyleSetSelection` on the `sel` category;
  `removeStyleSetStyle`). Each writer resolves the set + active scene, runs in a
  `withUndoTxn`, and fires pending events.
- **Reuse:** the Color tab uses the existing `ColorField` + `ColorPickerProvider`
  (the colour string is compiled in the set's scope). The Selection tab uses a
  small controlled input (commit on blur/Enter); the Styles tab is delete-only
  (style entries are created elsewhere, e.g. `createStyleFromRenderer`).
- **Read-only sets** are shown view-only (all edit affordances disabled).
- Launched via a new `editStyle` ctxmenu action + dispatch case, threading
  `showStyleEditor` through the scene-ctxmenu dialog-hook context.

## Consequences

- No C++/`.qif` changes — `StyleSet` already exposed the full CRUD surface.
- Live-apply means there is no "Cancel the whole session" — each change is its
  own undo step. Acceptable and consistent with the rest of the app's editors.
- Selection values are edited as free text (not the full `MolSelList` builder)
  to keep the per-row editor light and free of the selection widget's
  localStorage/event dependencies; the builder can be swapped in later if needed.
- The renderer Apply/Create style dialog bug remains a separate triage item.

## Notes

- Implementation: `worker/server/services/styleSetEdit.service.ts` (6 methods;
  `ServiceMap` rows in `worker/shared/calls/`);
  `components/dialogs/StyleEditorDialog.tsx` (+ Provider, registered in
  `contexts/DialogContext.tsx`); wiring in `shared/types/sceneCtxMenu.ts` (`editStyle`
  action), `main/contextMenu/sceneCtxTemplates.ts` (style "Edit…" item),
  `hooks/sceneContextMenu/dispatchSceneCtxAction.ts` (case),
  `hooks/useSceneContextMenu.ts` (dialog-hook threading).
- C++ contract: `src/qsys/style/StyleSet.qif` (`getColorDefsJSON` /
  `getColor` / `setColor` / `removeColor`; `getStrDataNamesJSON('sel')` /
  `getStrData` / `setStrData` / `removeStrData`; `getStyleNamesJSON` →
  `[{name, desc, type}]`; `removeStyle`) + `StyleManager.getStyleSet` /
  `compileColor`. Colour preview hex from `AbstractColor.r()/g()/b()`.
- Reuses the name-keyed/scoped style pattern (ADR-0006) and the ctxmenu
  dialog-hook threading from ADR-0026 / ADR-0027.
- Tests: `__test__/styleSetEditService.test.ts`,
  `__test__/styleEditorDialog.test.tsx`.
