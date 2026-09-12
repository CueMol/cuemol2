# Direct surface renderer (`dsurface`): アルゴリズム選択と detail の統一

分子表面を MolSurfObj 経由でなく renderer が直接メッシュ化する `dsurface`
(`surface::DirectSurfRenderer`) の設計記録。3 つのメッシュ生成アルゴリズムを
`surfalgor` enum プロパティで切り替える。旧 `dsurf2` レンダラはこれに統合された。

移行項目ではない (UXP 側に対応する surface が無い内部アーキテクチャ変更)。

## 背景: 2 つのレンダラの統合

統合前は同じプロパティ集合を持つレンダラが 2 つ登録されていた:

| 旧 type 名 | クラス | メッシュ生成 | 描画 |
|---|---|---|---|
| `dsurface` | `DirectSurfRenderer` | vendored EDTSurf (voxel + EDT + marching cubes) | display-list のみ |
| `dsurf2` | `DirectSurfRenderer2` | `DistFieldSurfBuilder` (符号付き距離場 + marching cubes) | GPU (`gfx::TrigGpuPrim`) + display-list fallback |

両者は既に抽象 scriptable 基底 `DirectSurfRendererBase` を共有しており、
プロパティの差は `dsurface` だけが持つ `surfalgor` (値 `edtsurf` と、実装されていない
`msms`) のみだった。つまり「同じ機能の 2 つの実装」が別の type 名で並んでいた状態で、
GUI では新規レンダラ一覧に両方が出て、どちらを選ぶべきか利用者には分からなかった。

統合後は `dsurface` 1 つになり、アルゴリズムは `surfalgor` で選ぶ。GPU 描画経路は
旧 dsurf2 のものを `DirectSurfRenderer` がそのまま引き継ぐので、**どのアルゴリズムでも
GPU 経路で描かれる** (EDTSurf も含む)。

## `surfalgor` プロパティ

`DirectSurfRenderer.qif`:

```
enumdef surfalgor {
  edtsurf = surface::DirectSurfRenderer::DS_EDTSURF;
  distfield = surface::DirectSurfRenderer::DS_DISTFIELD;
  meshms = surface::DirectSurfRenderer::DS_MESHMS;
}
property enum surfalgor => redirect(getSurfAlgor, setSurfAlgor);
default surfalgor = "distfield";
```

| 値 | 実装 | 対応 surftype | 備考 |
|---|---|---|---|
| `edtsurf` | `edtsurf::ProteinSurface` (vendored) | vdw / sas / ses | 統合前の `dsurface` |
| `distfield` | `DistFieldSurfBuilder` | vdw / sas / ses | 統合前の `dsurf2`。**既定** |
| `meshms` | libMeshMS (`<meshms/meshms.hpp>`) | **ses のみ** | `makeSurf` と同じ解析的 SES |

未実装のまま残っていた `msms` 値は削除した。旧シーンに `surfalgor="msms"` があっても
enum 変換が失敗し `LScrObjBase::readFrom2` が catch してログを出すだけなので、
既定値 (`distfield`) で読み込まれる。互換コードは不要。

### meshms のフォールバック

MeshMS は SES 専用で、ビルドオプション `ENABLE_MESHMS` が無いビルドには入らない。
次の場合は `distfield` で描画し、理由を `LOG_DPRINTLN` で 1 行出す
(`MolSurfBuilder::createSESFromArray` の MeshMS -> BALL フォールバックと同じ流儀):

1. `HAVE_MESHMS` が無いビルド
2. `surftype` が `ses` でない (vdw / sas)
3. MeshMS が例外を投げた

**フォールバックしても `surfalgor` プロパティは書き換えない**。ユーザーの選択はそのまま
保持・保存され、MeshMS を持つビルドで開けば MeshMS で描かれる。

## `detail` の意味をアルゴリズム間で揃える

これが統合で一番効く設計点。`detail` は 3 つのアルゴリズムでまったく別の量
(EDTSurf の voxel/Å、距離場のグリッド間隔、MeshMS の目標三角形辺長) に変換されるので、
素直に渡すと**アルゴリズムを切り替えただけでメッシュ密度が数倍変わり、`detail` の既定値
(6) が片方では粗すぎ / 細かすぎになる**。

そこで **EDTSurf の voxel サイズを基準**に置き、他の 2 つを係数で合わせる:

