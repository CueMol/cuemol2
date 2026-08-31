# Cryo-EM map mode (日本語)

density map 系 (`src/modules/xtal/`) に cryo-EM map 向けの表示モードを追加した設計記録。
X 線結晶学向けの既存挙動 (周期境界・`center ± extent` の box 表示・buffer 制限) は
既定値をそのまま残し、EM map と判定されたときだけ「非周期・全域・LoD」に切り替える。
UXP には無かった機能なので migration ADR ではなくここに置く。

## 背景

- 周期境界 (PBC) は renderer 側 (`getDen()` / `getMap()` の剰余) に実装され、適格条件が
  「格納ブロックが unit cell 全体を覆う && `use_pbc`」だった。EM map は cell == box なので
  条件を満たしてしまい、`center ± extent` が box 端を越えると反対側の密度が折り返して描かれた
- 表示範囲が常に `center ± min(extent, max_grids * grid / 2)` の立方体で、map 全域を出せない。
  全域を full resolution で出すと marching cubes (MC) のポリゴン数が爆発する
- MRC2014 の `ORIGIN` (word 50-52) を読まず `getOrigin()` が常に 0 で、fitted model と map がずれた

## モードモデル

「map の性質」と「表示ポリシー」を分離し、実効値は描画時に解決する。

| 層 | プロパティ | 値 | 意味 |
|---|---|---|---|
| `DensityMap` | `map_type` (enum, 永続化) | `auto` / `xtal` / `em` | data の性質。`auto` は reader の自動判定結果 |
| `DensityMap` | `map_type_resolved` (string, readonly) | `"xtal"` / `"em"` | 実効値 (GUI 用) |
| `DensityMap` | `origin` (Vector, readonly) | | MRC ORIGIN (Å)。結晶 map は 0 |
| `MapRenderer` | `region_mode` (enum, 永続化) | `auto` / `box` / `full` | 表示範囲。`auto` → map が `em` なら `full`、それ以外は `box` |
| `MapRenderer` | `region_mode_resolved` (string, readonly) | `"box"` / `"full"` | 実効値 (GUI 用) |
| `MapRenderer` | `use_pbc` (既存) | bool | 意味不変 |
| `MapSurfRenderer` | `lod` (enum) | `auto` / `step1` / `step2` / `step4` / `step8` | MC の stride。`auto`: box では `binning`、full では budget から決定 |
| `MapSurfRenderer` | `lod_budget` (integer) | 既定 16 (Mcell) | full モードの MC セル数上限 (ChimeraX `voxel_limit` 相当) |

- **PBC 適格** = `use_pbc && map.isPeriodic() && 格納ブロックが全セル被覆 && region != full`
  (`MapRenderer::isPBCEligible()`)。3 renderer に重複していた判定を 1 箇所にまとめた
  (`gpu_mapmesh` は `use_pbc` 項を落としていたが、これで揃う)
- **実効値の解決は描画時** (`makerange()` 内)。scene 読込は プロパティ → reader (`requestDataLoad`)
  の順なので、set 時に解決すると判定前の値を見てしまう
- **結晶ユーザーが無変更な理由**: 自動判定は既定 `xtal`。Brix / Xplor / MTZ / mmCIF (FFT) / QDF 埋込は
  hint が無いので必ず `xtal` → `box` → 既存 `makerange()` 経路。`lod=auto` は box では `binning`
  (既定 1) に解決するので stride も変わらない
- **旧 `.qsc`**: default 値は XML に書かれない (`LDom2Stream::hasModifiedNodes`) ので新プロパティは
  `auto` で読まれる。外部 CCP4/MRC を参照して EM と判定される旧シーンだけ full+LoD に変わる
  (折返しゴミの修正でもあるので受け入れる。厳密に旧描画が要るなら `map_type=xtal` を指定)

### 却下した代替案

