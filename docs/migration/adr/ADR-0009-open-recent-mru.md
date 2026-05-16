# ADR-0009: File > Open Recent — electron-store MRU + OS dock integration

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`menu.cuemol2`](../mapping/menus.md#menucuemol2) — File > Open Recent

## Context

UXP keeps a "recently opened files" list inside its profile and shows it
under File > Open Recent. The list is updated when the user opens or
saves a file, and cleared via a "Clear Menu" item.

In Tritium we have two surfaces that need to show the MRU:

- The Electron native menu (always on macOS, optionally on
  Win/Linux when `MenuBar` is shown).
- The React `MenuBar` (Win/Linux fallback when the native menu is
  hidden).

We also have an OS-level Recent Documents list (the macOS Dock /
Windows JumpList) which Electron exposes via `app.addRecentDocument`.
We want both to stay coherent: opening or saving a file should add it
to both Tritium's MRU and the OS list.

## Decision

**Storage: `electron-store`** in the main process. Cap at 10 entries
(UXP parity).

**Update points.** An entry is added on:

- successful `OpenObjByPath` (object file load)
- successful `OpenSceneByPath` (scene file load)
- successful `saveScene`

**Push to renderer.** Main pushes `IPC.RECENT_LOAD` (initial bulk send
on startup) and `IPC.RECENT_UPDATED` (incremental updates) over the
preload bridge. Both surfaces subscribe to `RECENT_UPDATED` so they
refresh together.

**Native menu dispatch.** Native menu items dispatch
`IPC.MENU_OPEN_RECENT` with the file path; the renderer side maps that
to the correct command (object vs scene) by extension.

**React MenuBar dispatch.** The React `MenuBar` does not go through
`MENU_OPEN_RECENT` — it dispatches `CmdId.OpenObjByPath` /
`OpenSceneByPath` directly via `useMenuDispatch.dispatchOpenRecent`,
because the React side already knows the command id and skips an
unnecessary IPC round-trip.

**Clear Menu.** `IPC.RECENT_CLEAR` → `clearRecents` (`main/recentFiles.ts`)
+ `app.clearRecentDocuments` + native menu rebuild.

**OS dock mirror.** Every add also calls `app.addRecentDocument(path)`
so the OS surface stays in sync.

## Consequences

- **Two surfaces, one source of truth** (electron-store) — both menus
  see the same list and update together.
- **Two dispatch paths** (native via `MENU_OPEN_RECENT`, React via
  direct `CmdId`) — slight asymmetry but each is the most efficient
  path for its surface. Documented here so future readers know the
  reason.
- **OS Dock / JumpList stays in sync** with no extra plumbing — the
  one extra `app.addRecentDocument` call per add is enough.
- **Cap at 10** matches UXP. Easy to bump if needed.

## Notes

### Implementation pointers

- `tritium/react-gui/src/main/recentFiles.ts` — electron-store
  wrapper, add / clear / read
- `tritium/react-gui/src/main/menu.ts` — native menu rebuild on
  `RECENT_UPDATED`
- `tritium/react-gui/src/renderer/hooks/useRecentFiles.ts` — renderer
  subscription
- `tritium/react-gui/src/renderer/hooks/useMenuDispatch.ts` —
  `dispatchOpenRecent`
- `tritium/react-gui/src/shared/ipcChannels.ts` — `RECENT_LOAD`,
  `RECENT_UPDATED`, `RECENT_CLEAR`, `MENU_OPEN_RECENT`

### UXP parity

- `uxp_gui/cuemol2/base/content/cuemol2_main.js` — `addRecentFile` /
  `loadRecent` / `clearRecentMenu`