```cpp
// DirectSurfRenderer.cpp
inline double detailToVoxelSize(int detail)     // detail 1 -> 1.00 A, 6 -> 0.50 A, 16 -> 0.25 A
{ return 1.0 / (1.0 + 0.2 * qlib::trunc<int>(detail-1, 0, 99)); }

const double DISTFIELD_SPACING_COEFF = 1.43;   // grid spacing   = voxel size * coeff
const double MESHMS_MESH_SIZE_COEFF  = 1.61;   // mesh_size      = voxel size * coeff
const double DISTFIELD_MIN_SPACING   = 0.15;   // 間隔の下限
const double DISTFIELD_MAX_CELLS     = 64e6;   // グリッド総セル数の上限 (下記)
```

EDTSurf の `fixsf` は「1 Å あたりの voxel 数」なので、その逆数が voxel サイズになる。
統合前の distfield は `1/(1+0.3*detail)` という別式を使っていた (detail 6 で 0.357 Å)。

### 校正の手順と結果

係数は `src/tests/modules/surface/test_dsurf_detail_calib.cpp` で実測して決めた。
これは契約テストではない (閾値が無い) ので `DISABLED_` にしてあり、明示実行する:

```sh
.build_out/build_libcuemol2/src/tests/test_surface \
  --gtest_also_run_disabled_tests --gtest_filter='*DetailCalib*'
```

(`*LargeMoleculeCost*` も同じ filter で走り、大きな分子でのコストを別表で出す)

1CRN (327 原子)、SES、probe 1.4 Å での頂点数比 (対 EDTSurf)。括弧内は所要時間 ms
(Debug ビルド。Release ではグリッド系がもっと速い):

| detail | edtsurf | distfield | meshms | df/edt | ms/edt |
|---|---|---|---|---|---|
| 2 | 2306 (14) | 2270 (22) | 3326 (9) | 0.98 | 1.44 |
| 4 | 4185 (30) | 4080 (39) | 4876 (9) | 0.98 | 1.17 |
| 6 (既定) | 6349 (54) | 6566 (64) | 6615 (10) | 1.03 | 1.04 |
| 10 | 12991 (140) | 12858 (141) | 11768 (14) | 0.99 | 0.91 |
| 16 | 27424 (391) | 26514 (385) | 21375 (23) | 0.97 | 0.78 |
| 24 | 56429 (1099) | 52256 (1060) | 39767 (37) | 0.93 | 0.71 |
| 32 | 94922 (2459) | 86940 (2599) | 63240 (59) | 0.92 | 0.67 |

**既定の detail=6 では 3 者とも約 6400 頂点で 4% 以内に収まる**。係数は既定値付近が
合うように 2..16 の幾何平均で決めてあり、その範囲では distfield 0.99 (0.97-1.03)、
meshms 1.04 (0.78-1.44)。

高 detail 側で meshms が相対的に粗くなる (32 で 0.67) のは原理的なもので、係数の
調整不足ではない: MeshMS は advancing front で解析曲面を直接メッシュ化するので、
頂点数が辺長の -2 乗に厳密には比例しない。既定値を犠牲にしてまで再センタリングは
しない。`meshms-ses-backend.md` の BALL 校正が ±20% 残るのと同じ事情である。

再校正が要るのは MeshMS を更新したときと距離場ビルダーを変えたとき。上のコマンドを
係数 1.0 で 1 度回し、比の幾何平均の平方根を掛けて 1-2 回反復する。

### 大きな分子でのコストとグリッド予算

距離場は密な 3 次元グリッド (`std::vector<float>` + `std::vector<int>` = 8 B/セル) なので、
セル数は detail だけでなく**分子の大きさでも増える**。1CRN を 3x3x3 に複製した
8829 原子・約 100 Å の分子での実測 (Debug ビルド):

| detail | edtsurf | distfield | meshms |
|---|---|---|---|
| 16 | 353333 頂点 (4.7 s) | 716450 頂点 (12.2 s) | 577125 頂点 (1.0 s) |
| 32 | 353539 頂点 (4.7 s) | 952674 頂点 (17.1 s) | 1707480 頂点 (2.6 s) |

読み取れること:

- **EDTSurf は大きな分子では detail が効かなくなる**。`boxlength > 300` で自動的に
  スケールを落とす (`ProteinSurface::initpara`) ため、16 と 32 で頂点数も時間も
  ほぼ同じになる。この上限は EDTSurf 固有で、他の 2 つは追随しない (統合前の dsurf2
  と同じ)。**校正が成り立つのは EDTSurf が頭打ちしない範囲まで**である。
