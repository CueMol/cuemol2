# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

もしわからないことがあったら無理に探索して解決しようとせずにユーザーに尋ねること

## Overview

- **libcuemol2** (`src/`) — C++17 shared library for macromolecular structure visualization, with Python/Node.js bindings
- **tritium** (`tritium/`) — CueMol desktop app (Electron + React 18 pnpm monorepo), bridging libcuemol2 via a Node.js native addon
  - `tritium/core/` — C++ native addon (`@cuemol/core`)
  - `tritium/react-gui/` — Electron + React 18 app
- **UXP GUI** (`uxp_gui/`) — CueMol2 legacy desktop app built on UXP (mozilla)

**Auto-generated — do not edit manually:**
- `*_wrap.cpp` — generated from `.qif` interface files
- `tritium/core/src/wrappers/` — TypeScript wrappers generated from libcuemol2 at build time

---

## libcuemol2 Build

```sh
cd build_scripts/ && task build_libcuemol2        # build + install
cd build_scripts/ && task rebuild_libcuemol2      # clean rebuild
cd build_scripts/ && task run_gtest               # run tests
```

Success: `Install the project...` or `-- Up-to-date:...` in output. Check for `error:` lines to detect compile errors.

### Architecture

```
src/
├── qlib/     Base library — vectors, matrices, streams, serialization
├── gfx/      Graphics abstraction
├── qsys/     Core scene system — scenes, views, renderers, I/O, undo, styles
├── modules/
│   ├── molstr/   Molecular structure
│   ├── molvis/   Molecular visualization
│   └── ...
└── tests/    gtest unit tests
```

### C++ Rules

- Follow `.clang-format`; use C++17; replace Boost where possible
- Headers in `src/qsys/` must use `""` not `<>` for intra-module includes
- gtest: write tests before refactoring; `SetUp()` must call `qsys::init(...)` with `sysconfig.xml` path (pre-install: `<topdir>/data/sysconfig.xml`)

---

## tritium Build & Development

```bash
cd tritium && pnpm install && pnpm run build   # monorepo setup

cd tritium/core && npm run install             # compile C++ addon
cd tritium/core && npm run test                # Jest tests (--runInBand)

cd tritium/react-gui && npm run dev            # dev server
cd tritium/react-gui && npm run build          # production build
cd tritium/react-gui && npm test               # Vitest tests
```

### Architecture

```
react-gui (Electron + React 18)
├─ Main Process: src/main/  (menu, IPC, file dialog)
└─ Renderer Process: src/renderer/
    ├─ App.tsx, hooks/, commands/, contexts/
    └─ Web Worker: worker/services/*.service.ts  (C++ calls, sync)

core (@cuemol/core): C++ addon + auto-generated TypeScript wrappers
```

**IPC flow**: main ↔ renderer via Electron IPC; renderer ↔ worker via `postMessage`.

### React-GUI Coding Conventions

**スタイル・色**
- 色のハードコード (`#rrggbb`) は避ける
- 静的パレット色: `Colors.*` を `@blueprintjs/core` から使う
- テーマ追従色: Blueprint CSS 変数 `var(--pt-text-color)`, `var(--pt-text-color-muted)` などを使う
- ダークモード: `portalClassName={isDark ? 'bp5-dark' : ''}` を Dialog に付与すれば Blueprint が自動対応

**macOS ネイティブメニュー**
- macOS アプリメニューは `src/main/menu.ts` の `macOnlyGroups` にハードコードされており、`APP_MENU` の `darwinOnly` グループは無視される。macOS 側の変更は `menu.ts` を直接編集する
- カスタム動作のメニュー項目には `role` ではなく `ipcChannel: 'menu:xxx'` を使う

**新規ダイアログの追加パターン**
1. `worker/services/xxx.service.ts` — C++ データ取得
2. `AsyncCueMol.ts` — `invokeWorker('xxx', args)` のラッパーメソッド
3. `components/XxxDialog.tsx` — Blueprint `Dialog` コンポーネント
4. `contexts/DialogContext.tsx` — `showXxxDialog()` を追加
5. `commands/ids.ts` — `CmdId.UiXxxDialog` を追加
6. `hooks/useMenuDispatch.ts` — `'menu:xxx'` チャネルのハンドリング
7. `commands/useSceneCommands.ts` — コマンド登録

---

## UXP → tritium Migration Tracking

`docs/migration/mapping/` 以下で進捗管理。UXP 機能を tritium に実装したら必ず更新する。

| File | Purpose |
|------|---------|
| `docs/migration/mapping/<category>.md` | Per-item status (one row per UXP inventory entry) |
| `docs/migration/mapping/_index.md` | Summary counts, In Progress list |

**Row fields**: `ID | React | Mapping | Status | PR | ADR | Notes`

- **Mapping**: `direct`, `split`, `merged`, `dropped`, `deferred`
- **Status**: `todo` → `wip` → `review` → `done`

`_index.md` も status 変更のたびに counts・In Progress リストを更新すること。
