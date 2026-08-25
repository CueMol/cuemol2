# Architecture documents

Cross-cutting design notes for libcuemol2 (C++) and the tritium app. One
file per topic. Topics here cover contracts and invariants that span
multiple modules and that are not obvious from any single header, plus
the design records for features and infrastructure that are **not** part
of the UXP -> tritium migration.

Migration decisions live in [`../migration/adr/`](../migration/adr/_index.md)
and are numbered `ADR-NNNN`; documents here are named after their topic
instead. If a change ports a UXP surface it belongs there; if it adds
something UXP never had, or concerns build / packaging / internal
architecture, it belongs here.

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
- [Umbreon GI — pt2 integrator を明示 pin](umbreon-pt2-integrator.md) (日本語) --
  indirect GI integrator を libcuemol2 側から `giIntegrator = 2` に明示 pin する判断。
  `UMBREON_GIT_REF=main` が浮動 ref のため、既定値追従だと umbreon が pt3 を既定に
  昇格した時点で絵が黙って変わる。UI/`.qif` には露出しない理由、GI オン時に metal 材質の
  反射が背景色から実ジオメトリに変わる影響、principled BSDF material 採用を見送った理由、
  umbreon 側 API doc が古くヘッダを SSOT とすべき点。
- [umbreon group-alpha blend](umbreon-group-alpha-blend.md) -- section 透過
  (group alpha) を多重パスで合成する際の不変条件: パスの重みは単位分割
  (合計ちょうど 1) でなければならず、合計が 1 を超えたときに背景係数が**負に
  なるのが正しい**。umbreon 側でこれを 0 にクランプしていたため、blend group に
  属さない不透明 geometry が `sum(a)` 倍されて白飛びしていた (CueMol/umbreon#66)。
  blendpng の `solvebeta` + 逐次 lerp との対応、POV-Ray で再現しない理由
  (`blendTab` の alpha 量子化と `>= 0.95` 不透明扱い)、半透明 group どうしが
  重なる場合に残るオーバーシュートの限界。
- [umbreon (NPR) hatch layer editor と shading knob](umbreon-hatch-layer-editor.md) (日本語) --
  Rendering window の NPR backend で hatch style をテンプレートとして C++ から読み込み、layer
  構成 (太さ・密度・randomness) と shading (Strength / Curve) を編集してレンダーする設計。
  Rendering window は worker を持たないため main 経由の 3 チャンネルリレー、dirty のときだけ
  spec テキストを snapshot に載せる判断、form-kit による UI 構成、契約行一覧、制約と今後。
- [umbreon の Electron メモリ制約と process 分離設計](umbreon-process-isolation.md)
  (日本語) -- tritium で umbreon GI(OIDN) が大解像度で crash する既知問題の根本原因
  (Chromium PartitionAlloc の OOM crash, OS 制限ではない)、検討した各対策と却下理由、
  恒久対策 (umbreon を別プロセス化し Scene を mmap file で zero-copy 渡し /
  Boost.Interprocess `managed_mapped_file` + Boost.Process) の設計方針と次ステップ。
  macOS の shm 上限が低いため mapped file 必須。renderer worker 内の大確保一般に共通する制約。
- [umbreon レンダリングが renderer プロセスの darwinbg 降格で数倍遅くなる](umbreon-render-qos-throttling.md)
  (日本語) -- 「一旦遅くなると設定を変えても遅いまま、再起動で直る」報告の原因調査。
  macOS の task policy 実験で、renderer プロセスが darwinbg (background task
  policy) に落ちたまま解除されないケースが 6 倍級の遅化を再現・維持できると特定
  (umbreon 側のスレッド/TBB バグではない)。renderer プロセス内からの自己修復は
  原理的に不可能なため、対策は Electron main プロセス側 (renderer backgrounding
  の無効化、powerSaveBlocker、外部からの taskpolicy 解除) に限られる。
- [tritium packaging / release-build renovation](tritium-packaging-renovation.md)
  (日本語) -- tritium を配布可能な形にするまでの設計記録。electron-builder による
  3 OS パッケージング、libcuemol2 ランタイムの staging、release-cadence gating、
  tag -> GitHub Release の配線、Electron 33->42 更新。署名 / notarization (Phase 4) は未了。
- [リリース成果物が自分の OS と役割を名乗る](release-artifact-identity.md) (日本語) --
  installer のファイル名とアイコンの規約。単一 `artifactName` テンプレートの `${arch}` が
  ターゲットごとに別表記へ展開されるため、1 リリースが 2 機種向けに 4 語の arch を出し、
  OS 名も「本体かインストーラか」も読めなかった。per-target 命名への移行と、Phosphor の
  `BoxArrowDown` を使ったインストーラ専用アイコン。バッジ案 / NSIS 同梱アイコン案の却下理由も記録。
- [Copy&Paste を OS クリップボードへ](os-clipboard-interop.md) (日本語) --
  scene ノードと paint 行の clipboard を worker 内 singleton から OS クリップボードへ移す設計。
  UXP 版 CueMol2 との相互運用と、将来 tritium を複数起動したときのインスタンス間 copy&paste が
  目的。macOS では Gecko がカスタム flavor を pasteboard に出さないという発見と、
  そこから決まった 2 フォーマット構成 (legacy native / text envelope)。
- [Cmd+C / X / V をフォーカス文脈で振り分ける](focus-aware-edit-shortcuts.md) (日本語) --
  同じキーがテキスト欄・scene tree・paint deck で別の意味を持つようにする routing の設計。
  Electron の clipboard role では表現できない理由 (macOS はメニューの key equivalent が
  web content より先にキーを取る)、Win/Linux の React メニューが DOM フォーカスを奪う問題、
  および「テキスト欄で Cmd+Z が scene undo を走らせる」既存バグの修正。
- [ObjProxyBridge `_objSlot` ownership and lifetime](objslot-ownership.md) --
  the worker-side object bridge's slot ownership rules and when a slot may be
  released, from the renderer/worker refactoring work.
- [MeshMS SES Surface Backend](meshms-ses-backend.md) (日本語) --
  SES 生成バックエンドを外部 static lib MeshMS へ (ENABLE_MESHMS、BALL は
  フォールバックとして併存)。umbreon 1:1 のビルド配線、density → mesh_size
  変換、例外時 BALL フォールバック、RSCache による density 変更時の再生成
  高速化、MeshMS 側の多成分/孤立原子対応、atom_id → MSVert::info 見送りの判断。