- **MeshMS は大きな分子ほど有利**。グリッドを持たないので detail 32 でも 2.6 s で、
  しかも最も細かいメッシュを返す。高 detail では meshms を選ぶのが素直。
- **distfield は無防備だとメモリが破綻する**。無制限なら detail 32 の 120 Å 級の
  複合体で約 2.85 億セル = 2.3 GB を確保しにいき、worker スレッドを数十秒止める。

そこで `DISTFIELD_MAX_CELLS`(= 6400 万セル、約 512 MB) の予算を設け、収まる中で
最も細かい間隔を二分探索で求める。発火時は必ずログに出す:

```
DirectSurfRend> distfield grid too large for detail 32; coarsening 0.199 -> 0.533 A
```

EDTSurf の `boxlength > 300` と同じ役割の上限で、distfield 側にだけ無かったもの。
予算はセル数で見る (間隔の下限 `DISTFIELD_MIN_SPACING` だけでは分子の大きさに
比例する増加を止められない)。

**要求値から粗くしていく方式にはしない**。刻み幅を決めて要求値から粗くしていくと、
到達点が出発点に依存してしまい、**detail を上げたのに前より粗くなる**ことが起きる
(実際に detail 16 → 0.559 Å、32 → 0.606 Å になった)。分子だけから決まる値を求めれば
上限に達したあとは飽和するだけで、逆転しない。

## メモリ上限 (単一確保 2 GB の壁)

Electron がリンクするアロケータ (PartitionAlloc) は、約 2 GB を超える**単一の**確保に
対して null を返すのではなく**プロセスごと落ちる**。合計使用量は (システムの OOM は
別として) 上限に掛からないので、**守るべきは個々の確保サイズ**である。

このパイプラインの確保はすべて頂点数・面数に比例した連続領域なので、頂点数を抑えれば
全部が収まる。頂点あたりの主な内訳:

| 配列 | バイト/頂点 |
|---|---|
| `m_verts` (`MSVert[]`) | 28 |
| `gfx::Mesh::m_vcols` (`VertCol`、display-list 経路のみ) | 16 |
| `m_faces` (`MSFace[]`、面は頂点の約 2 倍) | 24 |
| MeshMS `verts` / `vnormals` (`array<double,3>`) | 24 ずつ |

グリッド系 (edtsurf / distfield) はセル予算が頂点数も間接的に抑えるので新たな上限は
要らない。**MeshMS だけが無制限**で、頂点数は分子の大きさと `1/mesh_size^2` で
いくらでも増える。そこで `MESHMS_MAX_VERTS`(= 1600 万頂点) の予算を設けた。最大の
配列でも約 512 MB で、2 GB まで十分な余裕がある。

予測式は実測から得たもの (`test_dsurf_detail_calib` の 2 本):

```
verts ~ C * natoms / mesh_size^2      C は細かい側で 9.7、粗い側で 13
```

同じ `mesh_size` なら 327 原子でも 8829 原子でも C は一致した。安全側に `C = 12` を
採り、予算に収まる最も細かい `mesh_size` を直接解く。発火時はログに出す:

```
DirectSurfRend> meshms mesh too large for detail 32; coarsening 0.224 -> 0.230 A
```

detail 32 では約 6.7 万原子、detail 16 では約 22 万原子を超えると効き始める。
万一予測が外れた場合の保険として、MeshMS が返したメッシュが `MESHMS_HARD_MAX_VERTS`
(4800 万頂点) を超えていたら格納せずに例外を投げ、distfield にフォールバックする。

### `gfx::Mesh` の頂点色: palette + 16 B/頂点

display-list 経路 (ファイル書き出し、line / point 描画、shader 無し) の中間表現
`gfx::Mesh` は、頂点色を `std::vector<ColorPtr>` (頂点ごとに smart pointer 1 個) で
持っていた。PR #616 で `nverts*3` の過剰確保を直した際に「ColorPtr は 32 バイト」と
書いたが、プロジェクトのコンパイルフラグで実測すると **72 B** (scriptable な smart
pointer で vptr 5 本 + ポインタ 4 本) で、位置 + 法線 (24 B) の 3 倍だった。さらに
potential / multigrad 着色では `ScalarColorSupport::rampColor()` と
`MultiGradient::getColor()` が頂点ごとに新しい `GradientColor` (**256 B**) を作り、Mesh が
それを保持するので、頂点あたり ~350 B を色に使っていた。1600 万頂点なら pointer 配列だけで
1.15 GB の単一確保 (2 GB 上限の半分超)、gradient オブジェクトが別に ~4 GB。

