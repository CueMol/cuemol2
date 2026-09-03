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

- [react-gui 大規模リファクタリング (2026-08)](react-gui-refactoring.md)
  (日本語) -- 移行完了後の構造作り替えの設計記録。動機 (churn が 4 つのハブ
  ファイルに集中していた) と、採用した判断 (feature ディレクトリ / hook は
  所有者と同居 / context 3 分割 / `CommandRegistry` 一本化 / Inspector の
  schema 化 / service フォルダの seam は call graph で決める)、採らなかった
  案とその理由、分割で分かったこと。
- [react-gui のレイヤと import 規則](react-gui-layering.md) (日本語) --
  main / renderer / Web Worker の 3 スレッドをまたぐ import 境界、`h3-kit`
  (デザインシステム) がアプリケーションを import しない規則と barrel 経由の
  アクセス、`hooks/react` と `hooks/cuemol` の分け方、テストの配置。
  `eslint.config.mjs` が強制しており、flat config の「後のブロックが rule
  options を上書きする」落とし穴もここに記録している。
- [C++ Scripting Bridge](cpp-scripting-bridge.md) -- metaclass macros
  (`MC_DYNCLASS` / `MC_SCRIPTABLE`), the `getClassObj` vs
  `getScrClassObj` contract, and what external script bridges (UXP
  XPCOM, tritium N-API) must do to wrap native objects.
- [Object Reader Content Sniff](objreader-content-sniff.md) -- the
  tri-state `canHandleContent` contract, the escalating byte-budget
  mechanism (64 KiB, x8 for readers the budget cut off, up to a
  ceiling), and the text / binary implementation patterns shared by
  every reader.
- [Linux (X11) sysdep and the CLI build configuration](x11-sysdep-build.md) --
  why the `Xgl*` backend no longer compiles, and why Linux now builds the
  CLI configuration (`BUILD_OPENGL_SYSDEP=FALSE`, `TTYView` factory) instead
  of stopping in `sysdep`; the `ENABLE_X11_SYSDEP` escape hatch for the port,
  and why tritium (which brings its own `ElecView`) is unaffected.
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
- [Umbreon GI 時の照明エネルギー配分](umbreon-gi-lighting-balance.md) (日本語) --
  GI 有効時に POV radiosity の配分をそのまま使うと白く平坦になる原因 (umbreon は
  ambient を材質の diffuse 係数で受ける) と、開放面の輝度を GI off に揃える parity 制約から
  決めた配分。`lightIntensity` / `flashFraction` / `ambientFraction` を POV backend と同じ
  意味の exporter property として露出し、render window では Lights グループ (全方式共通の
  Light intensity / Flash fraction) と GI lighting axis (raytrace 一致から headlight をほぼ
  無くすまでの 5 段、明るさ一定) と勾配 sky で操作する。C++ は auto フォールバックのみ。
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
- [メニューショートカットの所有者を OS ごとに 1 つにする](keyboard-shortcuts.md) (日本語) --
  Windows で scene tree の Ctrl+C/V が効かなかった原因 (Blink が Ctrl+X/C/V/A を消費し、
  Win/Linux ではメニュー accelerator まで届かない) と、macOS は native menu、Win/Linux は
  renderer の keydown dispatcher (`shell/keybindings`) がショートカットを所有し両者が
  `dispatchMenuChannel` に合流する構成。隠しメニューから accelerator を外す判断、
  enabled / modal ゲートの再現、採らなかった案 (`before-input-event`、全 OS renderer 所有)。
- [ObjProxyBridge `_objSlot` ownership and lifetime](objslot-ownership.md) --
  the worker-side object bridge's slot ownership rules and when a slot may be
  released, from the renderer/worker refactoring work.
- [MeshMS SES Surface Backend](meshms-ses-backend.md) (日本語) --
  SES 生成バックエンドを外部 static lib MeshMS へ (ENABLE_MESHMS、BALL は
  フォールバックとして併存)。umbreon 1:1 のビルド配線、density → mesh_size
  変換、例外時 BALL フォールバック、RSCache による density 変更時の再生成
  高速化、MeshMS 側の多成分/孤立原子対応、atom_id → MSVert::info 見送りの判断。
- [Cryo-EM map mode](cryo-em-map-mode.md) (日本語) --
  density map の結晶学 / cryo-EM モード分離。`DensityMap.map_type` (読込時自動判定) と
  `MapRenderer.region_mode` (box / full) の 2 層モデル、PBC 適格条件の一本化、MRC2014 ORIGIN、
  full モードの budget 由来 stride (ChimeraX `limit_voxels` 流) とノード整列、却下案とロードマップ
  (chunk メモリ、reader streaming、zoom 連動 refine)。
- [Renderer identity: the `name` default and name-based group membership](renderer-group-identity.md) --
  why `name` carries a declared default that a bare `setName()` never clears
  (a locked "default" name in the inspector; the name dropped on save), why
  group membership keyed on the group's name orphans members on any rename
  path without a cascade and makes a nameless group scan every ungrouped
  renderer, and the compatible direction (run-time UID resolution, names kept
  on the wire). Records what the tritium guard covers and what it does not.
- [Surface scalar colouring: `ScalarColorSupport` and `DirectSurfRendererBase`](surface-scalar-coloring.md) --
  the potential ramp and multi-gradient colouring shared by `molsurf`,
  `dsurface` and `dsurf2`: the non-scriptable mixin that owns the scalar
  colouring properties and their evaluation, the abstract scriptable base
  the direct surface pair now derives from (one display-list path, one
  per-vertex resolver that also feeds dsurf2's GPU primitive), the
  contracts (unresolved vertex = `defaultcolor`, separate per-mode target
  names, `setupParentData("multi_grad")` placement, `target` kept as an
  inert string) and the test map.
- [Scene app data と render 設定の scene 保存](scene-app-data.md) (日本語) --
  Rendering window の設定を `.qsc` に保存する仕組み。`Scene` の汎用 typed app-data store
  (`<appdata id= type=>`、class 未登録なら verbatim 温存) と QIF class `RenderSettings`
  (common + backend ごとの子ブロック) をスキーマにした tolerant な読み込み、qif の `default` を既定値の
  唯一の原典にして明示的に変えた値だけを保存する方針、property 変更を undo/redo と scene event
  (`sceneAppDataChanged`) に載せる `SceneAppData` 基底、入れ子 property の落とし穴と「子 wrapper 経由で
  書く」規約、属性値の改行エスケープ修正、tritium 側の書き込みトリガー (編集 / レンダー開始 /
  「Use settings」のみ) と loop guard、別の app data を足す手順。
