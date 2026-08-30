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

## Common tasks (`build_scripts/`)

Recurring operations are [Task](https://taskfile.dev) targets run from
`build_scripts/`. Prefer these over re-discovering commands; full list: `task --list`.

| Command | Purpose |
|---------|---------|
| `task build_libcuemol2` / `rebuild_libcuemol2` | Build / clean-rebuild libcuemol2 |
| `task run_gtest` | C++ unit tests (ctest) |
| `task build_tritium` / `run_tritium` | Build / run the tritium app |
| `task test_tritium` | tritium tests (core Jest + react-gui Vitest) |
| `task bump_version_build` | Bump build number `x.y.z.BUILD` (edits all 3 version files) |
| `task bump_version_rev` | Bump revision number `x.y.REV.build` |

Version bump wraps `bump_version_{build,rev}.sh` (bump-my-version) and edits
`.bumpversion.cfg`, `src/_version.h`, `uxp_gui/cuemol2/config/version.txt`. The
scripts make no git commit or tag (`commit = False` / `tag = False`). Commit
message convention: `chore(version): bump build number to <x.y.z.b>` when only
the build moves, `chore(version): bump version <old> -> <new>` when the revision
moves too.

Releases are cut by pushing a `v*` tag, which is the only trigger for the release
build; see `docs/release_notes/README.md` for the procedure and the release-note
convention.

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

- Follow `.clang-format`; use C++17
- Migrate Boost -> `std` **only when `std` has standardized the equivalent** (e.g. `boost::filesystem`->`std::filesystem`, `boost::optional`->`std::optional`). Where `std` has no equivalent (e.g. Boost.Process, Boost.Interprocess), Boost is the right tool -- do not hand-roll or avoid it
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

**UI/UX・CSS・コンポーネント規約 (MUST)** — 規約は全て [`docs/migration/ui-style-guide.md`](docs/migration/ui-style-guide.md) に**集約**。UI/UX の記述をこの CLAUDE.md や他所に分散させない (新規規約はガイドへ追記)。新規 UI を書く前に必ず一読すること。要点:
- **label+control UI は form-kit カタログで組む / サイズは選ばない (最重要)**: フォーム行・テキスト入力・select・numeric・switch・color・compact button・segmented control・ツールバー類は `react-gui/src/renderer/h3-kit/form/` の `Field` / `FieldGroup` / `FieldSection` / `TextField` / `SelectField` / `NumericField` / `SwitchField` / `ColorField` / `FormButton` / `SegmentField` を使う。これらは size props を持たず、サイズの単一ソースは `_form-kit.css` ＋ `--field-*`/`--form-*` トークン。**コントロール高・行高・label gap・section spacing を consumer の CSS/inline `style` で指定しない**。無い部品は**先にカタログへ追加**してから使う。「コンポーネント追加のたびにサイズが崩れる」のを防ぐ核心規約。
- **UI 実装前に必ずカタログ (`h3-kit/form/` ＋ 実物確認は `components/panes/CatalogPane1/2/3`) を一覧し、使えそうな既存 component を探して極力再利用する (最優先)**: 参照画像や欲しい見た目に一致する既存部品を CatalogPane で特定してから使う (例: **ステッパー付き数値ボックス = `SliderField`** (`slider={false}` で slider 無し)、drag 数値 = `DragNumericField`、2 桁 cell = `NumberCell`)。既存パターンを別 component に自作で再実装しない (例: `NumericField` は既定でステッパーを隠す設計なので、ステッパーが欲しければ `NumericField` に足すのではなく `SliderField` を使う)。真に無い場合のみカタログへ追加する。カタログ調査を飛ばして Blueprint 直叩き/独自 CSS で作り直すと、既存の verified 実装と食い違い、サイズ・デザインが合わず手戻りが発生する。
- **ラベルの階層も component で決める (微調整しない)**: pane 内の**最上位グループ見出し** (例 `Molecule`/`Term`) は `FieldSection` の `title` (= `.type-group-label` role)、**下位の行ラベル**は `Field`/`.type-label`。section 間余白は親 container の `gap: var(--form-section-gap)` 1 回のみ。weight/大文字/字間/spacing を consumer 側で個別に足さない (詳細は ui-style-guide.md §0)。
- 色・余白・サイズ・角丸は `_variables.css` のトークン経由 (生 hex/px 禁止)。テキストは `.type-*` role で選ぶ (px 逆算しない)。構造は `.panel-header` / `.section-header` / `.list-row`。inline `style={{}}` は動的値のみ。
- dark/light 両テーマで確認。検証: `cd tritium/react-gui && npm run lint:style` (または `task lint_tritium_style`)。新規追加でベースライン件数を増やさない。
- 詳細 (トークン一覧・カタログ component 表・typography role・do/don't・移植チェックリスト) は ui-style-guide.md を見る。

**macOS ネイティブメニュー**
- macOS アプリメニューは `shared/menuTemplate.ts` の `macAppMenuGroup(appName)`。`APP_MENU` と同じ形の data で、native menu builder が macOS のときだけ先頭に足す (`APP_MENU` の group-level `darwinOnly` は使われていない)
- カスタム動作のメニュー項目には `role` ではなく `ipcChannel: 'menu:xxx'` を使う

**実装時の確認原則**
- wrapper/API の型は生成 TS だけで判断せず、既存 tests・`.qif`・C++/N-API 変換も確認する。`.qif` の `enum` property は数値ではなく文字列 ID で扱う
- 状態同期は「どの値を source of truth にするか」を先に決める。UI 操作後の menu checked などは、必要がなければ不安定な読み返し値ではなく成功した command の要求値で更新する
- Electron native menu と React menu は同じ template から作っても挙動が同一とは限らない。radio/checkbox など platform 側が状態を持つ item は、main 側の更新方式と衝突しないか確認する
- 契約が確認できたら、その契約に従って実装し、不要な正規化や互換コードを足さない。防御コードが必要な場合は、実際に観測された入力差分に限定する
- 境界 (main↔preload↔renderer / renderer↔worker / コマンド) をまたぐ追加は **型契約マップ** に行追加が起点 — `shared/ipcContract.ts` (`InvokeChannels`/`PushChannels`)、`worker/shared/calls/` (`ServiceMap`/`MethodMap`/`RpcMap`)、`commands/CommandMap.ts`。マップ行を足すと callsite 側が compile error で誘導される。詳細は `tritium/CLAUDE.md`
- LSP の警告 (`Cannot find module '@cuemol/core/...'`、`electronAPI does not exist on Window` など) は project-references 解決の noise が多い。検証は `npx tsc -p tsconfig.<project>.json --noEmit` と production build (`task build_tritium`) を真とする

**検証チェーン (実装 → ユーザー目視確認 → test/lint の順)**

実装が終わったら、**まず動くものをユーザーに見せる**。テストや lint の整備は目視確認で仕様・挙動が確定した後に行う (先に書くと修正時に手戻りで無駄になる):

1. `cd build_scripts && task build_tritium` (electron-vite production bundle — bundler レベルの依存解決を catch。既存テストの修正もこの段階ではしない)
2. `cd build_scripts && task run_tritium` で起動し、`launch worker OK` → `CueMol2 nodejs add-on : INITIALIZED` → `bindCanvas` → `shader program created OK` まで進むか確認
3. **ユーザーによる目視確認 (E2E) を依頼し、フィードバックを反映する。挙動が確定するまで 1-3 を繰り返す**
4. 確定後に: `cd tritium/react-gui && npm test` (Vitest) — 既存テストの追随修正と新規テストの追加
5. `cd tritium/react-gui && npx tsc -p tsconfig.web.json --noEmit` (renderer 型) と `tsconfig.node.json` (main + preload 型)、`task lint_tritium_style`

`npm test` は worker や main を mock するので、実 IPC 経路や bundle 整合性は捕捉できない。ビルドと起動の確認だけを先に行い、テスト整備は目視確認後にまとめて行う。

**Refactoring 前の degrade 検出テスト**

大きな構造変更 (ファイル分割・型システム入れ替え・状態同期パターン変更) の前に、**touch する境界の観測契約** を pin するテストを `__test__/` に先に書く。例: 「`invoke(IPC.X, payload)` は `ipcRenderer.invoke(channel, payload)` に流れる」「`useActiveViewState` は activeMolViewId 変化時に 3 getter を呼んで `MENU_UPDATE_STATE` を発火する」など。実装の中身ではなく **wire 形式 / IPC channel 名 / payload shape / 観測される call 順序** を pin することで、内部を入れ替えても同じテストが pass し続ける形にする

**新規ダイアログの追加パターン**
- `components/.../XxxDialog.tsx` — Blueprint `Dialog` 本体 (props: `visible`, `onConfirm`/`onCancel` 等の既存パターン)
- `components/.../XxxDialogProvider.tsx` — `createDialogHook` (`hooks/useDialogFactory.tsx`) で `Provider` / `useShowXxxDialog` を生やす (約 15 行)
- `contexts/DialogContext.tsx` の `composeProviders([...])` 配列に `XxxDialogProvider` を 1 行追加
- `commands/ids.ts` に `CmdId.UiXxxDialog`、`commands/CommandMap.ts` に対応する `{ args; result }` 行
- 対応 `commands/useXxxCommands.ts` で `useShowXxxDialog()` を呼んで `useRegisterCommand`
- C++ データ取得が要れば `worker/server/services/xxx.service.ts` + `worker/shared/calls/` の `ServiceMap` 行追加

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

**まず置き場所を選ぶ (最重要)**: `docs/migration/adr/` は **UXP -> tritium の移植判断専用**。
UXP に無かった機能の追加、build / packaging、内部アーキテクチャの設計記録は
`docs/architecture/<topic>.md` に置き、`docs/architecture/_index.md` に 1 項目追加する
(トピック名で命名。`ADR-NNNN` 連番は migration 側の固有ルールなので持ち込まない)。
判断基準は「UXP のどの surface を移植したのか説明できるか」。できないなら architecture 側。
mapping 行に関連していても、**主題が新規機能なら architecture 側**に置き、mapping の Notes
からリンクする。

以下は `docs/migration/adr/` (移植判断) についての運用:
- 設計判断・UXP parity 戦略・既知バグの詳細は `docs/migration/adr/ADR-NNNN-<slug>.md` に切り出す
- mapping の Notes 列は **1–2 文の要約 + ADR リンク** に留める。次のいずれかに当たる場合は ADR を作る:
  - Notes に書きたい設計判断が **3 文 (約 200 字) を超える**
  - known issue を書きたい (Notes は 1 文要約 + ADR リンク)
  - 1 mapping 行に複数 phase / 独立した複数判断が並ぶ
- ADR 番号は 4 桁ゼロ詰連番。一度割り当てたら再利用しない (supersede は Status 行で記録)
- 新規 ADR は `_template.md` をコピー。`_index.md` に 1 行追加
