# ADR-0034: Render preview pane — docked split right of ContentArea, single latest result

- Status: accepted (host E2E pending)
- Date: 2026-07-04
- Mapping rows: [`dialog.tool.render-pov`](../mapping/tool_dlgs.md)
- Supersedes: the "ContentArea Render Result tab" part of
  [ADR-0017](ADR-0017-povray-rendering-ui.md) (Inspector settings and the
  BottomPanel Render tab are unchanged)

## Context

ADR-0017 displayed a completed POV-Ray render as its own ContentArea tab
(`renderResult` tab type) and activated it on completion. That makes the
result and the WebGL molview mutually exclusive: the iterate loop the
feature exists for (rotate view -> Start -> compare image against view ->
adjust -> Start again) required a tab switch on every cycle, and each
completion stole the active tab. The UXP `render-pov-dlg` was a modeless
window, so it never had this problem.

## Decision

Replace the Render Result tab with a **docked render preview pane** split
horizontally to the right of ContentArea, inside the center Allotment's top
cell (BottomPanel keeps its full-width vertical split below). Key points:

- **Single-slot retention**: `useRenderPreview` holds one
  `RenderResult | null` — the latest render, regardless of source scene.
  Rendering another scene overwrites it (Save exports first if needed).
- **Auto-open without activation**: on job completion `showResult` stores
  the result and opens the pane; it never touches the tab manager, so the
  molview tab stays active by construction.
- **Pane chrome**: `RenderPreviewPane` = header (title + close button,
  inspector-header pattern) + `RenderResultPane` body reused unchanged,
  keyed by `result.id` so a new result remounts `RenderImageViewer` and
  re-runs its one-shot fit.
- **Persistence**: new `LayoutState` keys `renderPreviewOpen` /
  `previewSplitSizes` (electron-store via the existing layout IPC),
  following the `inspectorOpen` precedent. The split-change handler skips
  persisting `[w, 0]` sizes reported while the pane is hidden.
- **Tab type removed**: `renderResult` is deleted from `TabType` /
  `TabData`; `useTabManager.addRenderResultTab` and the App-side
  render-result tab special cases (`handleRenderStart`, `canRender`,
  `renderSourceSceneId`) are gone — source resolution is molview-only.
- `RenderImageViewer` gains a one-shot ResizeObserver fallback fit for the
  case where it mounts while the Allotment pane is still zero-width.

Considered and rejected: per-scene retention (`Map<sceneId, RenderResult>`
preserving the old per-scene overwrite semantics). Data-URL images are
multi-MB so memory grows unboundedly across scenes, an eviction/clear path
and an empty-state UI would be needed, and the single-scene iterate loop
does not benefit. The pane component contract (`result: RenderResult`)
would not change, so this remains a possible follow-up inside the hook.

## Consequences

- The iterate loop works without tab switches: molview and result are
  visible side by side, and completion never steals focus.
- Result history is gone — one render at a time, no per-scene tabs
  accumulating. Memory for result images is bounded to one.
- The WebGL canvas resizes through the normal flex layout path
  (MolViewPane's own ResizeObserver -> `cm.resized()`); MolViewPane stays
  permanently mounted as before.
- Pop-out to a separate window (UXP modeless-dialog parity for
  multi-monitor use) is deferred; the pane is the Phase 1 surface it
  would build on.

## Notes

- Implementation pointers:
  - Hook: `hooks/useRenderPreview.ts`; wiring in `App.tsx`
    (`useRenderJob({ onComplete: showResult })`, `handlePreviewSplitChange`).
  - Pane: `components/panes/RenderPreviewPane.tsx`; CSS `.render-preview*`
    in `styles/_content-area.css`.
  - Persistence: `shared/ipcTypes.ts` (`LayoutState`),
    `hooks/useLayoutPersistence.ts` (`setPreviewSplitSizes`,
    `setRenderPreviewOpen`).
  - Tests: `__test__/useRenderPreview.test.ts`,
    `__test__/renderPreviewPane.test.tsx`.
- The pane's Allotment cell uses `visible={previewOpen && previewResult
  !== null} snap` — on restart the pane stays hidden (no result) even if
  `renderPreviewOpen` was persisted true; the first completed render
  reopens it at the persisted width.
- Related: [ADR-0017](ADR-0017-povray-rendering-ui.md) (pipeline, Inspector
  settings, BottomPanel Render tab — all still current).
