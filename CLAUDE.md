# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

もしわからないことがあったら無理に探索して解決しようとせずにユーザーに尋ねること

CueMol2 is a macromolecular structure visualization framework (PDB, CCP4, CNS, MTZ, MSMS, APBS formats). The core is a C++17 shared library (`libcuemol2`) with Python/Node.js bindings and a multi-platform GUI.

## Build

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

## Tests

```sh
cd build_scripts/ && task run_gtest
```

Tests use Google Test (v1.14.0, fetched via CMake FetchContent). Test binaries: `test_qlib`, `test_gfx`, `test_qsys`, `test_molstr`.

## Architecture

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

## gtest Implementation Policy

- 本体のソースコードがおかしい場合は、無理にそちらに迎合してtestを作成しようとせずに、本体も修正する
- Unit tests cover all logic in `.hpp` and `.cpp` files
- Exclude `*_wrap.cpp` (auto-generated) from test coverage
- Tests in `src/tests/` mirror the module structure of `src/`
- SetUp()では、src/libcuemol2_api/loader.cppのinit(...)と同様の初期化を行う必要がある。場合によってはqsys::init(...)に渡す引数confpathに、システムの設定ファイル、sysconfig.xmlのpathを渡す必要がある。
  - sysconfig.xmlは、インストール前のものは、`<topdir>/data/sysconfig.xml` にある
  - sysconfig.xmlは、インストール後は、`<install prefix>/data/sysconfig.xml` にある

