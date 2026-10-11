# Implementation plans

実装計画・計画作成の依頼書・着手前の調査記録の置き場。

**このディレクトリは「まだ実装されていないもの」だけを持つ。**
実装が済んだ仕様の説明は [`../architecture/`](../architecture/_index.md) 側に置く
(architecture は現在のコードの spec として読めることを保証する)。UXP -> tritium の
移植判断は [`../migration/adr/`](../migration/adr/_index.md)。

項目を実装したら、その仕様 (現在の挙動、設計判断の理由、計画から変えた点) を architecture 側に
書き起こしてから plan から消す。全項目が済んだ plan はファイルごと削除し、下表の行も消す
(経緯は git 履歴で追う)。一部だけ済んだ plan は残りの項目だけに書き直す。

新規ファイルの命名は `YYMMDD-<slug>-plan.md` (例: `260908-tritium-plugin-system-plan.md`)。

---

## 現役 (未実装)

| ファイル | 内容 | 状態 |
|---|---|---|
| [260908-tritium-plugin-system-plan.md](260908-tritium-plugin-system-plan.md) | tritium の plugin システム (JS/TS + C++ 両レーン)。VSCode 拡張機構の調査、C++ 登録機構の seam、packaging と配置、Phase 0/A/A'/B/C | **Phase 0 のみ実装済み** (react 側の in-tree plugin host。`../architecture/tritium_plugin/`)。実行時ロード (Phase A)、C++ レーン (Phase A')、schema 駆動 UI / sideload (Phase B)、重い native の分離 (Phase C) は未実装 |
| [umbreon-process-isolation-plan.md](umbreon-process-isolation-plan.md) | umbreon GI(OIDN) の大確保が Chromium PartitionAlloc で crash する件と、恒久対策としての process 分離 (mmap zero-copy) | **未実装 / 当面着手しない**。§2 の原因究明は確定した調査結果。着手条件は crash が実害になったとき |
| [260925-molcoord-atom-vector-plan.md](260925-molcoord-atom-vector-plan.md) | `MolCoord` の原子プール (`std::map<int, MolAtomPtr>` + 検索用の索引 vector) を、所有も持つ vector に置き換える案。互換 `AtomIter`、見込み (メモリ 5-6% 減) と着手時の確認事項 | **未実装 / 今後の課題**。GRO 読み込み高速化 (`perf/gro-load`) では索引の併設までで止めた |
| [pymconsole-research-260529.md](pymconsole-research-260529.md) | PyMOL コマンド言語に部分互換な「pym console」導入の調査報告 (着手前の調査記録) | §4 の写像総表は 260928 の候補の出どころとして有効。§0 の embedded Python パーサ / C++ 新 API は不採用 (TS 実装)。実装済みの仕様は `../architecture/console-pymol-dialect.md` |
| [261011-op-console-backlog-plan.md](261011-op-console-backlog-plan.md) | op / console / MCP の未実装項目の一覧: Action pane・マクロ・記録の対応表の拡充、op になっていない service、MCP の resource / introspection、console 本体の残り | **未実装 (候補の一覧)**。実装済みの仕様は `../architecture/op-catalog.md` ほか |
| [260928-pymconsole-remaining-plan.md](260928-pymconsole-remaining-plan.md) | console の PyMOL dialect に残ったコマンドの候補: MD trajectory 系 (`load_traj`・`intra_fit`・`smooth`・`split_states` など)、picking 依存、重量級アルゴリズム、既存コマンドの小改善 | **未着手 / 後日**。実装済みの仕様は `../architecture/console-pymol-dialect.md` |

## 実装済み (旧ルールで残っているもの)

以前は実装済みの plan を履歴として残していた。以下はその名残で、触るときに仕様を architecture 側へ移してから削除する。

