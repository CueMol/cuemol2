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

**実装時の確認原則**
- wrapper/API の型は生成 TS だけで判断せず、既存 tests・`.qif`・C++/N-API 変換も確認する。`.qif` の `enum` property は数値ではなく文字列 ID で扱う
- 状態同期は「どの値を source of truth にするか」を先に決める。UI 操作後の menu checked などは、必要がなければ不安定な読み返し値ではなく成功した command の要求値で更新する
- Electron native menu と React menu は同じ template から作っても挙動が同一とは限らない。radio/checkbox など platform 側が状態を持つ item は、main 側の更新方式と衝突しないか確認する
- 契約が確認できたら、その契約に従って実装し、不要な正規化や互換コードを足さない。防御コードが必要な場合は、実際に観測された入力差分に限定する
- 境界 (main↔preload↔renderer / renderer↔worker / コマンド) をまたぐ追加は **型契約マップ** に行追加が起点 — `shared/ipcContract.ts` (`InvokeChannels`/`PushChannels`)、`worker/shared/WorkerCalls.ts` (`ServiceMap`/`MethodMap`/`RpcMap`)、`commands/CommandMap.ts`。マップ行を足すと callsite 側が compile error で誘導される。詳細は `tritium/CLAUDE.md`
- LSP の警告 (`Cannot find module '@cuemol/core/...'`、`electronAPI does not exist on Window` など) は project-references 解決の noise が多い。検証は `npx tsc -p tsconfig.<project>.json --noEmit` と production build (`task build_tritium`) を真とする

**End-to-end 検証チェーン**

`npm test` は worker や main を mock するので、実 IPC 経路や bundle 整合性は捕捉できない。リファクタや境界変更の最終確認は次の順で:

1. `cd tritium/react-gui && npm test` (Vitest, ~200+ tests)
2. `cd tritium/react-gui && npx tsc -p tsconfig.web.json --noEmit` (renderer 型) と `tsconfig.node.json` (main + preload 型)
3. `cd build_scripts && task build_tritium` (electron-vite production bundle — bundler レベルの依存解決を catch)
4. `cd build_scripts && task run_tritium` で起動し、`launch worker OK` → `CueMol2 nodejs add-on : INITIALIZED` → `bindCanvas` → `shader program created OK` まで進むか確認

**Refactoring 前の degrade 検出テスト**

大きな構造変更 (ファイル分割・型システム入れ替え・状態同期パターン変更) の前に、**touch する境界の観測契約** を pin するテストを `__test__/` に先に書く。例: 「`invoke(IPC.X, payload)` は `ipcRenderer.invoke(channel, payload)` に流れる」「`useActiveViewState` は activeMolViewId 変化時に 3 getter を呼んで `MENU_UPDATE_STATE` を発火する」など。実装の中身ではなく **wire 形式 / IPC channel 名 / payload shape / 観測される call 順序** を pin することで、内部を入れ替えても同じテストが pass し続ける形にする

**新規ダイアログの追加パターン (post-F factory)**
- `components/.../XxxDialog.tsx` — Blueprint `Dialog` 本体 (props: `visible`, `onConfirm`/`onCancel` 等の既存パターン)
- `components/.../XxxDialogProvider.tsx` — `createDialogHook` (`hooks/useDialogFactory.tsx`) で `Provider` / `useShowXxxDialog` を生やす (約 15 行)
- `contexts/DialogContext.tsx` の composite に `<XxxDialogProvider>` を 1 行追加
- `commands/ids.ts` に `CmdId.UiXxxDialog`、`commands/CommandMap.ts` に対応する `{ args; result }` 行
- 対応 `commands/useXxxCommands.ts` で `useShowXxxDialog()` を呼んで `useRegisterCommand`
- C++ データ取得が要れば `worker/server/services/xxx.service.ts` + `worker/shared/WorkerCalls.ts` の `ServiceMap` 行追加

---

## UXP → tritium Migration Tracking

`docs/migration/mapping/` 以下で進捗管理。UXP 機能を tritium に実装したら必ず更新する。

`docs/migration/uxp-inventory/` は **UXP GUI 側の現状棚卸し**。Tritium/CueMol3 への移行状況、完了率、実装済み/未実装判定、stub/mock/wired などの進捗情報は書かない。inventory は UXP 側の UI・commands・handlers・i18n・notes に閉じる。

移行進捗は **必ず `docs/migration/mapping/` に書く**。inventory entry より細かい粒度で進捗管理が必要な場合も、inventory ではなく mapping 側に補助セクションや詳細表を追加する。

| File | Purpose |
|------|---------|
| `docs/migration/mapping/<category>.md` | Per-item status (one row per UXP inventory entry) |
| `docs/migration/mapping/_index.md` | Summary counts, In Progress list |

**Row fields**: `ID | React | Mapping | Status | PR | ADR | Notes`

- **Mapping**: `direct`, `split`, `merged`, `dropped`, `deferred`
- **Status**: `todo` → `wip` → `review` → `done`

`_index.md` も status 変更のたびに counts・In Progress リストを更新すること。

進捗の補助情報を追加するときの原則:
- 完了率や item-level breakdown は mapping 側に置く
- `_index.md` の category counts は inventory entry 単位の status 集計として扱い、補助的な詳細表の行数は混ぜない
- `docs/migration/uxp-inventory/*.md` は auto-generated 扱いなので、手編集が必要な場合でも migration 進捗情報を入れない
