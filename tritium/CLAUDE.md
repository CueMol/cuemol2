# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CueMol3-POC2 is a proof-of-concept for a molecular visualization desktop application. It bridges a legacy C++ library (libcuemol2) to a modern Electron + React UI via Node.js native addons.

## Build & Development Commands

### Root (pnpm monorepo)

```bash
pnpm install        # Install all packages
pnpm run build      # Build all packages recursively
```

### Core (`core/` — C++ native addon)

```bash
cd core
npm run install     # Compile C++ addon via cmake-js (requires LIBCUEMOL2_ROOT env var)
npm run test        # Run Jest tests (sequential, ESM mode)
```

To run a single test file:
```bash
cd core
cross-env NODE_OPTIONS="--experimental-vm-modules --no-warnings --expose-gc" npx jest --runInBand src/tests/qlib/Vector.test.ts
```

**Required environment variables for building:**
- `LIBCUEMOL2_ROOT` — path to installed libcuemol2 (mandatory)
- `Boost_ROOT` — path to Boost installation (optional, if not in standard path)

### React-GUI (`react-gui/` — Electron app)

```bash
cd react-gui
npm run dev         # Start development server with hot reload
npm run build       # Production build → out/
npm run start       # Preview production build
```

## Architecture

### Layer Stack

```
react-gui (Electron + React 18)
    └─ Main Process: electron menu, file dialog, IPC
    └─ Renderer Process: React UI
        └─ Web Worker: heavy CueMol operations (worker/main.ts, worker/services.ts)
core (@cuemol/core)
    └─ TypeScript wrappers (src/wrappers/ — auto-generated from libcuemol2)
    └─ cuemol.ts — main facade class
    └─ BaseWrapper.ts — base for all C++ object wrappers
    └─ C++ addon (cxx_src/) → build/Release/cuemol_internal.node
libcuemol2 (external C++ library, path via LIBCUEMOL2_ROOT)
```

### Key Design Points

- **TypeScript wrappers in `core/src/wrappers/`** are auto-generated from libcuemol2 at build time (copied by CMake's `copy_wrappers` target from `$LIBCUEMOL2_ROOT/share/typescript`). Do not edit these files manually.
- **Web Worker pattern**: The renderer offloads CueMol operations to a Web Worker (`react-gui/src/renderer/worker/`) to keep the UI thread responsive.
- **IPC flow**: Electron main ↔ renderer via standard Electron IPC; renderer ↔ Web Worker via `postMessage`.

### Core Package Entry Points

- `core/src/cuemol.ts` — top-level `CueMol` class (main API surface)
- `core/src/BaseWrapper.ts` — base class all wrapped C++ objects inherit from
- `core/src/interfaces.ts` — shared TypeScript interfaces

### React-GUI Entry Points

- `react-gui/src/main/index.ts` — Electron main process (menu, IPC, window management)
- `react-gui/src/renderer/App.tsx` — root React component (layout with Allotment splitter)
- `react-gui/src/renderer/hooks/` — custom hooks: `useCueMol`, `useMolView`, `useLogEvent`

## Testing

Tests live in `core/src/tests/` and cover the C++ binding layer (qlib primitives: Vector, Matrix, etc., plus async and gfx). There are no GUI tests currently.

Tests run sequentially (`--runInBand`) because the C++ addon is not thread-safe across Jest workers.
