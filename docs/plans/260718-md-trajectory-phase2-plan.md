# 実装計画: MD Trajectory realtime 表示 (Phase 2)

## 0. 位置づけと前提

Phase 1 (CPK, PR #441) と Phase 3 (line/cylinder: `SelectionRenderer` / `TraceRenderer` / `BallStickRenderer` / `SimpleRenderer`, PR #443) の完了で、**座標変化 (`atomsMoved`) 時にジオメトリを再構築せず座標テクスチャの再アップロードだけで済むレンダラが揃った**。

Phase 2 の目的は **MD trajectory (DCD) の realtime 表示**である。DCD トラジェクトリを読み込み → `Trajectory` オブジェクト → フレーム再生 → 既存の座標テクスチャ direct update で高速描画、までを繋ぐ。

設計判断は CPK plan (`docs/plans/260717-cpk-coord-texture-direct-update-plan.md`) の §3.8 / §8.4 / §9 を継承し、本計画で詳細化する。参照実装は `/Users/user1/proj64/cuemol2_png` (branch `dev201608`) にあるが、**§3.8 の方針でそのまま移植せず削減する**。

**重要な前提 (Phase 1/3 が効く)**: 既存の移植済みレンダラは `objectChanged` で `OBE_CHANGED` + `descr=="atomsMoved"` を捕捉し、ダーティ化 → `display()` で `updateCoordTex()` 1 回、という高速経路を持つ。したがって **Trajectory がフレーム更新時に `fireAtomsMoved()` を発火すれば、レンダラを一切変更せずに realtime 描画が成立する**(§3.2)。Phase 2 の主作業はデータ層(I/O + AnimMol + Trajectory + reader + AnimMgr 配線)であり、レンダラ改修は MVP に不要。

---

## 0.5. 実装結果 (MVP 完了・2026-07-18)

`feature/md-trajectory-phase2` で **2a/2b(AnimMol)/2c を実装し、実データ(gmx.gro 113961 原子 + 1001-frame DCD, 1.37GB)を `.qsc` でロード → coord-texture SimpleRenderer で full-frame 再生**まで end-to-end 動作確認。gtest 1185 全 pass。

**計画から変えた点(develop の現実装に合わせた/実装で判明)**:

1. **DCDTrajReader はブロック中心** (`createDefaultObj → TrajBlock`、1 DCD=1 block、`Trajectory::append` は外部)。当初の Trajectory 中心・内部複数ブロック分割は `.qsc` の `<trajfiles>/<trajfile>`(=block-centric)serialize と非互換だったため revert。2GB 単一 alloc 対策はフレーム単位チャンク(TrajBlock)だけで達成される。
2. **`.qsc` ロード順序**: `procDataSrcLoad` は子(DCD block)を親(GRO topology)より先にロードするため、DCD 読込時に topology が 0 原子。→ DCD 読込を **topology 非依存**化(未ロード時は DCD 自身の natom + identity load-all、NATOM 検証は topology がある時のみ + `append` の getCrdSize で担保)。
3. **遅延 setup()**: GRO reader は `Trajectory::setup()` を呼ばないので、`getAllAtomSize`/`getSelIndexArray` で topology 到達後に自動実行。
4. **遅延 finalize**: develop の `qsys::Object` は `SceneEventListener` ではなく `sceneChanged(ONLOADED)` フックが無い(dev2016 との差)。→ `setFrame`/`getFrameSize` 初回アクセスで `updateTrajBlockDataImpl` を実行。
5. **frame count off-by-one 修正**: kept 数は `ceil(nfile/nevery)`(frame 0 を含む)。floor だと 1 block 分不足で `getCrdArray` 範囲外 → SIGSEGV(参照実装も同じ floor バグ)。
6. **PSF は保留**: PSF は trajectory ではなく、develop の `PsfReader` は coordinate reader 併用前提のヘルパ。専用 PSF ObjReader は要設計。GRO topology で代替(GROFileReader を Trajectory に attach)。

**保留(今後実装)**:
- **厳密な 1-frame/vsync ベンチ**: AnimMgr は wall-clock でフレームを飛ばす(遅いと frame drop して同じ時間で再生)。ベンチには rAF tick ごとに `dynframe++` する frame カウントベースの harness が必要(`ViewLoopController` に追加、`PERF_MEASURE` と併用)。MVP では MolAnim の `length = nframes/target_fps`(秒)で近似。
- **lazy loading**: develop の `InStream` に portable な seek が無い(`FileInStream` のみ int で 2GB 制限)ため eager のみ。seekable stream 抽象の導入が前提。
- **MorphMol の AnimMol 再親子化**、**readsel(部分ロード)**、**frame_aver_size 検証**、**§2.3 の dynamic events / 共有テクスチャ (2e)**。

テスト用データ + `.qsc`: `~/tmp/260718_cm3_traj/`(`gmx.gro`, `*.dcd`, `test_gro_traj*.qsc`)。

---

## 1. 全体像と依存関係

```
[I/O 層 (mdtools, 純 I/O / gtest 検証)]
  FortBinStream ─────────────────────────┐   (qlib::BinInStream 派生, 完全独立)
  TrajBlock (data container: qsys::Object)│   フレーム毎 float[natom*3] + cell + loaded flag
       ▲ loads-via                        │
  TrajBlockReader (qsys::ObjReader, 抽象) ─┘   loadFrm() 純粋仮想 + lazy + targTrajUID
       ▲ extends
  DCDTrajReader ──── createDefaultObj → TrajBlock / seek 遅延ロード

[molstr 層]
  MolCoord ─▶ AnimMol (削減版: CrdArray 抽象 + AID↔index map)
                 ▲ extends              ▲ extends
              MorphMol (再親子化)     Trajectory (mdtools)

[mdtools 層]
  Trajectory : AnimMol ── std::deque<TrajBlockPtr> ── update(frame) → 座標書込 + fireAtomsMoved
  PsfTrajReader : ObjReader ── createDefaultObj → Trajectory (topology を構築)

[qsys 層]
  AnimMgr ── frame プロパティを PropAnim で駆動 (MorphMol と同じ経路)
  既存の座標テクスチャ renderer (CPK2/Simple/Selection/Trace/BallStick) ── 無変更で追従
```

**入口の流れ**: `.psf` を `PsfTrajReader` で読み `Trajectory`(topology のみ)を生成 → `.dcd` を `DCDTrajReader` で同じ `Trajectory` に coord frame (TrajBlock) として流し込む → `AnimMgr` が `frame` を駆動 → `Trajectory::update()` が現フレーム座標を書いて `fireAtomsMoved()` → 移植済みレンダラが高速追従。

---

## 2. 参照実装マップ (dev201608)

### 2.1 I/O 層 (mdtools)

| クラス | 基底 | 行数(hpp+cpp) | 役割 | 独立性 |
|---|---|---|---|---|
| `FortBinStream` (`FortBinInStream`) | `qlib::BinInStream` | 83+88 | DCD の Fortran unformatted record `[int32 len][payload][int32 len]` を読む。`getRecordSize` / `getRecordSize_throw` / `readRecord` / `checkRec`。 | **完全独立・純 I/O** |
| `TrajBlock` | `qsys::Object` | 180+111 | フレーム毎 `Array<PosArray*>`(x,y,z interleaved, `natom*3`)+ cell(6/frame)+ loaded flag。`allocate` / `getCrdArray(ifrm)` / `getCellArray(ifrm)` / `setLoaded` / `load(ifrm)`(遅延ロードトリガ)。 | 容器部はほぼ独立 |
| `TrajBlockReader` | `qsys::ObjReader` | (TrajBlock.hpp 同居) | 抽象基底。純粋仮想 `loadFrm(ifrm, TrajBlock*)`、lazy flag、`m_nTrajUID`、`getTargTraj()`(`SceneManager::getObjectS` で解決)。 | Trajectory/SceneManager に依存 |
| `DCDTrajReader` | `TrajBlockReader` | 93+441 | `createDefaultObj → TrajBlock`。`readHeader`(84B CORD ヘッダ + NATOM 検証)/`readBody`(全フレーム or lazy 登録)/`loadFrm`(固定 stride seek で 1 フレーム)。 | Trajectory の atom/sel に依存 |

**遅延ロード**: `readBody` が lazy かつ seekable なら `pTB->setTrajLoader(this)` + `m_nHeadPos` 記録のみで返る。以降 `TrajBlock::load(ifrm)` → `loadFrm` が `npos = m_nHeadPos + nfrmsz*istep` を seek して 1 フレーム読む(DCD はレコード固定長なのでオフセット算術が厳密)。

### 2.2 AnimMol (molstr) — 削減対象

参照: `AnimMol : public MolCoord, public qlib::TimerListener`(hpp 121 / cpp 210)。型別名 `CrdIndexMap = unordered_map<int,quint32>`(AID→index)、`AidIndexMap = vector<quint32>`(index→AID)。

| 要素 | keep/drop | 備考 |
|---|---|---|
| `getCrdArrayImpl() = 0` | **KEEP** | 派生が `vector<float> m_crdarray` を所有 |
| `createIndexMapImpl(idx,aid) = 0` | **KEEP** | 派生が両 map を構築(`MolArrayMap` 順) |
| `m_indmap` / `m_aidmap` | **KEEP** | AID↔CrdArray index |
| `getCrdArrayInd(aid)` / `getAtomIDByArrayInd(idx)` | **KEEP** | レンダラの build 時 index 解決・色更新で使用 |
| `getAtomCrdArray()` | **KEEP** | 同期済み float* を返すホット経路 |
| `crdArrayChanged()` | **KEEP(簡略)** | 「配列が新しい」印。§3.1 参照 |
| `m_nValidFlag`(tri-state)+ `getCrdValidFlag` 経由の MolAtom ルーティング | **DROP** | §3.1: 二重表現を入れない。`getPos()` ホット経路を汚さない |
| `getAtomCrd` / `setAtomCrd` | **DROP** | 上記二重表現専用。呼び出し元は `MolAtom.cpp` の 2 箇所のみ |
| `TimerListener` 継承 + self-anim 一式(`m_bSelfAnim`/`setSelfAnim`/`startSelfAnim`/`stopSelfAnim`/`getSelfAnimLen`/`onTimer`/`unloading`/qif `self_anim`) | **DROP** | develop は `AnimMgr` が `frame` を駆動。self-anim 不要 |

注: 参照には**変更シリアルが無い**(freshness は tri-state flag のみ)。develop の `MolCoord` に `CRD_*_VALID` 定数は無い(確認済み)。GL テクスチャは AnimMol でなく**レンダラ所有**(参照 `GLSLCPK3Renderer::m_pCoordTex`)。

### 2.3 現行 develop の統合ポイント (確認済み)

- `ObjectEvent`(`src/qsys/ObjectEvent.hpp:23-24`): `OBE_CHANGED=2` / `OBE_PROPCHG=3` のみ。`OBE_CHANGED_DYNAMIC(=4)` / `OBE_CHANGED_FIXDYN(=5)` は**無い**。
- `DispCacheRenderer::objectChanged`(`src/qsys/DispCacheRenderer.cpp:71-86`): `OBE_CHANGED` のみ処理。dynamic を足すなら基底のこの分岐修正が必須(§9.5)。
- `MorphMol : molstr::MolCoord`(`src/modules/anim/MorphMol.hpp:46`)。`m_id2aid`(CrdArray index→AID)を既に保持。`update()`(`.cpp:464-528`)は `pAtom->setPos` + `fireAtomsMoved()`。
- `MolCoord::fireAtomsMoved()`(`MolCoord.hpp:239`)→ `OBE_CHANGED` "atomsMoved"。`getCrdArray()`(`:314`)は QDF/scripting 用シリアライズで本件と無関係。
- mdtools 登録(`src/modules/mdtools/mdtools.cpp:30-32`, `mdtools.moddef`): `registReader<GROFileReader>()` / `registWriter<NAMDCoorReader>()`。**develop の慣習は `registReader`**(参照の all-`registWriter` は参照側の癖)。`Trajectory`/`TrajBlock`/`DCDTrajReader`/`FortBinStream`/`AnimMol` は develop に**未移植**。
- `PsfReader`(develop): `ObjReader` ですらない素のヘルパ(`attach`+`read`)。→ 薄い `PsfTrajReader` を新設(§9.4)。
- 前提基底クラスは develop に存在確認済み: `qlib::BinInStream` / `qlib::Array` / `qlib::TimerListener` / `qsys::ObjReader` / `StreamManager::registReader`。
- reader gtest 前例: `src/tests/modules/importers/test_grofilereader.cpp` / `test_amber_reader.cpp`。

---

## 3. 設計判断

### 3.1 AnimMol は §3.8 の削減版 (write-both, 二重表現なし) — 採用

reduced `AnimMol : public MolCoord`(`TimerListener` を外す)。`getCrdArrayImpl` / `createIndexMapImpl`(純粋仮想)+ index map + `getCrdArrayInd` / `getAtomIDByArrayInd` / `getAtomCrdArray` を残す。

**`getPos()` ホット経路を汚す tri-state validity flag ルーティングは入れない**。代わりに派生の `update()` が **CrdArray と MolAtom の両方に書く**(下記)。これにより `MolAtom::getPos()` は従来どおり `m_pos` を返すだけで、selection/測定/`getCenter()` 等の超ホット経路にコストが乗らない。ゼロコピー(`getCrdArrayImpl` が TrajBlock 生ポインタを返す)が必要になった段階で flag と MolAtom フックを**追加的に**入れられる(インターフェース不変)。

`crdArrayChanged()` は「CrdArray が MolAtom より新しい」印だが、write-both では両者常に一致するので、印はレンダラ/テクスチャ側の「再アップロード要否」の判定材料(§3.3 の serial)に置き換える。

### 3.2 フレーム更新イベントは MVP では `fireAtomsMoved` (OBE_CHANGED) — 採用

`Trajectory::update()` は `fireAtomsMoved()`(`OBE_CHANGED` "atomsMoved")を発火する。これで:
- 移植済みレンダラ(CPK2/Simple/Selection/Trace/BallStick)は既存の atomsMoved 高速経路(ダーティ→`updateCoordTex`)で追従。**レンダラ改修ゼロ**。
- 未移植レンダラは `DispCacheRenderer` 既定の全 invalidate(遅いが正しい)。

`OBE_CHANGED_DYNAMIC` / `OBE_CHANGED_FIXDYN` の導入(enum 追加 + `DispCacheRenderer` 既定分岐修正 + `MolRenderer` 高速経路, §9.5)は**最適化として 2e に後回し**。MVP には不要。

### 3.3 座標テクスチャ所有権は MVP ではレンダラ所有のまま — 採用

Phase 1/3 のとおりレンダラが `m_pCoordTex` を所有。MVP は「1 分子に複数レンダラ → 同座標を複数枚アップロード」の非効率を許容する。

§9.3 の「AnimMol が 1 枚を所有しレンダラは bind + index 属性のみ」は **2e に後回し**。理由: **AnimMol は `DisplayContext` を持たない data object** であり、GL テクスチャ生成/更新には pdc が要る。共有テクスチャ化するなら「最初に draw したレンダラが pdc 付きで lazy 生成 → AnimMol に保持 → 単調増加 serial で他レンダラは今フレーム再アップロード済みか判定」という機構が要り、intricate。MVP のリスクから切り離す。

### 3.4 レンダラの座標取得元 (getPos → getAtomCrdArray) — 任意最適化 (2e)

移植済みレンダラは現状 `pAtom->getPos()` で gather する。AnimMol 導入後は `getAtomCrdArray()`(共有 CPU 配列)+ index map から gather に替えると、原子毎の仮想 `getPos` を省ける(小さな利得)。MVP では不要、2e で共有テクスチャ化と同時に検討。

### 3.5 移植しないもの

- `XTCTrajReader`: 参照でも `readHeader`/`readBody`/`loadFrm` が空スタブ。`.xtc`/`.trr` は将来課題(vendored xdrfile / chemfiles)。
- `FortBinStream` の endianness: 参照は native byte order のみ(swap 無効)。DCD は通常ホスト endian なので MVP は native 前提。異 endian 対応は既知の制限(§7)。

---

## 4. sub-phase 構成

各 sub-phase で実装・検証・コミット(Phase 1/3 と同じ checkpoint 方式)。**2a-2c は gtest のみで検証でき GUI ビルド待ちが不要**。

| sub-phase | 内容 | 検証 | GUI ビルド |
|---|---|---|---|
| **2a** | I/O 層: `FortBinStream` + `TrajBlock`(+`TrajBlockReader`) + `DCDTrajReader` | gtest(合成 DCD で record/frame/seek) | **不要** |
| **2b** | `AnimMol`(削減版) を molstr に新設 + `MorphMol` を AnimMol 派生に再親子化 | gtest(index map / getCrdArrayInd)+ MorphMol 回帰(既存シーン) | 2b は最小(再親子化の回帰は GUI 目視が望ましい) |
| **2c** | `Trajectory`(mdtools) : AnimMol + `PsfTrajReader` 入口 | gtest(PSF+DCD ロード→ frame 数 / 現フレーム座標マッピング) | 不要 |
| **2d** | `AnimMgr` 再生配線 + GUI 検証(realtime DCD 再生) | GUI 目視(CPK/stick で DCD 再生が座標テクスチャ経由・再構築なし) | **必要** |
| **2e** | (任意/後段) `OBE_CHANGED_DYNAMIC` + AnimMol 所有 1 枚共有テクスチャ + serial + レンダラ CrdArray source 化 | GUI + perf | 必要 |

MVP = 2a→2b→2c→2d。2e は性能が問題になった段階で。

---

## 5. 実装手順

### Step 2a: I/O 層 (gtest, ビルド待ちなし)

1. `FortBinStream.{hpp,cpp}` を移植(参照はほぼそのまま)。`qlib::BinInStream` 派生。
2. `TrajBlock.{hpp,cpp,qif}` を移植。`qsys::Object` 派生。**`TrajBlockReader`(抽象)の同居を維持するか分離するか判断**: 参照は同居(TrajBlock.hpp 内)。分離すると TrajBlock 容器が SceneManager 依存を切れて gtest しやすい。まず参照どおり同居で移植し、gtest で困れば分離を検討。
3. `DCDTrajReader.{hpp,cpp,qif}` を移植。`TrajBlockReader` 派生、`createDefaultObj → TrajBlock`。
4. mdtools 登録: `mdtools.moddef` に `TrajBlock; DCDTrajReader;`(+ 後で `Trajectory; PsfTrajReader;`)、`mdtools.cpp` に `registReader<DCDTrajReader>()`。`.qif` の wrapper は build 時生成。`CMakeLists.txt` に新規 `.cpp` を追加。
5. **gtest**: 合成 DCD(小さな CORD ヘッダ + 数フレーム)を作り、`FortBinStream` の record 読み、`DCDTrajReader` の header 解析・frame 数・座標値・seek 遅延ロードを検証。`test_grofilereader.cpp` を雛形に(`SetUp()` で `qsys::init(sysconfig.xml)`)。lazy_load + nevery>1 の相互作用(§7 gotcha)もケース化。

*注*: `DCDTrajReader` は `Trajectory::getAllAtomSize()` 等を使うので、2a 完結には最小限の `Trajectory` スタブか、2c を待つ設計にする。**推奨**: 2a では `TrajBlock` 単体 + `FortBinStream` を gtest 完結させ、`DCDTrajReader` の全経路検証は `Trajectory` が入る 2c と合流させる(header 解析部だけ 2a で単体テスト可)。

### Step 2b: AnimMol (削減版) + MorphMol 再親子化

1. `src/modules/molstr/AnimMol.{hpp,cpp,qif}` を新設(§3.1 の keep のみ)。`getCrdArrayImpl`/`createIndexMapImpl` 純粋仮想、`m_indmap`/`m_aidmap`、`getCrdArrayInd`/`getAtomIDByArrayInd`/`getAtomCrdArray`。`molstr.moddef` / `CMakeLists.txt` / `molstr.hpp`(smartptr 宣言)登録。
2. `MorphMol : MolCoord` → `MorphMol : AnimMol` に再親子化。`getCrdArrayImpl`(`m_crdarray` 所有)/`createIndexMapImpl`(既存 `m_id2aid` を土台に AID↔index)を実装。self-anim override は元々無いので追加不要。
3. `MorphMol::update()` は現状 `setPos` + `fireAtomsMoved`。write-both として **CrdArray にも書く**(`getAtomCrdArray()` に補間結果を書いてから setPos、あるいは setPos ループと同時)。ただし MVP でレンダラが getPos 経由なら CrdArray 書込は 2e まで no-op でも可 — **まず既存挙動を壊さないことを優先**し、CrdArray 書込は getCrdArrayInd を使うレンダラを入れる 2e で有効化。
4. **gtest**: AnimMol の index map(getCrdArrayInd/getAtomIDByArrayInd の往復)を検証。**回帰**: 既存 MorphMol テストシーンで再生が従来どおり動くこと(再親子化でデグレしないこと)。

### Step 2c: Trajectory + PsfTrajReader

1. `src/modules/mdtools/Trajectory.{hpp,cpp,qif}` を新設。`molstr::AnimMol` 派生。`std::deque<TrajBlockPtr> m_blocks`、`append`/`findBlk`、`getCrdArrayImpl`(現フレーム→ block coord、frame_aver は後回し可)、`createIndexMapImpl`、`update(iframe)`(現フレーム座標を **MolAtom に setPos + CrdArray に書き** → `fireAtomsMoved`)、`setup`/`setupSel`。プロパティ `frame`/`nframe`(`frame_aver_size`/`dynframe` は後回し可)。self-anim(`onTimer` 等)は**外す**。
2. `PsfTrajReader.{hpp,cpp,qif}` を新設(§9.4)。`ObjReader` 派生、`createDefaultObj → Trajectory`。`read()` は develop の素の `PsfReader` ヘルパを `attach(traj)` + `read(ins)` で使い、`traj->applyTopology(false)` + `traj->setup()`。`readsel` 部分読みは最初は省略。
3. mdtools 登録に `Trajectory` / `PsfTrajReader` を追加。`DCDTrajReader` の `targTrajUID` 経由で PSF 由来 Trajectory に DCD を流し込めることを確認。
4. **gtest**: PSF(topology)+ DCD(coord)をロードし、`Trajectory` の atom 数一致、`nframe`、`update(k)` 後の代表原子座標が k フレーム目と一致することを検証。

### Step 2d: AnimMgr 再生 + GUI 検証

1. `AnimMgr`(`src/qsys/anim/`)が `frame` プロパティを `PropAnim` で駆動する経路を確認(MorphMol 前例)。`Trajectory` が同じ `frame` プロパティ + `update()` を持てば追加配線は最小のはず — **実装時に MorphMol の再生配線と対照して確認**。
2. tritium で PSF+DCD を読み、CPK/stick を付けて再生。**確認**: (a) 座標テクスチャ経由で更新され `renderCoordTexImpl` が毎フレーム走らない、(b) realtime に動く、(c) fireAtomsMoved 経由で移植済みレンダラが追従。
3. native はビルドのみ。

### Step 2e (任意・後段): dynamic events + 共有テクスチャ + serial

必要になったら着手:
1. `OBE_CHANGED_DYNAMIC=4` / `OBE_CHANGED_FIXDYN=5` を `ObjectEvent` に追加し、`DispCacheRenderer::objectChanged` 既定を「3 種を同一視して invalidate」に修正(§9.5, 未移植レンダラが黙って無視しないため必須)。`Trajectory::update(bDyn)` で `fireAtomsMovedDynamic()` を使い分け。
2. AnimMol に単調増加 serial を追加。座標テクスチャを AnimMol 所有に移し(最初に draw したレンダラが pdc 付きで lazy 生成)、serial 比較で 1 フレーム 1 回のアップロードに収束(§3.3)。
3. レンダラを `getAtomCrdArray()` + index map source に切替(§3.4)。

---

## 6. 検証

- **2a-2c**: gtest(`task run_gtest`)。合成 DCD / 小 PSF を fixture 化。`SetUp()` で `qsys::init(sysconfig.xml)`(pre-install: `<topdir>/data/sysconfig.xml`)。不必要に類似テストを量産せず、record 境界・frame seek・topology 一致・frame→座標マッピングという仕様を pin する結合テストを主軸に。
- **2b 回帰**: 既存 MorphMol シーンが再親子化後も従来どおり再生(デグレ検出)。
- **2d**: tritium(release)で DCD 再生を目視。`renderCoordTexImpl` が初期化時のみ・再生中に出ないこと(ログ確認)。native は `task build_libcuemol2` が通ること(目視なし)。
- **不変条件**: `MolAtom::getPos()` ホット経路に validity-flag 分岐を足していないこと。既存移植済みレンダラ(CPK2/Simple/Selection/Trace/BallStick)を MVP で変更していないこと。

---

## 7. 既知の制限 / gotchas

1. **endianness**: `FortBinStream` は native byte order のみ(参照が swap を無効化)。異 endian の DCD は MVP 非対応。必要時に `BinInStream` の swap mode を有効化。
2. **lazy_load + nevery>1**: 参照 `readBody` は `nread=m_nfile/m_nSkip`・`allocate(natom,nread)`、`loadFrm` は `istep=ifrm*m_nSkip`。両者の frame index 対応を移植時に検証(組合せで壊れやすい)。
3. **変更シリアル不在**: 参照 AnimMol に serial は無い(tri-state flag のみ)。共有テクスチャ化(2e)で単調増加 serial を**新規追加**する(移植でなく設計)。
4. **AnimMol に GL 無し**: テクスチャ生成/更新には `DisplayContext` が要る。共有テクスチャ化(2e)は「最初に draw したレンダラが lazy 生成」で回避する。MVP はレンダラ所有のまま。
5. **`TrajBlockReader` の結合**: `TrajBlock.hpp` 同居の reader 基底が `Trajectory`+`SceneManager` に依存。gtest 容易化のため容器と reader の分離を検討可(まず参照どおり同居)。
6. **PsfReader の形**: develop の `PsfReader` は `ObjReader` でない素のヘルパ。薄い `PsfTrajReader` で包む(§9.4)。`readsel`(部分読み)は最初省略。
7. **worker 内大確保**: `docs/architecture/umbreon-process-isolation.md` の PartitionAlloc OOM。トラジェクトリ全体を worker 内に置く場合は要検討(遅延ロードで緩和)。
8. **登録方式**: develop 慣習の `registReader<>()` を使う(参照の all-`registWriter` を踏襲しない)。

---

## 8. 変更しないファイル (重要)

- `MolAtom.{hpp,cpp}` の `getPos()` 経路 — validity-flag フックを足さない(§3.1)。
- 既存移植済みレンダラ(`CPK2Renderer` / `SimpleRenderer*` / `SelectionRenderer` / `TraceRenderer` / `BallStickRenderer`)— MVP(2a-2d)では無変更。座標取得元切替と共有テクスチャは 2e。
- Phase 1/3 のプリミティブ(`SphereIdxGpuPrim` / `LineIdxGpuPrim` / `LineValIdxGpuPrim` / `CylinderIdxGpuPrim`)/ シェーダ / `FloatDataTexture` — 無変更。
- `ObjectEvent` / `DispCacheRenderer` — MVP では無変更(dynamic event は 2e)。

---

## 9. 参照

### 本リポジトリ (develop)

- `docs/plans/260717-cpk-coord-texture-direct-update-plan.md` — Phase 1 と §3.8/§8.4/§9(Phase 2 方針の元)。
- `docs/plans/260718-line-cyl-coord-texture-direct-update-phase3-plan.md` — Phase 3(移植済みレンダラの atomsMoved 高速経路)。
- `src/qsys/ObjectEvent.hpp` / `src/qsys/DispCacheRenderer.cpp` — イベント型と既定 objectChanged。
- `src/modules/anim/MorphMol.{hpp,cpp}` — AnimMol 再親子化と update() の前例。
- `src/qsys/anim/AnimMgr.{hpp,cpp}` — frame 駆動(PropAnim)。
- `src/modules/mdtools/{mdtools.cpp,mdtools.moddef,PsfReader.*}` — 登録と PSF ヘルパ。
- `src/tests/modules/importers/test_grofilereader.cpp` — reader gtest 前例。

### 参照実装 (`/Users/user1/proj64/cuemol2_png`, dev201608)

- `src/modules/molstr/AnimMol.{hpp,cpp,qif}` — CrdArray 抽象(削減元)。
- `src/modules/mdtools/{FortBinStream,TrajBlock,DCDTrajReader,Trajectory,PsfReader}.*` — I/O + Trajectory 移植元。`XTCTrajReader` は移植しない(スタブ)。
- `src/modules/molvis/GLSLCPK3Renderer.{hpp,cpp}` — `updateDynamicGLSL()`(2e の座標取得元切替の原型)。
- `src/qsys/DispCacheRenderer.cpp` / `src/modules/molstr/MolRenderer.cpp` — dynamic event の既定/高速経路(2e)。

参照ブランチ確認: `cd /Users/user1/proj64/cuemol2_png && git branch --show-current` → `dev201608`。
