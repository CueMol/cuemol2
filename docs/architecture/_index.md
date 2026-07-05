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
- [umbreon の Electron メモリ制約と process 分離設計](umbreon-process-isolation.md)
  (日本語) -- tritium で umbreon GI(OIDN) が大解像度で crash する既知問題の根本原因
  (Chromium PartitionAlloc の OOM crash, OS 制限ではない)、検討した各対策と却下理由、
  恒久対策 (umbreon を別プロセス化し Scene を mmap file で zero-copy 渡し /
  Boost.Interprocess `managed_mapped_file` + Boost.Process) の設計方針と次ステップ。
  macOS の shm 上限が低いため mapped file 必須。renderer worker 内の大確保一般に共通する制約。

