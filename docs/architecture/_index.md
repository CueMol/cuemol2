# Architecture documents

Cross-cutting design notes for the C++ libcuemol2 core. One file per
topic. Topics here cover contracts and invariants that span multiple
modules and that are not obvious from any single header.

- [C++ Scripting Bridge](cpp-scripting-bridge.md) -- metaclass macros
  (`MC_DYNCLASS` / `MC_SCRIPTABLE`), the `getClassObj` vs
  `getScrClassObj` contract, and what external script bridges (UXP
  XPCOM, tritium N-API) must do to wrap native objects.
- [Object Reader Content Sniff](objreader-content-sniff.md) -- the
  tri-state `canHandleContent` contract, the byte-cap mechanism, and
  the text / binary implementation patterns shared by every reader.
- [GTAO Screen-Space AO](gtao-screen-space-ao.md) (日本語) -- リアルタイム
  GTAO のパイプライン、projection 由来の view-space 復元と GL 座標系、MRT
  geometry 法線、Apple Metal-GL の MRT/ブレンドのハマりどころ、tritium
  (WebGL2) / WebGPU 移植時の注意点。
- [MD Trajectory Open Dialog (tritium)](md-trajectory-open-dialog.md) (日本語) --
  MD trajectory を tritium から開く新規機能の設計。block-centric `Trajectory` を worker から
  scriptable API のみで組み立てる `loadTrajectory` service、renderer cancel = 全 transaction
  キャンセルに合わせた 2 段 deferred-load フロー、`DIALOG_PICK_PATH` の複数選択拡張、
  `OpenMdTrajDialog` の構成とスコープ (gro のみ / 再生 UI 別タスク)。migration ではない。
- [MD Trajectory Bottom Pane (tritium)](md-trajectory-bottom-pane.md) (日本語) --
  ロード済み Trajectory を再生・シークし block セグメントを可視化する bottom pane の設計。
  Trajectory に再生エンジンが無いため JS タイマー駆動 (Animation の C++ AnimMgr との差)、
  block 列挙のための `.qif` getter 追加 (`nblock`/`getBlock`/`TrajBlock.nframe`/`start_index`)、
  event type 連番 (bitmask 不可) を踏まえた atomsMoved の扱い、△ playhead の scrub、
  Phase C (remove/reorder = C++ 新規メソッド前提) の切り分け。
- [umbreon の Electron メモリ制約と process 分離設計](umbreon-process-isolation.md)
  (日本語) -- tritium で umbreon GI(OIDN) が大解像度で crash する既知問題の根本原因
  (Chromium PartitionAlloc の OOM crash, OS 制限ではない)、検討した各対策と却下理由、
  恒久対策 (umbreon を別プロセス化し Scene を mmap file で zero-copy 渡し /
  Boost.Interprocess `managed_mapped_file` + Boost.Process) の設計方針と次ステップ。
  macOS の shm 上限が低いため mapped file 必須。renderer worker 内の大確保一般に共通する制約。

