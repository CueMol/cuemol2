# ADR-0038: APBS electrostatic-potential tool — modal + inline progress, Settings-owned exe paths

- Status: accepted (host E2E verified 2026-08-21)
- Date: 2026-07-12
- Mapping rows: [`dialog.tool.apbs-calcpot`](../mapping/tool_dlgs.md#dialogtoolapbs-calcpot)

## Context

UXP `tools/apbs-calcpot.{xul,js}` computes an electrostatic-potential map by
shelling out to two external executables — `pdb2pqr` (charge/radii assignment)
and `apbs` (Poisson-Boltzmann solver) — then loads the resulting OpenDX `.dx`
into the scene as an `ElePotMap` object (later consumed by the already-migrated
elepot surface coloring). The UXP dialog is a **non-closing Start/Stop** window:
it drives a `pqr -> apbs` state machine on a 100 ms JS timer, keeps the two exe
paths as editable in-dialog fields (persisted to prefs), and logs process
output to the main log window.

Three UXP shapes do not map cleanly onto tritium and needed decisions: the
non-closing start/stop UX, where the external-binary paths live, and how the
external-process pipeline is driven from the worker.

## Decision

**UX — modal with inline progress.** Ported as a standard modal built on the
shared `DialogShell` frame, with a `footerActions` override providing
**Start / Stop / Close** (Start toggles to Stop while running; Close is disabled
while running). Progress shows inline (`ProgressBar` + a `.h3-dialog-hint`
status line) and the modal auto-closes on completion. No new dialog-specific CSS
was added — the frame, spacing tokens and error line stay shared (a small
backward-compatible `footerActions` prop was added to `DialogShell`).

**Exe paths — Settings-owned, not in-dialog, with a bundled default.** The
`apbs` / `pdb2pqr` paths (and the default force field) are machine-level install
config, identical in kind to the POV-Ray / blendpng render binaries. They live
in the SettingsPane under **Tools > APBS / PDB2PQR**, persisted to electron-store
via the shared `UI_SAVE` / `UI_LOAD` channels through a new `ApbsConfigContext`
(mirroring `RenderConfigContext`). Path resolution is a three-level fallback:
persisted setting -> Main-resolved default (`APP_PATH` `defaultApbsBinaries` from
`getApbsBinaries()`: the bundled `bundle_apps/apbs` tree in a packaged build,
staged by PR #430 / `collect-cuemol2-runtime.sh`, or the `BUNDLE_APPS` env var in
a dev run) -> compiled-in empty default. So a release build auto-defaults to the
bundled apbs/pdb2pqr without any user configuration. The dialog reads the config
via `useApbsConfig` and **gates Start** with an inline warning + Settings pointer
only when a required path is still unset (internal method needs only `apbs`).
This diverges from UXP's in-dialog path fields in favor of the tritium
single-source-of-truth idiom, while preserving UXP's bundled-default behavior.

**Pipeline — worker service driving ProcessManager.** A new
`calcApbsPot.service.ts` (`calcApbsStart` / `calcApbsCancel` /
`proposeElepotName`) exports the molecule to a temp PDB (pdb2pqr) or PQR
(internal `PQRFileWriter`), computes the mg-auto grid from the bounding box,
writes `apbs.in`, and runs the processes through the C++ `ProcessManager`,
polling on a `setInterval` and pushing `apbs-progress` updates. The `.dx` is
loaded via `StreamManager.createHandler('apbs', 0)` (`OpenDXPotReader` ->
`ElePotMap`) with a default `*unitcell` renderer inside one "Open APBS pot file"
undo txn. Reached from Tools > APBS elepot calculation (`menu:apbs`, re-routed
from the `unimplemented` stub to `CmdId.UiCalcApbsPotDialog`).

## Consequences

- **Positive.** Reuses the entire existing external-process pattern
  (`renderJob.service.ts`), the create-object tool-dialog pattern
  (`MakeMolSurfDialog`), and the binary-path Settings pattern
  (`RenderConfigContext` + `settingsConfig` `kind:'path'`). No bespoke CSS; the
  dialog is visually consistent with every other h3-kit dialog. Both UXP charge
  methods (pdb2pqr + internal) are preserved.
- **Negative / divergence.** Paths moved out of the dialog. In a packaged build
  (or a dev run with `BUNDLE_APPS` set) they auto-default to the bundled
  binaries, so Start is enabled out of the box; the Settings gate only trips when
  the bundle is absent (e.g. a dev run without `BUNDLE_APPS`), where the user
  must set the paths once. UXP layout parity is intentionally not preserved for
  the path fields.
- **Queue-pump constraint.** Inside the worker the `ProcessManager` idle-task
  loop does not run, so its queue only advances when `queueTask` is called. APBS
  is therefore NOT chained on pdb2pqr via the `waitfor` dependency (as UXP did);
  the poll loop detects pdb2pqr completion and then explicitly queues APBS —
  a two-phase shape identical to render's render->finalize phasing.
- **Known limitation.** Full end-to-end verification requires the `apbs` /
  `pdb2pqr` binaries. A packaged build ships them under `bundle_apps/apbs`
  (PR #430); a dev run needs `task download_extpkgs` + `BUNDLE_APPS`. Without
  them, only the "Executable not found" fast-fail path and the internal-PQR
  export step are exercisable. Ion concentration and pH are not exposed (UXP did
  not expose them either).

## Notes

- Service: `tritium/react-gui/src/renderer/worker/server/services/calcApbsPot.service.ts`
  (grid derivation `computeGrid`, `apbs.in` builder `buildApbsIn`, poll
  `pollJob`, load `loadPotFile`). Types + push channel:
  `worker/shared/apbsTypes.ts` (`APBS_PROGRESS_CHANNEL`). ServiceMap rows in
  `worker/shared/WorkerCalls.ts`.
- Progress push: `worker/client/WorkerTransport.ts` (`apbs-progress` branch +
  `subscribeApbsProgress`), forwarded by `AsyncCueMol.ts`; renderer-side driver
  `hooks/useCalcApbsJob.ts` (mirrors `useRenderJob`).
- Dialog: `components/dialogs/CalcApbsPotDialog.tsx` (+ `...Provider.tsx`,
  `contexts/DialogContext.tsx`). Command: `commands/ids.ts`
  (`UiCalcApbsPotDialog`), `commands/CommandMap.ts`, `commands/useToolCommands.ts`;
  menu re-route in `shared/menuActionMap.ts` (`IPC.MENU_APBS`).
- Settings: `contexts/ApbsConfigContext.tsx` (3-level fallback),
  `components/panes/settings/settingsConfig.ts` (`APBS_SETTING_KEYS`, Tools
  category), `components/panes/SettingsPane.tsx`, `shared/ipcTypes.ts`
  (`UiState.apbsExe` / `pdb2pqrExe` / `pdb2pqrFF`, `AppPathInfo.defaultApbsBinaries`).
- Bundled-default resolver: `main/ipcHandlers.ts` `getApbsBinaries()` (packaged:
  `resourcesPath/bundle_apps/apbs/{apbs,pdb2pqr}`; dev: `BUNDLE_APPS/apbs/...`),
  returned via `IPC.APP_PATH`. Bundle staging: PR #430 (`3a3e49f4`) --
  `tritium/packaging/collect-cuemol2-runtime.sh` + `electron-builder.yml`.
- UXP parity: `uxp_gui/cuemol2/base/content/tools/apbs-calcpot.js`
  (`calcGridDim`, `makeAPBSIn`, `submitPdb2Pqr`, `loadPotDxFile`).
- C++ handlers: `PQRFileWriter` (nickname `"pqr"`), `OpenDXPotReader`
  (nickname `"apbs"` -> `ElePotMap`), `ProcessManager` (`src/qlib/LProcMgr`).
- Tests: `__test__/calcApbsPotService.test.ts` (pipeline + undo txn),
  `__test__/calcApbsPotDialog.test.tsx` (gate / start payload / complete /
  cancel).
- Related: [ADR-0017](ADR-0017-povray-rendering-ui.md) /
  [ADR-0035](ADR-0035-render-window.md) (external-process render pipeline),
  [ADR-0036](ADR-0036-settings-panel-wiring.md) (Settings wiring).
