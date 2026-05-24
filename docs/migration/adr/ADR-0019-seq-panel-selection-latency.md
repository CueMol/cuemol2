# ADR-0019: Sequence panel — residual selection-commit latency

- Status: proposed (future work)
- Date: 2026-05-24
- Mapping rows: [`panel.btmpanel-holder.seq`](../mapping/panels.md#panelbtmpanel-holderseq)

## Context

The Phase 1 SequencePanel implementation is functionally complete and
its render path has been optimised twice:

1. The per-click IPC fan-out was collapsed to a single `getSeqPanelData`
   bulk call; SEM_PROPCHG `sel` events surgical-refetch only the
   affected mol via the same service's `molIds` filter.
2. The red click marker was moved out of the seq canvas onto a DOM
   overlay so click -> marker is a React reconciliation, not a full
   canvas re-blit; `setupHiDpiCanvas` was guarded so the canvas
   backing bitmap is only reallocated when its size actually changes.

After these passes, click -> red marker latency is imperceptible.
However, the **commit -> blue selection highlight** step still feels
laggy (roughly half a second on typical scenes) even though the
remaining per-event cost is bounded by:

- 1 IPC round trip for `toggleResidueSelection` (mol.sel = ...) wrapped
  in `withUndoTxn`, fires SEM_PROPCHG sel on commit
- the SEM_PROPCHG sel handler dispatches a single
  `getSeqPanelData({ sceneId, molIds: [target_uid] })` IPC
- `setRows` triggers a React re-render and `drawSeq` redraws the seq
  canvas (no bitmap reallocation thanks to the size guard, but every
  residue cell is repainted)

Hypotheses (not yet measured) for where the residual latency comes from:

- The CueMol event manager dispatch back from the worker to the
  renderer (postMessage queue, addEventListener callback marshalling)
  may itself take O(100 ms) under contention with the active render
  loop in `MolViewPane`.
- For mols with thousands of residues across many chains, `drawSeq`
  loops `fillText` for every visible residue on each refresh -- even
  without a bitmap reallocation, this can run into the tens of ms
  range and stacks with React commit phase work.
- The `withUndoTxn` commit path on the worker side may serialise
  behind other queued worker tasks.

## Decision

Defer the optimisation. Phase 1 is shippable and the latency is not a
blocker for the feature being usable. Document the candidate next
steps so the work is recoverable when we choose to pick it up.

Candidate next steps, roughly in order of expected payoff:

1. **Profile first.** Add a one-shot perf measurement inside
   `useMolSequenceData.handleObjectEvent` and
   `SequencePanel`'s `drawSeq` effect to attribute the half-second
   between IPC arrival and pixels-on-screen. Until we have numbers the
   rest of this list is guesswork.
2. **Diff-only redraw.** When `setRows` produces an update where only
   the `sel` flag of N cells changed, repaint just those cells (clear
   each cell rect, redraw background + glyph) instead of clearing and
   re-looping the entire grid. The hook already replaces per-mol rows
   in place; a `prevRowsRef` comparison can identify the changed cell
   set cheaply.
3. **Two-canvas separation for selection.** Mirror the marker overlay
   pattern: bottom canvas holds the static letters + alternating row
   backgrounds (invalidated only on `rows` shape change), top canvas
   holds just the cyan fills (invalidated on every `sel` change). This
   removes the residue-glyph repaint from the hot path entirely.
4. **Coalesce SEM_PROPCHG sel bursts.** A range-select drag can fire
   dozens of sel events; a tiny (16 ms) leading-edge debounce on the
   sel handler would coalesce them without harming single-click feel.
5. **Investigate worker-side event dispatch.** If profiling shows the
   delay is between `mol.sel = ...` (worker side) and the event
   callback firing in the renderer, the fix has to live in the
   `cm.addEventListener` plumbing, not in SequencePanel.

## Consequences

- Phase 1 ships with a known visual lag on selection commit. Users
  will see the red marker immediately but wait ~0.5 s for the cyan
  background to follow.
- Phase 2 and Phase 3 (drag/shift range select, around / invert /
  clear / copy ctxmenu items) can proceed without first solving this
  -- they share the same hot path, so the eventual fix benefits all
  three phases.
- The Phase 2 drag-select case is the worst affected because it
  produces a sustained stream of sel events; if the latency reads as
  cumulative there during testing, it should jump to the top of the
  follow-up queue.

## Notes

- Implementation pointers:
  - `tritium/react-gui/src/renderer/hooks/useMolSequenceData.ts`
    (`handleObjectEvent` / `refetchMolRows`)
  - `tritium/react-gui/src/renderer/components/panels/SequencePanel.tsx`
    (`drawSeq`, `setupHiDpiCanvas`)
  - `tritium/react-gui/src/renderer/worker/server/services/getSeqPanelData.service.ts`
  - `tritium/react-gui/src/renderer/worker/server/services/seqPanelOps.service.ts`
- UXP parity reference:
  `uxp_gui/cuemol2/base/content/bottom-panels/seqpanel.js`
  `panel.toggleResidSel` -> `cuemolui.chgMolSelObj` -> SEM_PROPCHG sel
  -> `ob_handler` -> `addMolIDData(target_uid)` + `renderSeq()`.
  In UXP the entire chain is synchronous C++ calls inside one process,
  so the round-trip cost is essentially zero.