- renderer 単一 enum `mode=xtal|cryoem` — 自動判定を置く場所が無い (renderer はヘッダを見られない)、
  3 renderer で判定が重複、非周期 map の部分切出しが不可
- 別 renderer クラス — MC 経路 1.4k 行の複製、既存 isosurf の切替に renderer 再生成が必要
- `use_pbc` の再解釈 — 部分 map の結晶ユーザーが `false` を既に使っている
- `region_mode` を object 側に置く — 同一 map で contour=box / isosurf=full の使い分けを塞ぐ
- 統計量による EM 判定 — solvent-flatten 済み結晶 map で誤判定。ヘッダ証拠に限定

## 自動判定 (`MapKindDetect.cpp`)

`CCP4MapReader` がヘッダから `MrcHeaderInfo` を組み立てて `detectMapKind()` を呼ぶ。I/O から分離した
純関数なので gtest で表として検証している。保守的で、既定は `xtal`:

```
strong EM : ISPG == 0 || ISPG >= 401 (volume stack)
strong EM : ORIGIN が有効かつ非零 (finite, |v| < 1e6)
strong EM : label に EMDataBank / EMDB / RELION / cryoSPARC / EMAN / IMOD / MotionCor
moderate  : ISPG == 1 && NVERSION >= 20140 && 角 90 && NC==NX && NR==NY && NS==NZ && start == 0
otherwise : XTAL
```

追加で読むヘッダ: word 27 `EXTTYP`, word 28 `NVERSION`, word 50-52 `ORIGIN`, word 56 `NLABL` と
label 10 x 80 (従来は `skip` していた)。

### ORIGIN

非零の `ORIGIN` は「grid index (0,0,0) の絶対座標」として `DensityMap::m_vOrigin` に入れ、
start index は 0 扱い (両方非零なら警告、ChimeraX と同じ規則)。適用箇所:

- `convToOrth()` (fracToOrth の後・xformMat の前に `+origin`)、`getValueAt()` / `isInRange()`
  (orthToFrac の前に `-origin`)、`fitView()`
- renderer の transform (`setupXformMat` 系): `translate(origin)` を orthmat の前に。結晶 map は 0 なので
  display list は同一 (ゼロなら translate を省く)

同時に `DensityMap::getCenter()` の `(start + n) / 2` → `start + n / 2` を修正した
(`NXSTART != 0` の map で中心がずれていた)。

## full モードと LoD (`MapSurfRenderer`)

`makerange()` の冒頭で実効 region が `full` なら `makerangeFull()` に分岐する。既存の box 経路は
PBC 判定の置換と `m_nStep` の設定以外は触っていない。

`makerangeFull()` (`MapRenderer::computeFullRegion()` で region と stride を決めてから整列する):
1. region = 格納ブロック全体 (絶対セル格子 index) を、**パディング済み view box** (下記) と
   molecule boundary の bbox ± `bndry_rng` で切り取る。view box がブロックと交差しなければブロック全体
2. stride `s` = 明示 `lod`、または `lodStepForBudget()` (ChimeraX `limit_voxels`): **その region の**
   セル数が `lod_budget << 20` を超える間 `s *= 2` (等方・2 の冪、上限 64)。16 Mcell 既定で全域なら
   256³ → 1、300³ / 512³ → 2、1024³ → 4。region が小さいほど stride が下がる
3. `lodAlignRange()`: サンプルノードを **ブロック start 基準で s の倍数に整列**
   (ChimeraX `step_aligned_region`)。region を動かしても同じノードを踏むので、隣接 region 間で面が連続する。
   span はブロック最後の整列ノードを越えない (どのキューブもブロック外を読まない)
4. `m_bPBC = false`、`m_bCapDisplay = true` (表示経路でも region 境界を閉じる = ChimeraX `cap_faces`)

### zoom 連動 refine (`zoom_refine`, 既定 true)

