# ADR-0044: Tabbed selection widget — one-click named selections beside the builder

- Status: accepted (host E2E verified)
- Date: 2026-08-07
- Mapping rows: [`widget.molsellist`](../mapping/custom_widgets.md#widgetmolsellist), [`widget.selection-widget`](../mapping/custom_widgets.md#widgetselection-widget)

## Context

ADR-0021 replaced the OS-native picker with the `SelectionBuilder` popover, a
guided composer that made complex selections (set operations, distance shells,
hit-count previews) reachable without typing the grammar. It did so by folding
the ready-made expressions (named selection defs, history) into the composer as
two entries — `Named` / `History` — of the single Term keyword dropdown.

That demoted the most frequent operation. Selecting just the protein, a one
step action in the legacy UXP GUI (open a dropdown listbox, click `protein`),
became four: open the popover, switch the Term keyword to `Named`, pick
`protein` from the candidate dropdown beside it, press `Set`. Two operations of
different character — *picking a ready-made expression*, which is complete on
its own, and *composing a term*, which is inherently multi-step — shared one
control, and the cheap one paid the expensive one's cost.

The fix had to restore the one-click path without regressing to the old widget:
the composer's set operations, unary transforms, and hit-count previews are
real capability that the UXP dropdown never had.

## Decision

Split the widget by operation kind into four tabs (`SegmentField`), replacing
the single scrolling composer panel: **Named** and **History** list ready-made
expressions and apply on click; **Term** is the property/term composer with its
Apply row (Set / Add / Sub / Intersect); **Mod** holds the unary transforms
(Invert / Byres / Sidechain / Mainchain / Around / Expand), which take no term
and act on the current selection alone.

A Named / History click **always replaces** and finishes the interaction — it
routes through a new `onQuickApply` prop (falling back to `onApply`), which
`MolSelList` implements as "commit the new expression + close the popover" and
`SelectionPane` gets for free since its `onApply` already writes `mol.sel`
live. Combining a ready-made expression into the current selection (Add / Sub /
Intersect) stays available: the Term dropdown keeps its `Named` / `History`
keywords, now ordered **first** in the list. So the quick path and the
compositional path are separate surfaces rather than competing uses of one
control, and neither is reachable only through the other. `Enter` in a term
value field applies the term directly while the current selection is empty
(`Set` being the only meaningful operation then).

Supporting changes: `MolSelList` reads `getSelDefs.currentSel` to show the
molecule's applied selection as the Named tab's "Selected" entry; `CountTag`
abbreviates counts above 9999 (`12k` / `123k` / `1.2M`, exact value on hover);
`SegmentField` gains a catalog `compact` variant (`--field-segment-compact-h`,
group-label typography) for dense popover hosts.

## Consequences

- The frequent path is two clicks (open popover, click `protein`) — UXP parity
  — while the builder keeps every capability ADR-0021 added. The popover height
  drops sharply: one tab panel is visible at a time instead of Term and Modify
  stacked.
- Tab state is builder-local, so every popover open starts on Named (the
  frequent path). The operand draft stays container-owned, so switching tabs
  never loses a half-typed term.
- The Term / Mod tab labels replace the former `FieldSection` headings, which
  removes one hierarchy level from the panel; the Apply row lost its indent
  accordingly.
- A quick pick must commit the **new** value explicitly. `MolSelList`'s popover
  close-commit reads the `selectedSel` prop, still the pre-click value in that
  tick, so routing the pick through it silently restored the old selection.
  `handleQuickApply` commits directly and an `isOpen` guard in
  `handleInteraction` stops the trailing outside-click from re-committing;
  `MolSelList.test.tsx` pins "exactly one commit, carrying the new value".
- The hit-count badge is width-bounded by abbreviation rather than by
  truncation: a clipped number would misread as a smaller count, and an
  unbounded one wrapped the Angstrom unit onto its own line in the Mod tab.
- Not done: per-item hit counts in the Named / History lists. Up to ~50 entries
  would each need a `getSelHitCount` round-trip on open. A hover- or
  selection-triggered count is the natural follow-up.

## Notes

- Implementation: `h3-kit/selection/SelectionBuilder.tsx` (tabs, `onQuickApply`,
  `namedCurrentSel`), `h3-kit/MolSelList/MolSelList.tsx` (`handleQuickApply`,
  `molCurrentSel`, `isOpen` guard), `h3-kit/MolSelList/SelMenus.tsx` (reused as
  the tab panels — previously dead code from ADR-0021's Library tab),
  `h3-kit/MolSelList/CountTag.tsx`, `h3-kit/form/SegmentField.tsx` (`compact`),
  `styles/_selection-builder.css`, `styles/_mol-sel-list.css`,
  `styles/_form-kit.css`, `styles/_variables.css`.
- `selectionGrammar.ts` keeps the `named` / `history` keywords (Term-tab
  sources) and only reorders `KEYWORDS`; `selBuilderReducer.ts` is unchanged.
- Degrade detection: `__test__/SelectionBuilder.test.tsx` (tab rendering,
  quick-apply vs `onApply`, Term/Mod ops, Enter-applies-only-when-empty,
  keyword order), `__test__/MolSelList.test.tsx` (single commit with the new
  value + popover close, `currentSel` under Selected),
  `__test__/CountTag.test.tsx` (abbreviation thresholds),
  `__test__/PaintSelCell.test.tsx` (blur/close commit contract, via the Term
  tab).
- UXP reference: `uxp_gui/cuemol2/base/content/widgets/molsellist.js` (the
  one-click dropdown this restores).
- Supersedes ADR-0021's tab layout (Builder / Library / History) and its
  "Named / History as keywords only" decision; the rest of ADR-0021 (grammar
  derivation, one-way builder->text emit, value autocomplete) still stands.
