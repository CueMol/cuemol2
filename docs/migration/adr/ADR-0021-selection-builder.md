# ADR-0021: Selection Builder popover for MolSelList

- Status: accepted (RendererOptionsPane only; PaintSelCell / SelectionPane deferred)
- Date: 2026-05-29
- Mapping rows: [`widget.molsellist`](../mapping/custom_widgets.md#widgetmolsellist)

## Context

CueMol's selection syntax is powerful but opaque to newcomers: property
specifiers (`chain A`, `resi 1:10`, `resn ALA`, `name CA`, `elem C`), boolean
operators (`and` / `or` / `not`), and named macros (`protein`, `water`, ...).
The original design doc `docs/plans/IMPLEMENT_SelectionBuilder.md` proposed a
guided popover query builder, but it was written against a hypothetical
`SelectionPane` / `SelectionBuilder.tsx` structure and used an incorrect,
dot-separated grammar (`chain.A`, `resname.ALA`, `aname.CA`, `water = resname.HOH or resname.WAT`).

The real reusable selection editor is `widgets/MolSelList/MolSelList.tsx`,
consumed by `PaintSelCell`, `RendererOptionsPane`, and (indirectly, via shared
history) `SelectionPane`. The grammar had to be re-derived from the source of
truth before any UI could emit valid expressions.

## Decision

Add `widgets/MolSelList/SelectionBuilder.tsx`: a Blueprint `Popover` opened
from a chevron button, gated behind a new opt-in `enableBuilder` prop (default
false). When enabled it **replaces** MolSelList's OS-native `HTMLSelect` picker
(they are mutually exclusive in the `ControlGroup`); when disabled the picker is
unchanged. It is a one-way composer (builder -> text, never reverse-parsing)
with three tabs: Builder (guided term composer), Library (the picker's former
content -- Preset current/all/none, built-in Macros, Scene and Global named
defs), and History. MolSelList maps the
builder's `onEmit(next, mode)` onto its existing controlled
`onSelectedSelChange`: insert appends ` and `, replacing an empty/`*` base
outright. Keyword value
autocomplete is resolved asynchronously from the active molecule via
`useSelectionValues.ts` (built on the existing `getMolChains` /
`getMolResidues` / `getMolAtoms` worker services, lazy + cached, with a sampled
atom walk); when no molecule data is available it degrades to a free-text field
backed by a native `<datalist>`.

The emitted grammar was verified against `src/modules/molstr/parser_sel.yxx` /
`scanner_sel.lxx`, the tritium generator `molStruct/selStrFromTree.ts`, and the
macro definitions in `data/default_style.xml`. Fragments are `keyword value`
(space-separated, chain values single-quoted); macros are emitted by name and
resolved by the C++ compiler.

## Consequences

- Novices get a guided path; power users keep direct text editing. Text remains
  the single source of truth, so hand-edits never break.
- v1 enables the builder only in `RendererOptionsPane`. It is intentionally NOT
  enabled in `PaintSelCell`: a Popover renders in a portal outside the cell, so
  opening it or clicking its items registers as a focus-out and would
  prematurely fire PaintSelCell's blur-commit. Enabling it there would require
  portal-aware blur handling and is deferred. PaintSelCell therefore keeps the
  native picker (the two are mutually exclusive per `enableBuilder`).
- The popover content has a fixed `min-height` and the term list scrolls, so
  switching Builder / Library / History tabs does not resize the popover and
  trigger a Popper reposition (the tabs otherwise have very different heights).
- `SelectionPane` (its own `TextArea`, not MolSelList) does not get the builder
  in v1; surfacing it there would mean duplicating the composer.
- The Macros tab shows real built-in definitions copied statically from
  `data/default_style.xml`; these can drift if the built-in defs change (noted
  in code).
- `@blueprintjs/select` is not installed; value autocomplete uses a native
  `<datalist>` rather than `Suggest`, avoiding a new dependency.

## Notes

- Implementation: `widgets/MolSelList/SelectionBuilder.tsx`,
  `useSelectionValues.ts`, `MolSelList.tsx` (`enableBuilder`, `handleEmit`),
  `styles/_selection-builder.css`.
- Grammar facts (verified): keywords `chain` / `resi`|`resid` / `resn` /
  `name` / `elem` / `aid`; operators `and`|`&`, `or`|`|`, `not`|`!`, parens;
  macros from `data/default_style.xml` (`water = rprop type=water`,
  `hydrogen = elem H`, etc.).
- Degrade-detection: `react-gui/.../__test__/SelectionBuilder.test.tsx`,
  additions to `MolSelList.test.tsx` / `PaintSelCell.test.tsx`, and C++
  `src/tests/modules/molstr/test_selcommand.cpp` (SelectionBuilder
  emitted-syntax guards pin `chain 'A'` / `elem C` / `not (resn HOH)` /
  `chain 'A' and not (resn HOH)` against the real compiler).
- Future work: portal-aware blur to enable the builder in PaintSelCell;
  surfacing in SelectionPane; advanced operators (`around` / `byres` / ...).
