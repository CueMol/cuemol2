# ADR-0018: MolStruct panel — lazy load, multi-select, deferred virtualization

- Status: accepted (tree perf deferred — see Consequences)
- Date: 2026-05-24
- Mapping rows: [`panel.molstruct`](../mapping/panels.md#panelmolstruct)

## Context

UXP `panel.molstruct` (`uxp_gui/cuemol2/base/content/molstruct-panel.{xul,js}`)
is the side panel that lets the user browse a molecule's
**chain → residue → atom** hierarchy and apply selection / Center / Zoom
to the active mol view. Three constraints shaped the tritium port:

1. **Atom counts**: a moderate protein has thousands of atoms per chain,
   so eager-loading the full tree on mol switch is prohibitive.
2. **Topology vs. selection events**: the worker fires SEM_OBJECT events
   on every `mol.sel = ...` / `createRenderer('*selection')` / property
   change, not just on genuine topology changes — naively invalidating
   the lazy cache on every event collapses the user's expansion state.
3. **No Blueprint virtualized tree**: `@blueprintjs/core` `Tree` is
   non-virtualized and its child rendering goes through `Collapse`, which
   has a JS state machine (`enter` → `entering` → `entered`) that
   inserts a perceptible frame stagger even when CSS transitions are
   disabled. This is independent of node count — observed at ~40 residues.

## Decision

**Worker side** — three new service files mirror the UXP API surface:
- `getMolStructure.service.ts` — `listMols`, `getMolChains`,
  `getMolResidues`, `getMolAtoms`. Each parses one JSON-returning C++
  method (`mol.getChainsJSON()`, `chain.getResidsJSON()`,
  `residue.getAtomsJSON()`) and is safe against missing / non-MolCoord
  wrappers via duck-typing on `getChainsJSON`. **`ResidIndex` stays a
  string** (`"10"`, `"10A"`) end-to-end so insertion codes round-trip.
- `applyMolSelString.service.ts` — `applyMolSelString` (Select button),
  `centerMolSelection`, `zoomMolSelection`. Each composes the selection
  via `makeSel` + assigns `mol.sel` + auto-creates the `*selection`
  renderer, all wrapped in a single undo txn. Center reads
  `mol.getCenterPos(true)` and pushes to `view.setViewCenter`; Zoom
  duck-types `mol.fitView(view, true)` so subclasses without it fail
  soft. Both verify `view.getScene().uid === args.sceneId` (cross-scene
  guard).

**Renderer side**:
- `useMolStructure.ts` hook owns the molecule selector state, fetches
  mols + chains, and exposes `loadResidues(chain)` / `loadAtoms(chain,
  residueIndex)` that return cached Promises. Inflight requests are
  deduped by key.
- Two refresh paths coexist:
  - `refetch()` — explicit/external; clears the lazy cache.
  - **`softRefetch()`** — wired to the SEM_OBJECT listener; re-fetches
    mols + chains but **keeps the lazy cache**. This is the fix for
    the "expanded subtrees blank to Loading... on every Select / Zoom"
    bug, since SEM_OBJECT fires on selection assignment too.
- `MolStructPane.tsx` carries a **self-heal effect** that scans
  `expandedIds` and calls `loadResidues` / `loadAtoms` for any expanded
  node whose cache went missing. With inflight dedup this is safe to
  run every render and covers (a) mol-switch race and (b) any future
  cache invalidation without forcing the user to collapse+reexpand.

**Selection string composition** — `selStrFromTree.ts` is a pure
renderer-side builder that mirrors UXP `panel.makeSelstrByTreeSel`:
- chain row → `c;'A'`
- residue row → `'A'.10.*`
- contiguous residues within one chain → `'A'.10:15.*` (merged using
  the chain's residue-order map so insertion codes work positionally)
- atom row → `aid 123`
- chain-row selection subsumes its descendant residues / atoms

**Toolbar**: Select / Center / Zoom wired; **Properties is a disabled
stub** because UXP's `onBtnPropCmd` is itself empty.

**Multi-select** (Finder / VS Code parity):
- plain click → replace selection with this id, set anchor
- Cmd/Ctrl+click → toggle this id in the set, set anchor
- Shift+click → select inclusive range between anchor and this id, in
  visible-row order, replace
- Shift+Cmd/Ctrl+click → union that range with the existing selection

The visible-row list is recomputed each render from `chains` +
`expandedIds` + lazy caches — placeholder rows ("Loading...",
"(no atoms)") are excluded. ScenePane (ADR-0007) still has the
single-line "toggle only" multi-select; once the ScenePane port
revisits range select, the same anchor + visible-row pattern can be
shared.

## Consequences

**Positive**
- Mol switch is O(chains) instead of O(atoms).
- The Select / Zoom / Center round-trip no longer blanks the user's
  expansion state.
- Insertion-code residues round-trip cleanly through the wire format.
- The self-heal effect makes the cache invalidation policy a
  performance hint rather than a correctness requirement, so a future
  topology-event filter can be added without changing the panel.

**Negative / deferred**
- **Tree expansion stagger** (known issue). Even with all CSS
  transitions / animations disabled on `.mol-tree`, Blueprint's
  `Collapse`-backed child rendering reveals nodes across multiple
  frames on the *first* expand: roughly "one node, brief pause, then
  the rest". Subsequent open/close on the same subtree is instant
  (browser metric cache + Collapse already mounted). Reproduces at
  ~40 residues, so the cause is the JS state machine, not node count.
  Fix requires replacing Blueprint `Tree` with a virtualized
  alternative (e.g. `react-arborist`) or rolling a custom flat-list
  renderer. Deferred to a follow-up — the candidate libs are listed
  in the mapping row Notes.
- The SEM_OBJECT listener intentionally does not detect the
  `topologyChanged` method specifically (UXP's filter category). If a
  real topology change lands (e.g. `mol.applyTopology()` from a
  script), expanded residue / atom data may be stale until the user
  collapses + re-expands or switches mol. Acceptable for now; a
  method-name filter is the planned follow-up.
- Properties button is a placeholder until a generic property dialog
  for mol objects is wired (covered separately by ADR-0015).

## Notes

- Implementation:
  - `tritium/react-gui/src/renderer/worker/server/services/getMolStructure.service.ts`
  - `tritium/react-gui/src/renderer/worker/server/services/applyMolSelString.service.ts`
  - `tritium/react-gui/src/renderer/hooks/useMolStructure.ts`
  - `tritium/react-gui/src/renderer/components/panes/MolStructPane.tsx`
  - `tritium/react-gui/src/renderer/components/panes/molStruct/selStrFromTree.ts`
  - CSS (`tritium/react-gui/src/renderer/styles/_side-panel.css`): `.mol-tree`
    block disables `bp5-collapse` transitions and caret animation.
- UXP parity:
  - `uxp_gui/cuemol2/base/content/molstruct-panel.js` — `panel.makeSelstrByTreeSel`,
    `onBtnSelCmd(nMode)`, `setupTreeData`, `_attachScene` listener.
- C++ JSON shapes (source of truth):
  - `src/modules/molstr/MolChain.cpp` `MolChain::getResidsJSON()` →
    `[{ name, single, sel, index }]` (`index` is a `ResidIndex::toString()` string)
  - `src/modules/molstr/MolResidue.cpp` `MolResidue::getAtomsJSON()` →
    `[{ name, id, elem }]`
- Tree-perf follow-up candidates (in order of preference):
  - `react-arborist` (~30K dl/wk, react-window-backed, multi-select +
    keyboard nav out of the box) — primary recommendation
  - `rc-tree` (~250K dl/wk, AntD-derived, mature)
  - custom flat-list renderer (~150 LoC, no new deps)
- Related ADRs: [ADR-0007](ADR-0007-scene-tree-multi-select.md)
  (Cmd/Ctrl+click multi-select pattern reused), [ADR-0015](ADR-0015-generic-property-inspector.md)
  (eventual Properties target).
