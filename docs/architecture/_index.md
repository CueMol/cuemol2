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