ChimeraX には camera 連動の LoD は無く (region は手動 crop / zone / `step` コマンド)、「region が小さいほど
step が細かい」という決定則だけを借りた。本実装は **view の可視範囲から region を自動導出**する。
ロジックは `MapRenderer` 基底に置き (`lod` / `lod_budget` / `zoom_refine` プロパティ、view box、
built region、`computeFullRegion()` / `worldBoxToGrid()` / `updateViewRegion()` / timer)、isosurf /
contour / gpu_mapmesh の 3 renderer が共有する。各 renderer は full モードの `viewChanged()` を
`handleFullModeViewEvent()` に委譲し、range を組んだら `setCurRegion()` で報告する:

- `handleFullModeViewEvent()` は `"zoom"` / `"setCamera"` / `"center"` (drag は `dragupdate` 時のみ) /
  `VWE_SIZECHG` を受け、`center` は `setCenterQuiet()` で無効化せずに追従させ、
  view box = `center ± 0.5 * zoom * max(1, aspect)` (`View::getZoom()` は表示高さ [Å]、奥行きも同じ)
  を `setViewBox()` に入れて 150 ms の one-shot timer (`qlib::TimerListener`,
  `EventManager::setTimerMilliSec`; 同一 listener の再登録は置換) を張る
- timer 満了で `updateViewRegion()`: (1) 新しい view box で計算した stride が現 region の stride より細かければ
  再構築 (zoom-in の細密化)、(2) それ以外は **パディング無しの view box** が現 region (1.5 倍パディング) に
  収まっていれば何もしない、はみ出せば再構築。zoom-out で fresh stride が粗くなっても、view が region 内なら
  画面上の細かい面をそのまま使う (ヒステリシス)。view が map 外に出たときも現状維持
- 再構築は `invalidateGeomCache()` → 次フレームの `display()` で `makerangeFull()` から作り直す。
  `worldBoxToGrid()` は 8 corner を逆 xform → `-origin` → orthToFrac → ×interval して AABB を取るので
  非直交セルでも動く (逆行列の丸めで node 境界が 2.9999999 になるため 1e-4 の epsilon で外側に丸める)
- gtest では TimerImpl が無く `setTimer` は無視されるので、テストは `setViewBox()` → `updateViewRegion()` を直接呼ぶ
- **不変条件**: mesh cache の頂点は range 始点相対の cell-grid 座標で、`setupXformMat` が
  `translate(m_nStCol, ...)` を掛ける。したがって `setupMolBndry()` / `makerange()` は **mesh cache を作り直す
  ときだけ** 呼ぶ (`render()` / `display()` の `!m_bMeshCacheValid` 分岐)。色のみの無効化 (alpha / color /
  coloring) で range を再計算すると、ヒステリシスで再構築を見送った後の view box から別の range が出て、
  古い cache とずれる (透明度変更で表示範囲が壊れる不具合の原因)。`max_grids` も range を変えるので
  `invalidateGeomCache()` する

MC カーネル (`runMarchingCubes` / `marchCubeCell` / `getGrdNorm2`) は `m_nBinFac` の代わりに作業変数
`m_nStep` を使う。stride > 1 のみに効く 2 つの修正を同時に入れた:

- 末尾キューブ判定 `ix+1 >= colNo` → `ix+m_nStep >= colNo` (従来は範囲外を `getDen() → 0` で読んで
  ブロック端に偽の面を切れた)
- 法線を「±1 ノード」から「±stride」の中央差分に (粗い面に ±1 微分は高周波ノイズ)

`generateSurfObj()` は表示と同じ region / stride を使う。`extent` / `max_grids` / `maxExtent` は
full では無視。`center` は view に追従するが (`setCenterQuiet`)、full では region を決めない
(box モードに切り替えたときの中心として残る)。

### contour / gpu_mapmesh

