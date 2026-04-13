# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

もしわからないことがあったら無理に探索して解決しようとせずにユーザーに尋ねること

This repository contains two main components:

- **libcuemol2** — C++17 shared library for macromolecular structure visualization (PDB, CCP4, CNS, MTZ, MSMS, APBS formats), with Python/Node.js bindings
- **tritium** (`tritium/`) — CueMol3 proof-of-concept desktop app built on Electron + React, bridging libcuemol2 via a Node.js native addon

## libcuemol2 Build

First-time setup (download dependencies):
```sh
cd build_scripts/ && task download_deplibs
```

初回rebuildしたいときは、
```sh
cd build_scripts/ && task rebuild_libcuemol2
```
あるいは、既存のbuild結果を全消ししてrebuildしたい場合
```sh
cd build_scripts/ && task clean_libcuemol2 && task rebuild_libcuemol2
```

Build:
```sh
cd build_scripts/ && task build_libcuemol2
```

Success indicators: `Install the project...` or `-- Up-to-date:...` in output.

**注意: build出力の読み方**

`task build_libcuemol2` は cmake build + install を両方行う。出力の末尾には install ステップの `-- Up-to-date: ...` が大量に並ぶが、これはビルドが実行されなかったことを意味しない。コンパイルエラーの有無は出力中の `error:` や `^\[N/M\]` の行で確認する。

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

**Wrapper generation**: `.qif` interface files define scriptable object interfaces; `*_wrap.cpp` files are auto-generated — do not edit them manually.

## C++ Coding Rules

- Follow `.clang-format` for formatting
- Use C++17 features where applicable; replace Boost with C++17 equivalents where possible
- Build option `BUILD_TESTS=ON` enables gtest compilation
- Headers inside `src/qsys/` must use `""` (quoted) form for intra-module includes, not `<>`. The test build's `-I` flags do not include `qsys/` directly, so `<View.hpp>` fails while `"View.hpp"` works.
- gtestが未実装のコードをrefactoring変更しようとする場合は、その部分に関連するgtestを作成してテストが通ることを確認してから実装を行う。実装後、gtestが通ることでrefactoringによりコードが壊れていないことを確認する。

## gtest Implementation Policy

- 本体のソースコードがおかしい場合は、無理にそちらに迎合してtestを作成/修正しようとせずに、本体を修正する
- Unit tests cover all logic in `.hpp` and `.cpp` files
- Exclude `*_wrap.cpp` (auto-generated) from test coverage
- Tests in `src/tests/` mirror the module structure of `src/`
- SetUp()では、src/libcuemol2_api/loader.cppのinit(...)と同様の初期化を行う必要がある。場合によってはqsys::init(...)に渡す引数confpathに、システムの設定ファイル、sysconfig.xmlのpathを渡す必要がある。
  - sysconfig.xmlは、インストール前のものは、`<topdir>/data/sysconfig.xml` にある
  - sysconfig.xmlは、インストール後は、`<install prefix>/data/sysconfig.xml` にある

---

## tritium Build & Development

tritium is a pnpm monorepo under `tritium/`, consisting of:

- `tritium/core/` — C++ native addon (`@cuemol/core`)
- `tritium/react-gui/` — Electron + React 18 app

### Root (pnpm monorepo)

```bash
cd tritium
pnpm install        # Install all packages
pnpm run build      # Build all packages recursively
```

### Core (`tritium/core/` — C++ native addon)

```bash
cd tritium/core
npm run install     # Compile C++ addon via cmake-js (requires LIBCUEMOL2_ROOT env var)
npm run test        # Run Jest tests (sequential, ESM mode)
```

To run a single test file:
```bash
cd tritium/core
cross-env NODE_OPTIONS="--experimental-vm-modules --no-warnings --expose-gc" npx jest --runInBand src/tests/qlib/Vector.test.ts
```

**Required environment variables for building:**
- `LIBCUEMOL2_ROOT` — path to installed libcuemol2 (mandatory)
- `Boost_ROOT` — path to Boost installation (optional, if not in standard path)

### React-GUI (`tritium/react-gui/` — Electron app)

```bash
cd tritium/react-gui
npm run dev         # Start development server with hot reload
npm run build       # Production build → out/
npm run start       # Preview production build
```

## tritium Architecture

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

- **TypeScript wrappers in `tritium/core/src/wrappers/`** are auto-generated from libcuemol2 at build time (copied by CMake's `copy_wrappers` target from `$LIBCUEMOL2_ROOT/share/typescript`). Do not edit these files manually.
- **Web Worker pattern**: The renderer offloads CueMol operations to a Web Worker (`react-gui/src/renderer/worker/`) to keep the UI thread responsive.
- **IPC flow**: Electron main ↔ renderer via standard Electron IPC; renderer ↔ Web Worker via `postMessage`.

### tritium Entry Points

- `tritium/core/src/cuemol.ts` — top-level `CueMol` class (main API surface)
- `tritium/core/src/BaseWrapper.ts` — base class all wrapped C++ objects inherit from
- `tritium/core/src/interfaces.ts` — shared TypeScript interfaces
- `tritium/react-gui/src/main/index.ts` — Electron main process (menu, IPC, window management)
- `tritium/react-gui/src/renderer/App.tsx` — root React component (layout with Allotment splitter)
- `tritium/react-gui/src/renderer/hooks/` — custom hooks: `useCueMol`, `useMolView`, `useLogEvent`

## tritium Tests

Tests live in `tritium/core/src/tests/` and cover the C++ binding layer (qlib primitives: Vector, Matrix, etc., plus async and gfx). There are no GUI tests currently.

Tests run sequentially (`--runInBand`) because the C++ addon is not thread-safe across Jest workers.
