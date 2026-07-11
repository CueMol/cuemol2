# ADR-0008: File > Get PDB — streaming download via StreamManager

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`menu.cuemol2.file`](../mapping/menus.md#menucuemol2file) — File > Get PDB

## Context

UXP's "Get PDB" downloads a coordinate file (RCSB CIF / RCSB PDB) or a
density map (RCSB cif.gz 2Fo-Fc/Fo-Fc, EBI MTZ structure factors) over
HTTP and feeds it directly into the C++ reader. The naive approach in
Tritium would be to download to a temp file and then load — but that
adds disk I/O latency and requires temp-file lifecycle handling.

UXP itself uses a streaming approach: bytes are fed into the reader's
IOThread as they arrive, and the user-cancelled case has a specific
`forceCancel` path that drains the IOThread cleanly. We want the same
behaviour in Tritium so the network and the reader run in parallel.

There is also a UI concern: the PDB ID input should remember recent IDs
across sessions, and surface them in a way that fits Chromium-rendered
input (UXP's XUL autocomplete won't transfer).

A subtle bug appeared during early implementation: the `.cif` extension
matches both the `mmcif` coordinate reader and the `mmcifmap` structure
factor reader. The renderer-list lookup needs to disambiguate or it
will pick the wrong one for the density-map flow.

## Decision

**Streaming via `StreamManager.supplyDataAsync`.** No temp file. Bytes
flow from the network fetch into the reader as they arrive.

**Cancel via `waitLoadAsync`.** Mirrors UXP `forceCancel`: drains the
IOThread before resolving the cancel call. Implemented in shared helper
`streamFetchToReader`.

**Coordinate path.** RCSB CIF / RCSB PDB. Renderer-list lookup uses
**explicit `readerName`** (`'mmcif'` / `'pdb'`) to avoid the .cif
ambiguity.

**Density-map path.** RCSB cif.gz (2Fo-Fc / Fo-Fc) or EBI MTZ via
`streamLoadDensityMap` worker, with preset contour color/sigma + a
post-load `obj.fitView` so the user sees something immediately.

**PDB ID input history.** Persisted in localStorage
(`pdbIdHistory.ts`, LRU dedup, capped at 20). Surfaced via a native
HTML5 `<datalist>` (Chromium-rendered type-to-filter autocomplete) on
the InputGroup — no custom dropdown component needed.

## Consequences

- **No temp file** keeps disk clean and shaves the wait time. The
  reader sees bytes as fast as the network delivers them.
- **The cancel path is honest** — `waitLoadAsync` ensures the reader
  state is settled before the user can launch another load. Without
  this, fast cancel-then-reload could race the IOThread.
- **Explicit `readerName` for .cif** is a permanent disambiguation;
  any new file extension that's claimed by multiple readers needs the
  same treatment.
- **`<datalist>` autocomplete** is OS-rendered, so styling is limited
  to whatever Chromium gives us. Acceptable trade for not maintaining
  a custom dropdown.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/worker/server/services/streamLoadFromUrl.service.ts`
  — coordinate streaming
- `tritium/react-gui/src/renderer/worker/server/services/streamLoadDensityMap.service.ts`
  — density-map streaming
- `tritium/react-gui/src/renderer/worker/server/services/helpers/streamFetchToReader.ts`
  — shared `fetch → IOThread` plumbing + `waitLoadAsync` cancel drain
- `tritium/react-gui/src/renderer/components/dialogs/GetPdbDialog.tsx`
  — UI
- `tritium/react-gui/src/renderer/components/fopen-opt-dlgs/pdbIdHistory.ts`
  — localStorage MRU history (LRU, cap 20)

### UXP parity

- `uxp_gui/cuemol2/base/content/cuemol2_main.js` — `loadObjectByURL`,
  `forceCancel`

### Related ADRs

- *(none yet — Get PDB is a self-contained download path)*

### Notes for future migrations

When porting another UXP feature that loads from URL or stream, prefer
the `streamFetchToReader` helper over a temp-file detour. The IOThread
plumbing already handles the producer/consumer lifecycle and the cancel
drain.