| ファイル | 内容 | 実装の所在 |
|---|---|---|
| [261010-ui-layout-inspect-plan.md](261010-ui-layout-inspect-plan.md) | Playwright `_electron` による UI レイアウトの自己検証ツール (実装中に Claude が使う。pin した表示との比較による回帰テストはしない) | `tritium/react-gui/e2e/`、`src/renderer/shell/E2eBridge.tsx`、`task inspect_tritium_ui`。仕様は `../architecture/ui-layout-inspect.md` |
| [261005-hover-highlight-retention-plan.md](261005-hover-highlight-retention-plan.md) | 3D view の hover highlight / チップをボタン押下 (クリック) では消さず、押下点から 2px 以上のドラッグ (C++ の drag start 判定と同じ) でのみ消す | `tritium/react-gui/src/renderer/features/molview/useHoverInfoHandler.ts` |
| [260917-camera-pane-plan.md](260917-camera-pane-plan.md) | 名前付き camera を scene tree の枝から独立した Camera pane に移し、View activity view (Camera pane + View pane) を新設。並べ替えを Camera の `ui_order` (nopersist) で持ち qsc の要素順として保存、新規作成時の既存名は上書き、save/apply の with show/hide 版をツールバーに | `tritium/react-gui/src/renderer/features/camera/` と `src/qsys/Camera.{hpp,cpp,qif}` / `Scene.cpp`。[`../architecture/camera-pane.md`](../architecture/camera-pane.md) |
| [260913-mdtools-plugin-plan.md](260913-mdtools-plugin-plan.md) | mdtools (MD trajectory) の GUI -- 開くフロー・Trajectory bottom tab・worker service -- を built-in plugin `mdtools` (既定オフ) へ切り出し。C++ module は常時ロードのままで GUI だけを gate する割り切り、morph service の分離、メニュー anchor の付け替え | `tritium/react-gui/src/plugins/mdtools/`。[`../architecture/md-trajectory-open-dialog.md`](../architecture/md-trajectory-open-dialog.md) |
| [260913-ai-agent-ai-sdk-plan.md](260913-ai-agent-ai-sdk-plan.md) | AI agent plugin の LLM 層を Vercel AI SDK (`ai` v7) へ載せ替え、OpenAI と Anthropic を `provider:model` で切り替え可能に。あわせて prompt history (↑/↓ でのシェル風呼び出し) を追加 | `tritium/react-gui/src/plugins/agent/` の `shared/modelSpec.ts` / `worker/modelProvider.ts` / `renderer/promptHistory.ts` ほか |
| [260912-ai-agent-plugin-plan.md](260912-ai-agent-plugin-plan.md) | 上記を tritium の plugin 機構に載せ替えた再計画。agent の内部設計はそのまま、置き場所と core への到達経路を plugin 化し、必要な受け皿 (push channel レーン / plugin prefs / settings 寄与点 / 汎用 secrets IPC / undo-redo lock) を汎用の plugin API として足す | `tritium/react-gui/src/plugins/agent/`。[`../architecture/ai-agent-plugin.md`](../architecture/ai-agent-plugin.md) |
| [260911-ai-agent-prompt-panel-plan.md](260911-ai-agent-prompt-panel-plan.md) | AI agent prompt panel の最初の計画 (core 直書き版)。調査結果と設計判断はここが初出 | **260912 に置き換え**。agent の内部設計は有効だが、配置は plugin 化された |
| [anim-panel-timeline-plan.md](anim-panel-timeline-plan.md) | AnimationPanel を Blender 風タイムラインへ再構築する移行計画 (`docs/migration/` から移設) | ADR-0029 (anim panel migration complete)。`features/animation/` |
| [260602-inspector-reset-ui-plan-prompt.md](260602-inspector-reset-ui-plan-prompt.md) | Inspector の per-property reset UI (計画作成の依頼書) | `features/inspector/` の `onResetValue` / `onResetAll` |
| [260717-cpk-coord-texture-direct-update-plan.md](260717-cpk-coord-texture-direct-update-plan.md) | CPK renderer の座標テクスチャ direct update (Phase 1) と MD trajectory (Phase 2) の位置づけ | Phase 1: PR #441 |
| [260718-compiler-warnings-cleanup-plan.md](260718-compiler-warnings-cleanup-plan.md) | libcuemol2 のコンパイラ警告の整理・削減 | PR #440 |
| [260718-line-cyl-coord-texture-direct-update-phase3-plan.md](260718-line-cyl-coord-texture-direct-update-phase3-plan.md) | 線・円柱系レンダラの座標テクスチャ direct update (Phase 3) | PR #443 |
| [260718-md-trajectory-phase2-plan.md](260718-md-trajectory-phase2-plan.md) | MD trajectory (DCD) の realtime 表示 (Phase 2) | `src/modules/mdtools/`、`Trajectory` / `DCDTrajReader` |
| [260719-md-trajectory-bottom-pane-plan.md](260719-md-trajectory-bottom-pane-plan.md) | MD trajectory bottom pane の undo/redo (Phase D) | PR #448 ほか。`../architecture/md-trajectory-bottom-pane.md` (Phase D-1 まで実装済み) |
| [260720-animmgr-state-restore-plan.md](260720-animmgr-state-restore-plan.md) | AnimMgr のアニメ前プロパティ保存/復元 (movie rendering の前提) | ADR-0040 decision (3) |
| [260720-movie-rendering-plan.md](260720-movie-rendering-plan.md) | Rendering window の Still/Animation モード (movie rendering) | ADR-0040 decision (1) |
| [amber_reader_planning_instructions.md](amber_reader_planning_instructions.md) | AMBER トポロジ/座標リーダー (計画作成の指示書) | `AmberPrmtopReader` / `AmberNetCDFReader` |
| [create_buffer_260521.md](create_buffer_260521.md) | WebGL2 の GPU buffer 生成から C++ -> V8 memcpy を除く | commit `1a25c878` (GpuPrim buffer alloc を DisplayContext 経由に) |
| [gro_reader_planning_brief.md](gro_reader_planning_brief.md) | GROMACS `.gro` リーダー (計画作成の指示書) | `GROFileReader` |
| [IMPLEMENT_SelectionBuilder.md](IMPLEMENT_SelectionBuilder.md) | Selection Builder (selection syntax 補助 UI) の実装指示書 | `h3-kit/selection/`、`__test__/SelectionBuilder.test.tsx` |
| [raytrace-rendering-ui-plan.md](raytrace-rendering-ui-plan.md) | レイトレーシングレンダリング UI (案 C) の実装計画 (着手前ドラフト) | 最終形は独立した Rendering window。ADR-0017 / ADR-0035 |
| [rendering-ui-plan.md](rendering-ui-plan.md) | 上記計画を作らせるための指示書 | 同上 |
| [selection-builder-plan-instruction.md](selection-builder-plan-instruction.md) | Selection Builder の計画作成の指示書 | 同上 (`IMPLEMENT_SelectionBuilder.md` の前段) |
| [specs-260427-async-core-wrapper-md-load-sequential-moon.md](specs-260427-async-core-wrapper-md-load-sequential-moon.md) | core 呼び出しの再設計 (worker-side service modules) | `renderer/worker/server/services/` |
| [viewport-tools-phase1-2.md](viewport-tools-phase1-2.md) | Viewport tool system (Phase 1 & 2) | `contexts/ActiveToolContext.tsx`、`__test__/viewportTools.test.ts` |
