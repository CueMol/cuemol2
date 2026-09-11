# Implementation plans

実装計画・計画作成の依頼書・着手前の調査記録の置き場。

**このディレクトリは「まだ実装されていないもの」と「実装に至るまでの経緯」を持つ。**
実装が済んだ仕様の説明は [`../architecture/`](../architecture/_index.md) 側に置く
(architecture は現在のコードの spec として読めることを保証する)。UXP -> tritium の
移植判断は [`../migration/adr/`](../migration/adr/_index.md)。

プランが実装されたとき、本書のプランは**履歴として残す** (削除しない)。仕様の説明が
必要なら architecture 側に別途書き起こし、下表の状態を「実装済み」に更新する。

新規ファイルの命名は `YYMMDD-<slug>-plan.md` (例: `260908-tritium-plugin-system-plan.md`)。

---

## 現役 (未実装)

| ファイル | 内容 | 状態 |
|---|---|---|
| [260911-ai-agent-prompt-panel-plan.md](260911-ai-agent-prompt-panel-plan.md) | AI agent prompt panel (自然言語の指示から LLM が既存 worker service を呼ぶチャット UI)。OpenAI Responses API、worker 内 agent loop、1 指示 = 1 undo txn、tool カタログ 19 本、左 side pane の新 activity view、API キーの safeStorage 保管。P0-P5 | **未実装**。実装は 1 行も入っていない |
| [260908-tritium-plugin-system-plan.md](260908-tritium-plugin-system-plan.md) | tritium の plugin システム (JS/TS + C++ 両レーン)。VSCode 拡張機構の調査、C++ 登録機構の seam、packaging と配置、Phase 0/A/A'/B/C | **未実装**。実装は 1 行も入っていない |
| [umbreon-process-isolation-plan.md](umbreon-process-isolation-plan.md) | umbreon GI(OIDN) の大確保が Chromium PartitionAlloc で crash する件と、恒久対策としての process 分離 (mmap zero-copy) | **未実装 / 当面着手しない**。§2 の原因究明は確定した調査結果。着手条件は crash が実害になったとき |
| [pymconsole-research-260529.md](pymconsole-research-260529.md) | PyMOL コマンド言語に部分互換な「pym console」導入の調査報告 | **調査のみ**。planning / 実装とも未着手 |

## 実装済み (履歴)

| ファイル | 内容 | 実装の所在 |
|---|---|---|
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