両 renderer とも full モードでは isosurf と同じ `MapRenderer::computeFullRegion()` で **view box /
boundary で切り取った region を budget 由来の stride で** 表示し、zoom 連動 refine も共有する。
`lod` / `lod_budget` / `zoom_refine` は `MapRenderer.qif` の共通プロパティ (名前は hoist 前と同じなので
`.qsc` 互換)。contour だけ `MapMeshRenderer.qif` で `lod_budget` の既定を 2 Mcell に上書きする
(線分を cell ごとに描くので isosurf より小さい)、gpu_mapmesh は 16 Mcell。

- `MapMeshRenderer::generateFull()`: `computeFullRegion()` の region を `lodAlignRange` で整列し、
  `ScalarObject::extractBlockBytes()` で strided block に取り出して crossing 配列 (足りなければ
  `ensureCrossArraySize` で拡張) を埋める。描画側は `translate(m_nSt*)` の後に `scale(m_nStep)` を掛ける。
  display list しか持たないので、`updateViewRegion()` の `invalidateGeomCache()` = display cache 破棄で
  次フレームに再生成される
- `GLSLMapMeshRenderer2::make3DTexMapFull()`: 同じ region/stride で voxel block を GPU に上げる
  (`extractBlockBytes` で取り出すだけなので再構築は軽い)。box モードの `maxExtent` は hardcode 100 ではなく
  `bufsize` から出す。voxel block は `MapBufTex` が **R8 の 2D lookup texture** (`gfx::DataTexture`;
  linear index を幅 4096 の row-major に巻く) として upload し、vertex shader (`mapmesh2_vert.glsl`) は
  `textureSize()` / `texelFetch` で参照する。以前の buffer texture (`usamplerBuffer`) は WebGL2 / GLSL ES 3.00
  に無く、tritium (`ElecDisplayContext` は `BufTexRep` 未実装) では shader が compile できず何も描けなかった。
  data texture は immutable なので region が変わるたびに作り直す
- **gpu_mapmesh は新規作成の選択肢に出さない** (線幅が固定で、CPU の contour より遅い)。renderer 種別リストを
  作る 3 つの worker service (file-open の renderer type / New renderer dialog / Change type メニュー) が
  `helpers/rendererFilter.ts` の `isLegacyRendererType()` で除外する。C++ の登録は残すので、過去の `.qsc` に
  含まれる gpu_mapmesh は従来どおり読み込まれ・描画され・Inspector / Density map pane で操作できる
- `extractBlock` / `extractBlockBytes` (`ScalarObject` 既定 = `atFloat/atByte` 走査; `DensityMap` は行ポインタ +
  LUT + TBB): map-local index の strided sub-block を連続配列にコピー。範囲外は PBC なら剰余で wrap、
  そうでなければ fill

## GUI (tritium)

- `inspector/MapRendererCommon.tsx` の `RegionLodRows`: "Region" (`region_mode`)、"Level of detail" (`lod`)、
  "LoD budget" (`lod_budget`; full のみ)、"Refine on zoom" (`zoom_refine`; full のみ)。isosurf / contour の
  両 section で使い、実効値は readonly `region_mode_resolved` から取る。full では box 専用の "Max grid size" /
  "Buffer size" / "Use periodic boundary" を隠す。`gpu_mapmesh` は contour と同じプロパティ集合なので
  `rendererPropSections` の registry で `ContourMainSection` を再利用する (title "GPU contour")
