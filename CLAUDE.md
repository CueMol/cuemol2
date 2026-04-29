# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

もしわからないことがあったら無理に探索して解決しようとせずにユーザーに尋ねること

This repository contains:

- **libcuemol2** (`src/`) — C++17 shared library for macromolecular structure visualization (PDB, CCP4, CNS, MTZ, MSMS, APBS formats), with Python/Node.js bindings
- **tritium** (`tritium/`) — CueMol desktop app (Electron + React 18 pnpm monorepo), bridging libcuemol2 via a Node.js native addon
  - `tritium/core/` — C++ native addon (`@cuemol/core`)
  - `tritium/react-gui/` — Electron + React 18 app
- **UXP GUI** (`uxp_gui/`) — CueMol2 desktop app built on UXP (mozilla)

**Auto-generated files — do not edit manually:**
- `*_wrap.cpp` — generated from `.qif` interface files (scriptable object interfaces)
- `tritium/core/src/wrappers/` — TypeScript wrappers generated from libcuemol2 at build time (copied by CMake's `copy_wrappers` target from `$LIBCUEMOL2_ROOT/share/typescript`)

## libcuemol2 Build

First-time setup (download dependencies):
```sh
cd build_scripts/ && task download_deplibs
```

初回rebuildしたいときは、
```sh
cd build_scripts/ && task rebuild_libcuemol2
```
既存のbuild結果を全消ししてrebuildしたい場合:
```sh
cd build_scripts/ && task clean_libcuemol2 && task rebuild_libcuemol2
```

Build:
```sh
cd build_scripts/ && task build_libcuemol2
```

Success indicators: `Install the project...` or `-- Up-to-date:...` in output.

**注意:** `task build_libcuemol2` は cmake build + install を両方行う。出力末尾の `-- Up-to-date: ...` はビルドが実行されなかったことを意味しない。コンパイルエラーの有無は出力中の `error:` や `^\[N/M\]` の行で確認する。

## libcuemol2 Tests

```sh
cd build_scripts/ && task run_gtest
```

Tests use Google Test (v1.14.0, fetched via CMake FetchContent). Test binaries: `test_qlib`, `test_gfx`, `test_qsys`, `test_molstr`.

## libcuemol2 Architecture

```
src/
├── qlib/        Base library — vectors, matrices, streams, serialization
├── gfx/         Graphics abstraction — colors, rendering primitives
├── qsys/        Core scene system — scenes, views, renderers, I/O, events, undo, styles
├── sysdep/      Platform-specific OpenGL contexts
├── modules/
│   ├── molstr/  Molecular structure (atoms, bonds, residues, chains)
│   ├── molvis/  Molecular visualization
│   ├── importers/ File format importers
│   └── ...      Other modules (surface, anim, xtal, etc.)
└── tests/       gtest unit tests mirroring src/ structure
```

**Module system**: Modules register with `qsys` (SceneManager, RendererFactory) at init time.

## C++ Coding Rules

- Follow `.clang-format` for formatting
- Use C++17 features where applicable; replace Boost with C++17 equivalents where possible
- Build option `BUILD_TESTS=ON` enables gtest compilation
- Headers inside `src/qsys/` must use `""` (quoted) form for intra-module includes, not `<>`. The test build's `-I` flags do not include `qsys/` directly, so `<View.hpp>` fails while `"View.hpp"` works.

### gtest Policy

- gtestが未実装のコードをrefactoring変更しようとする場合は、その部分に関連するgtestを作成してテストが通ることを確認してから実装を行う。実装後、gtestが通ることでrefactoringによりコードが壊れていないことを確認する。
- 本体のソースコードがおかしい場合は、無理にそちらに迎合してtestを作成/修正しようとせずに、本体を修正する
- Unit tests cover all logic in `.hpp` and `.cpp` files (exclude `*_wrap.cpp`)
- Tests in `src/tests/` mirror the module structure of `src/`
- SetUp()では、`src/libcuemol2_api/loader.cpp`のinit(...)と同様の初期化を行う必要がある。場合によっては`qsys::init(...)`に渡す引数confpathに、`sysconfig.xml`のpathを渡す必要がある。
  - インストール前: `<topdir>/data/sysconfig.xml`
  - インストール後: `<install prefix>/data/sysconfig.xml`
- 各機能が仕様通りに機能するか検査する。
- 不必要に類似のテストを実装しない。必要最低限のものにする。
- 将来の別のupdate時にコードを改変した際に、想定した仕様動作が破壊されたかどうかを検知できるものにする。
- 関数やmethodレベルのtestだけでなく、ある程度クラスやmethodを跨った機能単位の結合テストも必要性を検討し実装する。

---

## tritium Build & Development

### Root (pnpm monorepo)

```bash
cd tritium
pnpm install        # Install all packages
pnpm run build      # Build all packages recursively
```

### Core (`tritium/core/`)

```bash
cd tritium/core
npm run install     # Compile C++ addon via cmake-js
npm run test        # Run Jest tests (sequential --runInBand, ESM mode)
```

Single test file:
```bash
cd tritium/core
cross-env NODE_OPTIONS="--experimental-vm-modules --no-warnings --expose-gc" npx jest --runInBand src/tests/qlib/Vector.test.ts
```

**Required environment variables:**
- `LIBCUEMOL2_ROOT` — path to installed libcuemol2 (mandatory)
- `Boost_ROOT` — path to Boost installation (optional)

### React-GUI (`tritium/react-gui/`)

```bash
cd tritium/react-gui
npm run dev         # Start development server with hot reload
npm run build       # Production build → out/
npm run start       # Preview production build
npm test            # Run Vitest tests (vitest run)
```

## tritium Architecture

```
react-gui (Electron + React 18)
├─ Main Process: electron menu, file dialog, IPC
│   → tritium/react-gui/src/main/index.ts
└─ Renderer Process: React UI
    │ → tritium/react-gui/src/renderer/App.tsx (root component, Allotment splitter)
    │ → tritium/react-gui/src/renderer/hooks/ (useCueMol, useMolView, useLogEvent)
    └─ Web Worker: heavy CueMol operations (worker/WorkerService.ts, worker/services/*.service.ts)

core (@cuemol/core)
├─ tritium/core/src/cuemol.ts — main CueMol facade class (top-level API)
├─ tritium/core/src/BaseWrapper.ts — base class for all C++ object wrappers
├─ tritium/core/src/interfaces.ts — shared TypeScript interfaces
├─ tritium/core/src/wrappers/ — auto-generated TypeScript wrappers
└─ C++ addon (cxx_src/) → build/Release/cuemol_internal.node

libcuemol2 (external C++ library, path via LIBCUEMOL2_ROOT)
```

**IPC flow**: Electron main ↔ renderer via standard Electron IPC; renderer ↔ Web Worker via `postMessage`.

**Tests**: `tritium/core/src/tests/` covers the C++ binding layer (Jest, sequential `--runInBand`). `tritium/react-gui/src/renderer/__test__/` covers React hooks and components (Vitest + jsdom). See `tritium/CLAUDE.md` for react-gui test caveats.

---

## UXP → tritium Migration Tracking

Migration progress is tracked in `docs/migration/mapping/`. Update these docs whenever a UXP GUI feature is implemented in tritium.

### Files to update

| File | Purpose |
|------|---------|
| `docs/migration/mapping/<category>.md` | Per-item status — one row per UXP inventory entry |
| `docs/migration/mapping/_index.md` | Summary counts, Mapping Type Breakdown, In Progress list |

Category files mirror the UXP inventory categories: `toolbars.md`, `panels.md`, `menus.md`, `overlay.md`, `prop_dlgs.md`, `other_dlgs.md`, `tool_dlgs.md`, `custom_widgets.md`, `other.md`.

### Row fields

```
| ID | React | Mapping | Status | PR | ADR | Notes |
```

- **React**: primary React component(s) implementing the feature (e.g., `MyComponent / useMyHook`)
- **Mapping**: `direct` (1:1), `split` (one UXP item → multiple React components), `merged` (absorbed into existing component), `dropped` (feature removed), `deferred`
- **Status**: `todo` → `wip` (implementation started) → `review` (PR open) → `done` (merged to main)
- **Notes**: briefly list what is done and what remains pending within this item

### _index.md update rules

When any row's status changes, update `_index.md`:
1. Category row — adjust `wip`, `todo`, `done` counts
2. Total row — same adjustments
3. Mapping Type Breakdown — increment the mapping type count when first assigned
4. In Progress section — add the row when status becomes `wip`; remove it when `done`
5. Unstarted count — decrement when status moves away from `todo`
6. Updated date — set to today's date
