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

`makerangeFull()`:
1. region = 格納ブロック全体 (絶対セル格子 index)。将来 view box / molecule boundary の bbox と交差させる
2. stride `s` = 明示 `lod`、または `lodStepForBudget()` (ChimeraX `limit_voxels`): セル数が
   `lod_budget << 20` を超える間 `s *= 2` (等方・2 の冪、上限 64)。16 Mcell 既定で
   256³ → 1、300³ / 512³ → 2、1024³ → 4
3. `lodAlignRange()`: サンプルノードを **ブロック start 基準で s の倍数に整列**
   (ChimeraX `step_aligned_region`)。region を動かしても同じノードを踏むので、隣接 region 間で面が連続する。
   span はブロック最後の整列ノードを越えない (どのキューブもブロック外を読まない)
4. `m_bPBC = false`、`m_bCapDisplay = true` (表示経路でも region 境界を閉じる = ChimeraX `cap_faces`)

MC カーネル (`runMarchingCubes` / `marchCubeCell` / `getGrdNorm2`) は `m_nBinFac` の代わりに作業変数
`m_nStep` を使う。stride > 1 のみに効く 2 つの修正を同時に入れた:

- 末尾キューブ判定 `ix+1 >= colNo` → `ix+m_nStep >= colNo` (従来は範囲外を `getDen() → 0` で読んで
  ブロック端に偽の面を切れた)
- 法線を「±1 ノード」から「±stride」の中央差分に (粗い面に ±1 微分は高周波ノイズ)

`generateSurfObj()` は表示と同じ region / stride を使う。`extent` / `max_grids` / `maxExtent` は
full では無視、`center` は将来の zoom-crop の中心として残す。

### contour / gpu_mapmesh

現時点では full 非対応: 実効 full でも box 経路を使い、PBC だけ `isPBCEligible()` で抑止する
(EM map で折返しが消える)。`MapMeshRenderer` の固定 `bufsize³` crossing 配列を region/step サイズで
確保し直す追随は後続。

## GUI (tritium)

- `inspector/IsosurfRendererSection.tsx`: "Region" (`region_mode`)、"Level of detail" (`lod`)、
  "LoD budget" (`lod_budget`, full のみ)。実効値は readonly `region_mode_resolved` から取り、full では
  box 専用の "Max grid size" / "Use periodic boundary" を隠す
- `DensityMapPane`: `MapRendererState.regionResolved` / `mapType` を追加し、full では Extent スライダを無効化
- `DensityMap.map_type` は enum なので generic Properties タブで編集できる

## 既知の非互換 (リリースノート記載事項)

- 外部 CCP4/MRC を参照する旧シーンで EM と判定される map は、box 表示から全域 LoD 表示に変わる
- `binning > 1` の isosurf は末尾キューブ判定と法線 stride の修正で見た目が僅かに変わる
  (pin テスト P2 / P8 の checksum を再取得; 頂点位置は不変)
- `DensityMap::getCenter()` の修正で、`NXSTART != 0` の結晶 map の「object center」が正しい位置になる

## ロードマップ (未実装)

1. メモリ層: `qlib::ChunkedArray3D<T>` (k-section 境界 8 MiB chunk; PartitionAlloc の 2 GiB 単一割当て上限対策)、
   64bit 添字、256-bin 無損失 histogram
2. reader streaming: section 単位読込 (ピーク 5 → 1 byte/voxel)、header stats による 1 pass 量子化、
   mode 1/6/12、`subsample`、`probeHeader()` による open 前ガード、`extractBlock()`
3. zoom 連動 refine: view の可視範囲 (`View::getZoom()` = 表示高さ) から region を導出して budget step を再計算
   (ChimeraX には camera 連動 LoD は無く手動 crop; region → step の決定則だけを借りる)、
   `TimerListener` によるデバウンスとヒステリシス、full モードの表示 cap、EM 初期レベル (上位 1% rank)
4. contour / gpu_mapmesh の full 追随、`lod*` の `MapRenderer.qif` への hoist

## テスト

- `src/tests/modules/xtal/test_mapkind_detect.cpp` — 判定表
- `test_maplod.cpp` — `lodStepForBudget` / `lodAlignRange`
- `test_maprenderer_region.cpp` — map_type / region_mode の解決、PBC 適格、`getCenter()`、origin の座標変換
- `test_ccp4_origin.cpp` — 合成 MRC (1024 byte header + float) で ORIGIN / 判定 / label 読込
- `test_mapsurf_pin.cpp` — P5 (PBC)、P7 (非零 start)、P8 (奇数サイズ stride 2)、P9 (full == P1)、
  P10 (full step 2 == P2)。step 1 の pin (P1/P3/P4/P5/P7) は無変更
- tritium: `isosurfRendererSection.test.tsx`、`densityMapPanelOpsService.test.ts`、`densityMapPaneWire.test.tsx`