- `DensityMapPane`: `MapRendererState.regionResolved` / `mapType` を追加し、full では Extent スライダを無効化
- **map kind の表示 (2026-09)**: 「auto が何に解決したか」が GUI に出ていなかったので 2 箇所に足した。
  - **object 側 (編集可)**: `schema/densitymap.ts` の "Density map" section (Map type = `map_type`、
    Effective kind = `map_type_resolved`)。`RENDERER_SECTION_REGISTRY` に **object の C++ class 名**
    (`DensityMap`) をキーに登録し、`PropertiesTab.typeSectionsFor` の「object は type page を持たない」
    早期 return を外して registry lookup に通す (`Scene` が既に typeLabel で引かれている前例と同じ形。
    renderer の `type_name` は小文字なので衝突しない)。map kind は data の性質なので object 側が本籍で、
    generic タブの生表からしか触れない状態を解消する
  - **renderer 側 (readonly)**: `MapRenderer` に `map_type_resolved` (readonly string; DensityMap 以外の
    ScalarObject では空文字) を足し、`schema/map.ts` の `MAP_HEAD_ROWS` 先頭に "Map kind" 行を置く。
    Region / LoD 行は map kind が決まってはじめて意味が読めるので、その手前に出す
  - 表示用に row kind `readonlyText` (`rows/ReadonlyTextRow.tsx`) を新設。「解決済みの値」は答えであって
    フィールドではないので、disabled な control ではなく静的テキスト (`.insp-prop-readonly`) にし、
    modified バーも reset も持たせない。空文字なら行ごと落とす (`hideWhenEmpty`)
- **isosurf の既定色 (2026-09)**: `MapSurfRenderer.qif` で `color` の default を `MapRenderer` の青から
  白灰 (0.85) に上書きする (`GLSLMapMeshRenderer` と同じサブクラス上書き pattern)。塗り潰し等値面が飽和した
  青だと形が読めないため。contour (メッシュ) は 2Fo-Fc 慣習の青のまま
- **isosurf の Cap mode (2026-09)**: `cap_mode` (auto/on/off) を `ISOSURF_SECTIONS` に `mappedEnum` 行として
  露出。C++ の enumdef はアルファベット順 (auto/off/on) なので `options` で Auto/On/Off の順に固定する
- file-open ダイアログ (`fopen-opt-dlgs/panes/Ccp4MapOptionsPane.tsx`): "Map type" (auto / crystallographic /
  cryo-EM; reader property ではなく読込後に `obj.map_type` へ書く `applyMapTypeChoice`) と "Subsample"
  (reader の `subsample`)。ダイアログは `probeMapHeader` service (`CCP4MapReader.probeHeader`) でヘッダを
  読み、grid サイズと格納メモリを表示、256 Mvoxel (ChimeraX `voxel_limit_for_open`) を超えると警告と
  推奨 subsample (`suggestSubsample`) を出す
- 読込後 (`loadObject.service.ts` → `services/map/emDefaults.ts`): map が `em` に解決されたら renderer に
  `level = getLevelAtTopFraction(0.01)` (上位 1% を囲む絶対 level、ChimeraX の初期 contour 規則) と
  `use_abslevel = true` を設定する。**view をどうするかは別判断**で、`applyMapCenterPolicy` が
  ダイアログの 3 択 (`auto` / `setMapCenter` / `moveViewCenter`) を解決する (ADR-0057)。
  `auto` は em → `moveViewCenter` (= `DensityMap.fitView`; map renderer の `center` 既定 (0,0,0) は
  ORIGIN 配置の EM map の外にあるため)、それ以外 → `setMapCenter` (= `rend.center = view.getViewCenter()`)

## 既知の非互換 (リリースノート記載事項)

- 外部 CCP4/MRC を参照する旧シーンで EM と判定される map は、box 表示から全域 LoD 表示に変わる
- `binning > 1` の isosurf は末尾キューブ判定と法線 stride の修正で見た目が僅かに変わる
  (pin テスト P2 / P8 の checksum を再取得; 頂点位置は不変)
- `DensityMap::getCenter()` の修正で、`NXSTART != 0` の結晶 map の「object center」が正しい位置になる
- CCP4/MRC の mode 0 (byte) map は他 mode と同じ数値経路で量子化されるため、`atFloat` の値が raw byte
  格納時とは異なる (従来の値は base/step と不整合だった)。header の DMIN/DMAX が有効な file は 1 pass で
  量子化されるので、実 range と header が僅かに違う場合は byte 値が ±1 変わり得る