今は **`ColorPtr` の palette (CLUT) を 1 本持ち、頂点にはその index だけを持たせる**。
`color()` に渡された `GradientColor` は 2 成分の palette index + `double rho` に分解して
格納し、`getCol()` が同じ成分・rho から再構成して返す (`ColorTable::getColor()` と同じ
手法)。base 色 (成分色や solid 色) は renderer が共有オブジェクトを使い回すので palette は
数個〜原子色の種類数で済む。

- 頂点レコード `VertCol{cid1, cid2, double rho}` = **16 B**。`rho` を float にすると
  整数境界近傍で 1 LSB ずれ、「exporter 出力バイト同一」が崩れるので double。
- palette の dedupe は「ポインタ同一 → 値 (getCode(), getMaterial())」の 2 段。値 dedupe が
  要るのは `MolSurfRenderer::getColorMol` のように頂点ごとに新しい同値オブジェクトが返る
  経路のため。ポインタ比較は **Mesh が保持しているオブジェクトに対してのみ**行う
  (頂点ごとに作られて即解放される GradientColor をポインタでキャッシュすると malloc の
  アドレス再利用で誤着色する)。
- `getCol(ColorPtr&, int)` のシグネチャは不変。solid 頂点は登録されたオブジェクトそのもの、
  gradient 頂点は再構成した一時オブジェクトを返す。未書き込み頂点は false
  (以前は null を true で返し `DisplayList::drawMesh` が deref していた)。
- 消費側 `RendIntData::mesh` (POV / LuxRender / Mqo / Umbreon の入口) は無変更で、
  再構成された `GradientColor` を今までどおり `ColorTable::newColor` が分解するので
  CLUT の番号順・`convRho` の丸め・gradient 登録まで同一。`DisplayList::drawMesh` は
  `getCol` false のときに現在色を使う 2 行だけ。

保持メモリは 1600 万頂点で ~5.6 GB → ~256 MB。生産側 (`rampColor` 等) が頂点ごとに
一時 `GradientColor` を作る CPU コストは残る (follow-up 参照)。テストは
`src/tests/gfx/test_mesh_colors.cpp`。

### detail の選択肢

`dsurface` は Detail 行に `ladder: [1, 2, 4, 8, 16, 24, 32]` を明示する。
これに property の現在値と既定値 (6) が混ざるので、GUI には
`1, 2, 4, 6, 8, 16, 24, 32` が出る。

2 の冪に 24 を足してあるのは、分子全体をテッセレーションする表面では上端ほど
1 段の差が大きく、16 -> 32 だけでは刻みが粗すぎるため (上の実測表で 1CRN の頂点数は
16 で 2.7 万、32 で 9.5 万)。

`numEnum` 行の選択肢は**行ごとの判断**である。共有の `TESSELLATION_LADDER`
(`[1, 2, 4, 8, 16, 32]`) は「自分で指定しない行の既定値」であって、アプリ全体の
上限ではない。2 の冪でない値や、この範囲より遥かに大きい値 (96、192 など) が
有用な property は `ladder` に列挙すればそのまま出る (`min`/`max` で切られない)。
型は `ladder` と `min`/`max` の併記を弾く。

C++ 側は `detail` を 1..100 まで受けるので、スクリプトからはさらに大きな値も
設定できる (グリッド系は上記のセル予算で頭打ちになる)。

## 原子 id (`MSVert::info`) の扱い

着色 (`DirectSurfRendererBase::resolveVertexColor`) と `showsel` フィルタ
(`isVertexShown`) は頂点ごとの `MSVert::info` を CueMol の原子 id として読む。
molsurf が CGAL の Kd-tree で最近接原子を引くのに対し、direct surface は
メッシュ生成時に原子 id を頂点に載せるので探索が要らない。

- **edtsurf**: EDTSurf の `atomid` (入力配列 index) を aid に引き直す。
- **distfield**: `DistFieldSurfBuilder::addAtom(pos, rad, aid)` で id を渡してあり、
  距離場の id グリッドが marching cubes まで運ぶ。
