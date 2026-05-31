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

**スタイル・デザイントークン (MUST)** — 全トークンは `react-gui/src/renderer/styles/_variables.css` に定義。詳細・一覧・移植チェックリストは [`docs/migration/ui-style-guide.md`](docs/migration/ui-style-guide.md)。
- **色**: 必ずアプリ semantic トークン (`var(--bg-*)` / `var(--text-*)` / `var(--accent*)` / `var(--border*)`) 経由。生 hex / `rgb()` / `Colors.*` (`@blueprintjs/core`) / Blueprint 内部変数 `var(--pt-*)` は**禁止**。例外は `crash/` (テーマアクセス不可)・NAMED_COLORS 等の分子色データ・`--swatch-text` のような固定コントラスト色のみ。
- **余白/サイズ/角丸**: `var(--space-0..6)` / `var(--ctrl-h-sm|md|lg)` / `var(--panel-header-h)` / `var(--icon-sm|md|lg)` / `var(--radius-sm|md|lg)` 経由。生 px を新規に書かない。新しい値が要るときは**まず `_variables.css` にトークンを足してから参照**する (コンポーネントに直書きしない)。
- **フォント (意味的 role で選ぶ)**: テキストは **px やトークンを「目的の見た目」から逆算して選ばず、UI 上の役割 (role) で選ぶ**。`styles/_typography.css` の `.type-*` ユーティリティクラスを JSX に貼る: `.type-title` / `.type-subtitle` / `.type-eyebrow` (大文字セクション見出し) / `.type-label` / `.type-row` (リスト・ツリー行) / `.type-body` (説明文) / `.type-caption` / `.type-mono` / `.type-hero`。同じ role の UI は必ず同じクラスを使い統一する。自前で描画しない Blueprint 注入要素 (`.bp5-tree-node-content`, `.bp5-menu-item` 等) だけ、対応する `--type-<role>-fs|-lh|-fw` 変数を CSS で参照する。生 `--fs-*` / `--lh-*` を component CSS で新規直参照しない (raw primitive であり role の裏方)。inline `style` の `fontSize` 数値・`em` 直書きも禁止。
- **構造 role**: panel header = `.panel-header`、sub-section header = `.section-header`、リスト/ツリー行 = `.list-row` (`_typography.css`)。同じ役割の box を component ごとに重複定義しない。
- **label+control UI は form-kit カタログで組む (MUST)**: ラベル付きフォーム行・テキスト入力・select・numeric・switch・color・compact button は `components/widgets/form/` の `Field` / `FieldGroup` / `TextField` / `SelectField` / `NumericField` / `SwitchField` / `ColorField` / `FormButton` を使う。**これらは size props を公開せず、コントロール高・行高・label gap・section spacing をカタログが所有する**ので、呼び出し側がサイズを再決定できない (font の role 選択と同じ思想を size 軸へ拡張)。サイズの単一ソースは `styles/_form-kit.css` ＋ `_variables.css` の `--field-*` / `--form-*` トークン。**consumer の CSS / inline `style` でコントロール高・行高・label gap を指定しない**。必要なコントロールがカタログに無ければ、**先にカタログへ 1 つ追加**してから使う (consumer 側でサイズを決めない)。dense な専用 widget で component 化が難しい箇所のみ、スコープした CSS から `--field-*` トークンを参照する (生 px 禁止)。一覧・対応表は [`docs/migration/ui-component-catalog.md`](tritium/react-gui/docs/migration/ui-component-catalog.md)。トークンの「中から値を選ぶ」のはサイズ選びと同義で強制力にならない — **同じコンポーネントを使えば同じサイズになる**形にすること。
- **既定値**: panel header 高さ = `--panel-header-h` (30px、トップレベルのみ。sub-section は `--ctrl-h-md`)、リスト/ツリー行高さ = `--row-h` (22px)、icon = `--icon-md` (14px)。毎回サイズを決め直さない。
- 新規スタイルは原則 `styles/_*.css` のクラスに置く。inline `style={{}}` は動的値 (計算した色プレビュー等) のみ許可。
- 検証: `cd tritium/react-gui && npm run lint:style` (または `task lint_tritium_style`) で生 hex/px を検出 (warn-only)。新規追加でベースライン件数を増やさないこと。
- ダークモード: `portalClassName={isDark ? 'bp5-dark' : ''}` を Dialog に付与すれば Blueprint が自動対応。テーマ切替は `data-theme` 属性 + semantic トークンの再マッピングで一括解決される。

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

**新規ダイアログの追加パターン**
- `components/.../XxxDialog.tsx` — Blueprint `Dialog` 本体 (props: `visible`, `onConfirm`/`onCancel` 等の既存パターン)
- `components/.../XxxDialogProvider.tsx` — `createDialogHook` (`hooks/useDialogFactory.tsx`) で `Provider` / `useShowXxxDialog` を生やす (約 15 行)
- `contexts/DialogContext.tsx` の `composeProviders([...])` 配列に `XxxDialogProvider` を 1 行追加
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
| `docs/migration/adr/ADR-NNNN-<slug>.md` | Architecture decision records — design rationale, UXP parity strategy, known issues |
| `docs/migration/adr/_index.md` | ADR index (number / title / status / mapping rows) |
| `docs/migration/adr/_template.md` | Template for new ADRs |
| `docs/migration/option-ux-guidelines.md` | How to route a dialog migration to a modal / panel / drawer / popover pattern |

**Row fields**: `ID | React | Mapping | Status | PR | ADR | Notes`

- **Mapping**: `direct`, `split`, `merged`, `dropped`, `deferred`
- **Status**: `todo` → `wip` → `review` → `done`
- **ADR**: link(s) like `[ADR-0001](../adr/ADR-0001-<slug>.md)` — comma-separated when multiple

`_index.md` も status 変更のたびに counts・In Progress リストを更新すること。

進捗の補助情報を追加するときの原則:
- 完了率や item-level breakdown は mapping 側に置く
- `_index.md` の category counts は inventory entry 単位の status 集計として扱い、補助的な詳細表の行数は混ぜない
- `docs/migration/uxp-inventory/*.md` は auto-generated 扱いなので、手編集が必要な場合でも migration 進捗情報を入れない

ADR (Architecture Decision Records) の運用:
- 設計判断・UXP parity 戦略・既知バグの詳細は `docs/migration/adr/ADR-NNNN-<slug>.md` に切り出す
- mapping の Notes 列は **1–2 文の要約 + ADR リンク** に留める。次のいずれかに当たる場合は ADR を作る:
  - Notes に書きたい設計判断が **3 文 (約 200 字) を超える**
  - known issue を書きたい (Notes は 1 文要約 + ADR リンク)
  - 1 mapping 行に複数 phase / 独立した複数判断が並ぶ
- ADR 番号は 4 桁ゼロ詰連番。一度割り当てたら再利用しない (supersede は Status 行で記録)
- 新規 ADR は `_template.md` をコピー。`_index.md` に 1 行追加
