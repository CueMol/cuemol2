# ADR-0017: POV-Ray rendering UI — Inspector settings, BottomPanel tab, Render Result tab

- Status: accepted (single-frame). Animation rendering is no longer deferred -- it is
  implemented on this ADR's worker pipeline by [ADR-0040](ADR-0040-animation-rendering.md).
  UI surfaces superseded by [ADR-0035](ADR-0035-render-window.md) (modeless Rendering
  window, merged in PR #418)
- Date: 2026-05-18
- Mapping rows: [`dialog.tool.render-pov`](../mapping/tool_dlgs.md)

## Context

The UXP `render-pov-dlg` is a modeless dialog with a "Main options" /
"POV-Ray options" two-tab layout and ~38 controls: image size, projection,
stereo, quality, output, POV-Ray-specific lighting/radiosity, a Start/Stop
button, a progress bar, an inline result thumbnail, and Save/Copy buttons.
Execution (`uxp_gui/.../povrender.js`) drives the C++ `ProcessManager` /
`StreamManager`: the scene is exported to `.pov`/`.inc`, POV-Ray is spawned,
its stdout is polled for progress, and `blendpng` composites layers.

`docs/migration/option-ux-guidelines.md` routes a "one-shot rendering with
many options" away from a single giant modal toward panel/drawer surfaces.
Reproducing the modeless dialog verbatim would also fight tritium's docked
layout (Allotment panes) and its single-worker C++ bridge.

## Decision

Re-design the dialog across three existing surfaces ("case C"):

- **Inspector — `renderSettings` target.** A fifth `InspectorTarget` kind
  (`InspectorPanel` / `RenderSettingsEditor`) holds the editable settings
  (Image / Camera / Quality / Output / backend-specific groups). Non-persistent
  per the plan.
- **BottomPanel — "Render" tab.** `RenderPanel` owns the state-changing
  operations: Start/Stop, an image-size preset dropdown, progress bar, phase
  and render log.
- **ContentArea — "Render Result" tab.** `RenderResultPane` shows the finished
  image (zoom / fit / pan) with Save / Copy / Re-render / Show Source Scene
  actions. One result tab per source scene — re-rendering overwrites it.

The pipeline runs entirely in the Web Worker (`renderJob.service.ts`): the
C++ exporter writes `.pov`/`.inc`, `ProcessManager` spawns POV-Ray and
`blendpng`, a worker timer polls progress, and updates are pushed to the
renderer over a dedicated `render-progress` channel. A `RenderBackend`
interface (`PovrayBackend`) keeps the pipeline backend-agnostic for future
renderers. Binary paths are configured in the SettingsPane
(`RenderConfigContext`, persisted via electron-store).

## Consequences

- The render dialog no longer blocks; settings, execution and results each
  live on the surface that fits them, and result tabs accumulate as history.
- The `RenderBackend` abstraction means a second backend needs only a
  descriptor + a worker implementation, not UI rework.
- Worker file I/O uses Node `fs` directly (`nodeIntegrationInWorker: true`),
  so no Electron-main round-trips for temp files or the output image.
- Cost: render settings are not persisted (deliberate); the camera is
  captured at start via `Scene.saveViewToCam`, so a render reflects the
  view at Start time, not at completion.
- Animation / sequential rendering (UXP `anim-render-dlg`) is out of scope —
  it is a separate inventory entry and would extend the same pipeline.

## Notes

- Implementation pointers:
  - Inspector: `hooks/useInspectorState.ts` (`InspectorTarget` discriminated
    union), `components/inspector/RenderSettingsEditor.tsx`,
    `data/renderSettings.ts` / `data/renderBackends.ts`.
  - BottomPanel: `components/panels/RenderPanel.tsx`, `hooks/useRenderJob.ts`.
  - Result tab: `components/panes/RenderResultPane.tsx` /
    `RenderImageViewer.tsx`, `data/renderResult.ts`.
  - Worker: `worker/server/services/renderJob.service.ts`,
    `worker/server/services/renderBackends/{RenderBackend,PovrayBackend}.ts`,
    `render-progress` push channel in `WorkerTransport` / `AsyncCueMol`.
  - Config: `contexts/RenderConfigContext.tsx`, `DIALOG_PICK_PATH` IPC.
- ProcessManager gotcha: `LProcMgr` advances its queue only on `queueTask`
  (its `doIdleTask` pump is not driven inside the worker), and
  `getResultOutput` is what frees an ended task's slot. The service therefore
  runs in two phases — render tasks first, then the blendpng finalize task is
  queued once they finish, so that `queueTask` call starts it.
- `blendpng` runs even for single-layer renders (it stamps DPI and adjusts
  gamma); the pre-blendpng POV-Ray output is intentionally brighter and
  matches the UXP pre-blend output.
- UXP parity reference: `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/povrender.js`,
  `uxp_gui/cuemol2/base/content/tools/render-pov-dlg.{xul,js}`.
- Plan document: `docs/plans/raytrace-rendering-ui-plan.md` (phases 1–5).
- Deferred: animation/sequential rendering.
- App-bundle packaging of the POV-Ray / blendpng binaries: **done on macOS**
  (staged into the DMG under `Resources/bundle_apps/povray` + `Resources/cuemol2/bin/blendpng`
  by `collect-cuemol2-runtime.sh` + `electron-builder.yml` extraResources; see
  [tritium packaging renovation](../../architecture/tritium-packaging-renovation.md)).
  Paths are still user-overridable in Settings; Windows/Linux staging
  is a follow-up.