- **meshms**: `MeshResult::atom_id` は **1-based の入力配列 index** (0 = unknown) で
  CueMol の aid ではないので、`atoms[atom_id-1].aid` に変換して格納する。

どのアルゴリズムでも所有原子が決まらない頂点は `NO_ATOM_ID` (0xFFFFFFFF) になる。
`assignMissingAtomIds()` が面の隣接頂点から id を伝播させ (最大 3 パス)、残ったものは
`defaultcolor` で塗られる。

### 既存バグの修正 (null 原子)

`isVertexShown()` は `env.pMol->getAtom(v.info)` の結果を null チェックせず
`m_pShowSel->isSelected(pAtom)` に渡していた。`SelTermNode` / `SelHierNode` は
原子を無条件に dereference するので、未知 id の頂点 + 非空の `showsel` でクラッシュする。
`v.info<0` というガードはあったが `info` は `quint32` なので常に false で、死んでいた。

EDTSurf が `aid=-1` を書く経路で既に潜在していたが、MeshMS の `atom_id==0` で
顕在化しやすくなるため、null なら「表示する (= defaultcolor で塗る)」ガードを
基底に入れた。

## `RendererFactory` の type 名 alias

`dsurf2` を登録から外すと、`RendererFactory::create()` が
`Unknown renderer dsurf2` を投げ、**その renderer だけでなくシーン全体の読み込みが
失敗する** (`Object::readFrom2` / `SceneXMLReader` のどこにも per-renderer の
try/catch が無い)。

そこで旧 type 名を新 type 名 + プロパティ初期値に解決する alias 表を追加した:

```cpp
// qsys::RendererFactory
typedef std::vector<std::pair<LString, LString> > PresetList;
void registAlias(const LString &oldName, const LString &newName,
                 const PresetList &presets = PresetList());
```

```cpp
// surface::init()
pRF->registAlias("dsurf2", "dsurface", {{"surfalgor", "distfield"}});
```

設計上のポイント:

- preset は `setPropStr()` で書く。これが **default flag を落とす**ので、シーン読み込みの
  `readFrom2()` -> `reapplyStyle()` の順で `reapplyStyle` が上書きせず
  (`StyleSheet::applyStyleHelper` は非 default を skip)、保存時には
  `type="dsurface" surfalgor="distfield"` として明示的に書き出される。
- alias は `m_aliastab` という別テーブルに置く。`searchCompatibleRenderers()` は
  `m_rendtab` のみを走査するので、**alias は GUI の新規レンダラ一覧に出ない**。
- alias の連鎖は解決しない (1 段のみ)。target が未登録なら従来どおり throw する。
- `unregist()` は、消える type を指す alias も一緒に削除する。

### 付随修正: `SceneXMLReader` の重複 `resetAllProps()`

`SceneXMLReader::rendFromByteArray()` (renderer の貼り付け経路) は
`create()` 直後にもう一度 `resetAllProps()` を呼んでいた。`create()` が既に
実行しているので元々冗長だったが、alias の preset まで消してしまうため削除した。

## 既知の挙動変更

- **旧 `dsurface` シーンは distfield で描かれる**。`surfalgor` は既定値だった
  (= `edtsurf`) ためシーンファイルに書かれておらず (`LDOM2Stream` が default flag 付き
  ノードを skip する)、新しい既定値 `distfield` で読まれる。メッシュの見た目と
  `detail` の効き方が変わる。リリースノート記載事項。
- 旧 `dsurf2` シーンは alias 経由で見た目を保ったまま読める。

## click / hover (GPU ID-buffer pick)

`dsurface` は GPU pick に参加する (`docs/architecture/gpu-id-picking.md`)。fill 描画モードで
`buildGpuMesh()` が各頂点の `MSVert::info` (所有原子の id) を `TrigGpuPrim` の `hitName`
属性に `encodeHitName()` して載せるだけで、あとは既存部品が働く:

- `isPickSupported()` は `drawmode == fill` のとき true。line / point は display-list 経路で、
  `DisplayList::drawMesh` は mesh 全体に 1 つの name しか付けられないので対象外。
- `displayPick()` は `display()` を呼ぶ (CPK2 と同じ)。shader が使えない環境では何も描かない
  (display-list fallback を pick モードで描くと、名前無しの面が ID buffer で奥を隠すだけになる)。