## メモリ層 (`qlib::ChunkedArray3D`)

- `DensityMap` の格納を `qlib::ByteMap *` (単一 `new T[n]`) から `qlib::ChunkedArray3D<quint8>` (値メンバ) に変更。
  section 軸で 8 MiB 以下の chunk に分割して 1 chunk = 1 割当て。根拠: Electron の PartitionAlloc は
  ~1 MiB 超を direct map にし、単一割当て上限が約 2 GiB なので 1300³ の byte map や 800³ の float 一時
  buffer がそこで落ちる。chunk 内の並びは `Array3D` と同じ (column 最速) なので slice / row は連続領域、
  chunk 数 1 なら byte 互換
- `Array3D` (`ByteMap.hpp`) は `data()` 連続ポインタ契約 (GL texture upload 等) を使う利用者がいるので
  in-place で chunk 化せず、`getSize()`/添字を `size_t` にしただけ。`MapMeshRenderer` の crossing 配列、
  `MapBufTex`、`ElePotMap` は表示部分集合 / 小 map なので据え置き
- reader 向け API: `beginByteMap(ncol,nrow,nsec, MapQuant{base,step})` → `sliceBytes(k)` に section 単位で
  直書き → `endByteMap(min,max,mean,rmsd)`。`setMapFloatArray`/`setMapByteArray` は内部でこれを使う
  (stats ループの算術は `MapSurfPin` の bitwise 保証のため不変)。Brix / QDF reader は temp 配列を廃して直書き、
  QDF writer は `QdfOutStream::writeFxRecords()` (新設) で section 単位に書く (voxel ごとの
  `startRecord/writeInt8/endRecord` を排除)。voxel 数 > 2^31 の map は `defData` の int32 制約を避けて
  MAP2 形式 (下記) に分割する
- 64bit 化: `int ntotal = ncol*nrow*nsect` を `size_t` に (CCP4 / Xplor / QDF / ElePotMap / MapFFT /
  `QdfStream::readFxRecords`)
- histogram: `ScalarObject::getBaseHistogram()` フックを追加し、`DensityMap` は **256-bin の byte histogram
  (無損失)** を chunk 並列で初回要求時に 1 回計算して返す (従来は全 voxel を仮想 `atFloat` で走査し
  `rmsd/1000` 幅の巨大 vector を作っていた)。汎用経路は `qint64` count・bins 上限 65536。
  `invalidateHistogram()` を `beginByteMap/endByteMap` で呼ぶ (再ロードで古い histogram が残る不具合も修正)。
  `getHistogramJSON()` の JSON 契約は不変
- `DensityMap::getLevelAtTopFraction(frac)` (qif 公開): byte histogram から「上位 frac の voxel を囲む level」を返す
  (ChimeraX の初期 contour 規則、EM の初期レベル用)
- 孤児ファイル `DenRealMap.cpp` を削除

## reader streaming と seekable stream

### `qlib::InStream` の random access (`isSeekable` / `tell` / `seekTo`, 64bit)

- `detail::InImpl` に既定 (非対応: false / -1 / false) を置き、`InStream` は `getImpl()` に委譲する。
  `FormatInStream` / `BinInStream` / `CCP4InStream` のような「実装を素通しする adaptor」は元の seek 可否を
  そのまま継承し、間に decoder (gzip / xz / base64) が入ると非 seekable になる
- 実装: `PosixFIOImpl` (`ftello` / `fseeko`、Windows は `_ftelli64` / `_fseeki64`)、`ArrayInImpl` (文字列
  ストリーム)。`FileInStream::getFilePos/setFilePos` は `int` から `qint64` に
- mdtools の trajectory reader (DCD / TRR / XTC / AmberNetCDF) には「portable seekable-stream interface が
  develop に入るまで lazy load を保留」とあり、このインターフェースがその前提になる (lazy load 自体は未実装)

### `CCP4MapReader` の section streaming

