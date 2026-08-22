# ADR-0051: SelectionPane redesign — live mol.sel editing hosting the shared builder

- Status: accepted (host E2E verified; recorded retroactively on 2026-08-22)
- Date: 2026-08-07
- Mapping rows: [`panel.selection`](../mapping/panels.md#panelselection)

## Context

UXP `panel.selection` (`uxp_gui/cuemol2/base/content/selection-panel.{xul,js}`)
has two tabs: Command (free-text expression) and Editor (Hierarchical /
Terminal / Around-Expand richlistboxes). The first tritium port (2026-05-24)
covered the Command tab only -- molecule selector, multi-line TextArea, and a
Select / Clear / History toolbar -- and deferred the Editor tab indefinitely on
the grounds that free text covered the dominant use case.

Meanwhile the shared SelectionBuilder grew from the MolSelList popover
([ADR-0021](ADR-0021-selection-builder.md)) into the tabbed Named / History /
Term / Mod widget ([ADR-0044](ADR-0044-selection-quick-pick.md)). That widget
already provides what the UXP Editor tab offered: hierarchical picking (the
`hier` keyword composes `chain.resid.aname` from three fields), terminal
property keywords (`chain` / `resid` / `resn` / `name` / `elem` / `alt` /
`bfac` / `rprop`, with molecule-derived value candidates), and the Around /
Expand family (Mod transforms). Keeping a TextArea-only pane beside it left
the dedicated selection panel the weakest selection surface in the app.

## Decision

Rebuild the pane around live `mol.sel` editing with the embedded shared
builder (commit `3790dc5d`, refined by `edbd0313` / `73bca235` / `f6573640`):

- `mol.sel` is the single source of truth. The Selection field mirrors
  `mol.sel.toString()` via the CueMol event manager (so scene undo/redo is
  reflected automatically) and stays editable for micro-corrections; the
  Select (arrow) button applies a hand-typed edit and is enabled only while
  the field diverges from `mol.sel`.
- The embedded `SelectionBuilder` (full variant, the same component as the
  MolSelList popover) is the primary grammar-free path. Every op --
  Replace / Add / Subtract / Intersect on a composed term, and the unary Mod
  transforms (Invert / Byres / Sidechain / Mainchain / Around / Expand) --
  writes `mol.sel` immediately. There is no separate commit step and no
  builder-local undo; stepping back is scene undo (Cmd+Z). Hit-count badges
  preview every op's result before it is applied.
- Actions are consolidated into one icon row: Select / Center
  (`centerMolSelection`) / Clear / Define (popover -> `saveSelDef`). History
  (`h3-kit/MolSelList/selHistory`, the localStorage MRU shared with
  MolSelList hosts) records explicit hand-typed applies only -- builder ops
  fire too often to be useful history entries.
- Pane UI state (target molecule, operand draft, pending text) persists
  across activity-group switches via `selectionPaneStore`; it resets on a
  scene or target-molecule change.

## Consequences

- The UXP Editor tab's roles are covered by the builder, closing the
  "deferred indefinitely" gap without porting the richlistbox UI.
- One builder implementation serves every MolSelList host and the pane;
  grammar extensions and fixes land everywhere at once.
- Live apply makes every builder op one undo step -- scene undo history
  grows faster than UXP's commit-based Editor tab.
- The 500 ms `validateSelection` debounce (DANGER intent on the field)
  applies to hand-typed edits only; builder-generated expressions are
  correct by construction.

## Notes

- Implementation: `components/panes/SelectionPane.tsx`, `h3-kit/selection/`
  (`SelectionBuilder.tsx`, `selBuilderReducer.ts`, `selectionGrammar.ts`,
  `selectionExpr.ts`, `useSelectionValues.ts`),
  `components/panes/selection/selectionPaneStore.ts`. Worker services:
  `applyMolSelString`, `validateSelection`, `getSelDefs`, `saveSelDef`,
  `centerMolSelection`.
- UXP parity reference: `uxp_gui/cuemol2/base/content/selection-panel.{xul,js}`.
- Related: [ADR-0021](ADR-0021-selection-builder.md) (builder origin; its
  "SelectionPane keeps its own TextArea" scoping is superseded by this ADR),
  [ADR-0044](ADR-0044-selection-quick-pick.md) (the Named / History / Term /
  Mod tab layout and one-click apply the pane inherits).
- This ADR was recorded on 2026-08-22, after the implementation had shipped:
  the mapping row still described the 2026-05-24 Command-tab-only port while
  the 2026-08-07 redesign was already merged (docs drift, not a new
  decision).