- `NO_ATOM_ID` は `encodeHitName(-1) == 0` = no name なので、所有原子不明の頂点は拾われない。
- `showsel` で隠した頂点は GPU primitive に upload されないので ID buffer にも出ない。
- 結果の JSON は `MolRenderer::interpHit()` (継承) が原子単位で作り、tritium の hover chip /
  click は他の atom-level renderer と同じ経路で扱う。hover highlight はその原子のパッチ単位。
- 三角形は provoking vertex の name を取るので、原子パッチの境界はノコギリ状になる
  (surface ではパッチ境界自体が近似なので許容)。

**採らなかったもの**: 半透明 surface の pick。`Scene::displayPick` は
`alpha <= Scene::PICK_ALPHA_THRESHOLD` (0.6) の renderer を外す設計 (透けた surface の奥の原子を拾う)
に従う。この閾値は全 renderer 共通で、0.5 から 0.6 に上げた: 0.6 の surface はまだ十分に透けていて、
ユーザーは奥の原子に届かせたいと考えるのが自然なため。CPU 経路 (`isHitTestSupported()` +
`renderHit()` の点リスト) も付けていないので、rect / lasso 選択と uxp_gui では dsurface は
反応しない (follow-up 参照)。

## テスト

| ファイル | pin する契約 |
|---|---|
| `src/tests/modules/surface/test_dsurf_color.cpp` | `DsurfAlgorFixture`: 3 アルゴリズムそれぞれが非空メッシュを作り、全頂点の `info` が実在の原子 id であること / フォールバックが `surfalgor` を書き換えないこと。`DsurfAlias`: 旧 `type="dsurf2"` シーンが `dsurface` + distfield として読め、非 default として保存されること。`GpuMeshCarriesAtomIdsAsHitNames`: fill 描画で upload された全頂点の hitName が所有原子 id の符号化と一致し、line 描画では pick 非対応になること (GL 無しの `MockDisplayContext`、`src/tests/gfx/mock_display_context.hpp`)。既存の着色契約 (potential / multigrad / GPU と display-list の一致) も同ファイル |
| `src/tests/gfx/test_mesh_colors.cpp` | `gfx::Mesh` の色: gradient 頂点の `getCol` が元と同じ device code / material に解決し palette には成分だけが入ること、同値の base 色が 1 entry に畳まれ solid 頂点は登録オブジェクトそのものを返すこと、未書き込み頂点は `getCol` false |
| `src/tests/modules/surface/test_distfield_surf.cpp` | 距離場ビルダーと marching cubes 単体 |
| `src/tests/modules/surface/test_dsurf_detail_calib.cpp` | 契約テストではない。`DISABLED_` の計測ハーネス 2 本: `VertexCountsPerAlgorithm` (1CRN での detail 校正)、`LargeMoleculeCost` (1CRN を 6x6x6 = 7 万原子に複製し、グリッド予算と MeshMS 頂点予算の両方の発火を確認する。Debug ビルドで 2 分ほどかかる) |

## 今後の課題

- **MeshMS の `RSCache`**: `MolSurfObj` は density 非依存の RS 成分をキャッシュして
  再生成を速くしている (`meshms-ses-backend.md`)。レンダラは持っていない。
  レンダラの入力のうち cache を再利用できるのは `detail` 変更だけで、それも現状は
  メッシュキャッシュごと捨てる実装なので、効果を測ってから入れる。
- **`DirectSurfRendererBase` の畳み込み**: concrete クラスが 1 つになったので基底と
  合併できるが、qif / wrapper / プロパティ定義の移動量が大きく機能上の利点が無いため
  見送った。
- **rect / lasso 選択と uxp_gui での hit test**: CPU 経路 (`hitTestRect` / `hitTestPolygon`)
  は `renderHit()` の点リストで動く。dsurface に付けるなら「描画中の原子の中心」を
  `drawPointHit` する近似になる (surface のパッチ位置とは一致しない)。GPU pick が
  rect 選択にも使えるようになれば不要。
- **`gfx::Mesh` の gradient 頂点の一時オブジェクト**: `rampColor()` / `MultiGradient::getColor()`
  が頂点ごとに作る `GradientColor` は保持されなくなったが、確保・解放の CPU コストは残る。
  `Mesh::color(c1, c2, rho)` と `ScalarColorSupport` / `MultiGradient` の非確保経路を足せば
  無くせる (exporter 側の `RendIntData::mesh` は `getCol` で再構成するので影響なし)。