旧実装は float 全読み (4 byte/voxel) + ByteMap (1 byte/voxel) でピーク 5 byte/voxel、かつ float 一時 buffer が
単一割当てだった。新実装は section (ncol × nrow) 単位で decode → 変換 → 統計 → 量子化して
`DensityMap::sliceBytes()` に直書きする (ピーク ≈ 1 byte/voxel + 1 section):

- 量子化区間の決定ポリシー (量子化には範囲が先に必要で、gzip は 2 pass できない):
  1. header の DMIN/DMAX/DMEAN が有効 (finite, DMIN < DMAX, DMIN ≤ DMEAN ≤ DMAX) → **1 pass**。
     読了後に実 min/max が区間を `0.5 step` 以上はみ出していれば「header が嘘」なので、seekable なら
     data 先頭に `seekTo` して実 range で読み直し、非 seekable なら警告してクリップ
  2. header stats 無効 + seekable → 統計 pass → `seekTo` → 量子化 pass
  3. 非 seekable (gzip 等) → decode 済み map を `ChunkedArray3D<float>` に buffer → 統計 → 量子化
  reader property `use_header_stats` (既定 true) で 1 を無効化できる
- `truncate_min/max` / `normalize` は値ごとの affine 変換として streaming 中に適用 (header の RMS / mean 基準、
  従来と同じ)。区間も同じ変換を通す
- data mode: 0 (int8/uint8; IMOD スタンプで符号判定)、1 (int16)、2 (float32)、6 (uint16)、12 (fp16、
  手書き変換)。未知 mode は `FileFormatException` (従来は黙って空 map)。**mode 0 は他 mode と同じ数値経路で
  量子化する** (従来は raw byte をそのまま格納し `base=min, step=(max-min)/256` で `atFloat` が整合しなかった)
- 軸置換: `axsect == Z` かつ恒等なら slice への行コピー、それ以外は要素ごとに `rotate()` で散らして書く
  (追加メモリ 0)
- `subsample` (既定 1): 各軸 n 点おきに格納。map 寸法・cell grid・start がすべて n で割り切れることを要求
  (`getColGridSize = a/nx` と start の整合)。`setMapParams(start/n, nx/n)` で grid が n 倍に粗くなる。
  **subsample で捨てた標本は LoD では戻らない**: 格納された map 自体が粗い (例: 768³ を subsample 8 で
  読むと 96³ = 0.86 Mcell) ので budget 内に収まり stride は常に 1、zoom しても細密化しない。
  細部が要るときは subsample を下げて読み直す (ChimeraX の `step` は表示時の間引きなので毎回戻せるが、
  こちらは読込時に捨てるトレードオフ)
- `max_voxels` (既定 0 = 無制限): 格納 voxel 数がこれを超えると割当て前に例外
- `probeHeader(path)` (qif): 1024 byte だけ読み JSON (nc/nr/ns, mode, nvoxels, storage_bytes, ispg, nversion,
  exttyp, origin, dmin/dmax/dmean/rms) を返す。`.gz` は decode して読む。GUI が open 前に大 map の確認や
  subsample 提案を出すための材料 (ChimeraX `voxel_limit_for_open` 相当; ダイアログ自体は未実装)

### QDF 永続化

`hdr` レコードの末尾に `mtype` (int8: 判定された map kind) と `orgx/orgy/orgz` (float32) を追加。
`QdfInStream::endRecord()` は未読フィールドを読み飛ばすので旧バージョンも新ファイルを読める。新 reader は
`isDefined("mtype")` で旧ファイルを判定し、無ければ xtal / origin 0。サンプル本体は
`QdfOutStream::writeFxRecords()` で section 単位に書く。

