# ADR-0011: New Tab — OffscreenCanvas one-shot bind, addView() for new views

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`menu.cuemol2`](../mapping/menus.md#menucuemol2) — File > New Tab,
  [`other.cuemol2`](../mapping/other.md#othercuemol2)

## Context

UXP's "New Tab" dialog offers two paths:

- **New Scene** — create a fresh scene with a fresh view in a new tab.
- **New View** — create another view of an *existing* scene in a new
  tab (camera optionally inherited from the source view).

Tritium uses an `OffscreenCanvas` to hand the WebGL surface to the Web
Worker for rendering. This API has hard constraints documented in
`tritium/CLAUDE.md`:

- `canvas.transferControlToOffscreen()` is **one-shot per canvas
  element** — calling it twice throws `InvalidStateError`.
- After transfer, the renderer thread cannot read canvas pixels — the
  Worker owns the GL context.
- `GfxManager._canvas` has no unbind path; once `bindCanvas()` is
  called, the OffscreenCanvas is held for the Worker's lifetime.

This means: the canvas is bound *once* at app start, and every
subsequent view (whether for a new scene or a new view of an existing
scene) must attach to that already-bound canvas. We cannot create a new
OffscreenCanvas per tab.

## Decision

**Bind once, use `addView()` thereafter.**

- The first scene/view at app start runs `bindCanvas()` (one-shot
  WebGL init + OffscreenCanvas transfer).
- The New Scene path uses `createNewSceneAndView` worker service. The
  view it creates attaches to the already-bound canvas via
  `addView()` internally.
- The New View path uses `createViewInScene` worker service: adds a
  view to an existing scene; camera inherit goes through
  `saveViewToCam('__current')` on the source view + `loadViewFromCam`
  on the new view.

**MolViewPane stays mounted from first render to app exit.**
`ContentPane.tsx` uses an `everHadMolViewRef` flag so the component
is never unmounted even when all molview tabs are closed. Unmounting
would destroy the canvas DOM element and make re-binding impossible.

**Closing a tab** must call both `removeMolTab(viewId)` and
`cm.removeView(viewId)`. Skipping either leaks state (`MolTabState`
entry, Worker `bound_views`, view loop). Wired in `App.tsx` via
`useTabManager({ onMolViewClose })`.

## Consequences

- **Canvas binding is invisible to the user** — they just open tabs.
  All the OffscreenCanvas ceremony happens behind `bindCanvas` /
  `addView` boundary.
- **MolViewPane "always mounted" is non-obvious** — without this
  document, a future cleanup pass might try to unmount it when no
  tabs are open. Don't.
- **C++ View / Scene objects are not destroyed by `removeView`** —
  that's a separate future concern (Scene lifecycle ADR if it
  becomes necessary).
- **A second `transferControlToOffscreen()` would throw.** If we
  ever need to support multiple canvases (e.g. a detached secondary
  window), each must own its own canvas + bindCanvas pair from the
  first paint of that window.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/components/panes/MolViewPane.tsx` —
  the canvas element + `transferControlToOffscreen`
- `tritium/react-gui/src/renderer/components/ContentPane.tsx` —
  `everHadMolViewRef` keep-mounted flag
- `tritium/react-gui/src/renderer/worker/server/services/createNewSceneAndView.service.ts`
  — New Scene path
- `tritium/react-gui/src/renderer/worker/server/services/createViewInScene.service.ts`
  — New View path (camera inherit via `saveViewToCam` /
  `loadViewFromCam`)
- `tritium/react-gui/src/renderer/hooks/useTabManager.ts` —
  `onMolViewClose` cleanup wiring
- `tritium/react-gui/src/renderer/hooks/useMolTab.tsx` —
  `MolTabState`

### Constraints reference

- `tritium/CLAUDE.md` — "OffscreenCanvas / WebGL lifecycle constraints"
  section

### UXP parity

- `uxp_gui/cuemol2/base/content/cuemol2_main.js` — `onNewTab` (UXP
  separates Scene and View paths the same way)

### Pending

- `MolTabEntry.bound` (`useMolTab.tsx`) is defined but never read —
  dead code or future reserved; clarify intent.