**MAP2 (voxel 数 > 2^31)**: QDF の data チャンクは record 数が int32 なので、1 チャンクに収まらない map は
file type を `MAP2` にして `bmap` チャンクを **section 単位で複数に分割**する (各チャンク ≤ 2^31 record、
1 section が 2^31 を超える map は例外)。`hdr` の末尾に `nchk` (チャンク数) / `csec` (チャンクあたり section 数)
を MAP2 のときだけ足し、reader は `MAP1` / `MAP2` の両方を受け、MAP2 では `nchk` 個の `bmap` を順に
`sliceBytes()` へ読む。収まる map は従来どおり `MAP1` 1 チャンクで byte 列も不変。旧 CueMol は `MAP2` を
signature 不一致で明示的に拒否する。`QdfDenMapWriter::setChunkLimit()` はテスト用に閾値を下げるフック。

## ロードマップ (未実装)

- mdtools の trajectory reader の lazy frame load (seekable stream interface は用意済み)
- float32 格納 (`MapStorage::Byte8|Float32` の runtime 切替)、file-backed pyramid

## テスト

- `src/tests/modules/xtal/test_mapkind_detect.cpp` — 判定表
- `test_maplod.cpp` — `lodStepForBudget` / `lodAlignRange`
- `test_maprenderer_region.cpp` — map_type / region_mode の解決、PBC 適格、`getCenter()`、origin の座標変換
- `test_ccp4_origin.cpp` — 合成 MRC (1024 byte header + float) で ORIGIN / 判定 / label 読込
- `src/tests/qlib/test_chunked_array3d.cpp` — Layout の 64bit 計算、複数 chunk での `at/row/slice/chunkData` が
  `Array3D` と一致、copy/move/resize
- `test_map_histogram.cpp` — `getHistogramJSON` が直接 rebinning と一致、再ロードで cache 破棄、
  `getLevelAtTopFraction`
- `src/tests/qlib/test_seekable_stream.cpp` — 文字列 / file / 二進 adaptor の seek、gzip は非 seekable
- `test_ccp4map_stream.cpp` — 合成 MRC で全軸順・BE・mode 0/1/6・header stats 無効 (2 pass)・嘘 header
  (seek 再読込)・gzip (buffered)・truncate/normalize・subsample・max_voxels・probeHeader を
  `setMapFloatArray` 参照と全 voxel 比較
- `test_qdfmap_roundtrip.cpp` — QDF 往復でサンプル・統計・配置・map kind・origin が保存される;
  閾値を下げた MAP2 分割 (2+1 section / 1 section ずつ) の往復、section がチャンクに収まらない場合の例外
- `test_map_block_extract.cpp` — `extractBlock/extractBlockBytes` を直接走査と比較 (PBC / clip / stride / 負 start)
- `test_mapmesh_full.cpp` — contour の full モード (budget stride、明示 stride、buffer 拡張、結晶 map は box のまま)
- `test_mapsurf_viewregion.cpp` — 128³ map / budget 1 Mcell で view box の切取り・stride 選択・
  boundary bbox・ヒステリシス (パン / zoom-in / zoom-out / map 外)
- `test_mapmesh_viewregion.cpp` — contour で同じ view 連動 refine (`generate()` の range が view box で
  切り取られ stride 1 になる、ヒステリシス、box モードは無視)、3 renderer が `lod` / `lod_budget` /
  `zoom_refine` を持ち contour の既定 budget が 2 であること
- `test_mapsurf_pin.cpp` — P5 (PBC)、P7 (非零 start)、P8 (奇数サイズ stride 2)、P9 (full == P1)、
  P10 (full step 2 == P2)、P11 (view box で切り取った full region、cap 有り)。step 1 の pin (P1/P3/P4/P5/P7) は無変更
- tritium: `isosurfRendererSection.test.tsx`、`densityMapPanelOpsService.test.ts`、`densityMapPaneWire.test.tsx`、
  `emMapDefaults.test.ts`、`probeMapHeaderService.test.ts`、`applyReaderOptions.test.ts`、
  `mapReaderDefaultsToFormatOptions.test.ts`
