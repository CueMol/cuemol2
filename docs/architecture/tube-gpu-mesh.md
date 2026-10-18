# tube 系 renderer の GPU mesh (`TubeMeshBuilder` / `TubeGpuSupport`)

`TubeRenderer` (tube)、`RibbonRenderer` (ribbon)、`Ribbon2Renderer` (cartoon)、`NARenderer` (nucl) は display list を経由せず、
`gfx::TrigGpuPrim` を直接構築して描く。
座標の変化 (MD trajectory / morphing の `atomsMoved`) と色の変化 (coloring の変更) は、
同じ traversal を回し直して VBO の頂点データを in-place で書き換えるだけで反映する
(再確保なし、index buffer は再送しない)。

残りの計画 (spline 係数の in-place 再生成) は `../plans/261017-tube-gpu-mesh-plan.md`。

## 構成

| クラス | 役割 |
|---|---|
| `molvis::TubeMeshBuilder` (`src/modules/molvis/TubeMeshBuilder.{hpp,cpp}`) | renderer と `TubeSection` の描画先。DisplayContext と同じ immediate-mode の呼び出し (color / loadName / normal / triangle strip / fan) を受ける |
| `molvis::TubeGpuSupport` (`TubeGpuSupport.{hpp,cpp}`) | host renderer に mix-in する GPU キャッシュ。builder と `TrigGpuPrim`、dirty flag を持つ |
| `TubeSection` | cap / 本体の tessellation (`makeCap`, `makeFlatCap`, `makeSpherCap`, `doTess`, `makeDisconJct`) の出力先が `TubeMeshBuilder *` |

## TubeMeshBuilder のモード

| モード | 動作 | 用途 |
|---|---|---|
| Direct | 全呼び出しをそのまま DisplayContext に転送する | display list、ファイル出力 (POV-Ray など)、shader が使えないときの fallback。出力は従来と同一 |
| Build | 頂点 (pos / normal / 色 devcode / 符号化した hit name) と strip / fan の区切りを flat な vector に記録する | GPU mesh の初回構築とトポロジ変更時 |
| Update | 同じ traversal を回し直し、記録順に `UPD_GEOM` (pos, normal) と `UPD_COLOR` (色) を上書きする。prim の区切りと hit name は保持する | 座標 / 色の変化 |

- 色は `color()` の時点で devcode に解決する (頂点ごとに `getDevCode` しない)。初期色と normal の正規化
  (長さ < 1e-4 なら (1,0,0)) は `gfx::DisplayList` と同じ
- `toGpuPrim()` は strip / fan を `gfx::GrowMesh` と同じ順序・winding で三角形 index に展開する
- `toGpuPrim()` の後、`TubeGpuSupport` は `releaseVertexData()` で builder 自身の頂点配列 (位置・法線・色・hit name)
  を捨てる。頂点数と prim の区切りは Update の照合用に残す。以後の Update は `TrigGpuPrim::getVertexArray()` を
  書き込み先として渡され、prim の頂点配列に直接書く (builder の配列から prim への写しが無い)。prim を使わない
  経路 (テストの `tubeGpuBuildMesh()` / `tubeGpuUpdateMesh()`) では従来どおり builder の配列に書く
- `finish()` は Update モードで、頂点数・prim の数・各 prim の型と頂点数が Build 時と一致したかを返す。
  一致しなければ呼び出し側がフル再構築する
- renderer は `wantColor()` / `wantName()` が false のとき `calcColor` / `calcHitName` を呼ばない
  (座標だけの更新で `GradientColor` を new しない)

## トポロジが座標に依存しないこと

Update が成り立つ前提。頂点数と prim の構成を決めるのは:

- セグメント分割: `MainChainRenderer::isNewSegment` は chain と `MolResidue::isLinkedTo`
  (トポロジ構築時に設定) だけで決まる
- 軸方向の分割数 `ndelta`: 残基パラメータ範囲 x axialdetail
- 断面の頂点数 (section の type / detail)、cap の種類、seg-end fade、selection

どれも座標では変わらない。万一変わった場合は `finish()` の不一致で検出され、フル再構築になる。

## traversal の軽量化 (MainChainRenderer)

Update traversal は座標が変わるたびに走るので、トポロジに依存する検索を毎回しないようにしている:

- `MainChainRenderer::getPivotAtom()` は残基ごとの結果を `m_pivCache` に持つ (初回だけ名前で検索する。
  検索は `MolResidue::getParent()` で SceneManager から分子を引くので重い)。pivot 名の変更
  (`setPivAtomName`)、`atomsMoved` 以外の `OBE_CHANGED`、分子への付け外しで捨てる。
  spline 係数の作り直し (`SplineCoeffSet` -> `getPivotAtom`) と形状の生成の両方がこれを通る
- `MainChainRenderer::isNewSegment()` の chain 判定は、`getParentChain()` (分子と chain の検索) ではなく
  残基の chain 名の比較 (同じ分子の残基どうしなので名前で同一 chain と分かる)
- spline 係数 (`SplineCoeffSet`、tube / ribbon / nucl) は「トポロジの部分」と「座標の部分」に分かれている:
  - トポロジ (`buildTopology` / `SplineCoeff::setupTopology`): セグメント分け、残基の並び、パラメータの表、chain 名、
    残基ごとの pivot 原子・平滑化の重み・sheet なら C / O 原子 (生ポインタ)、残基 -> 番号 / 残基 -> 係数の
    `unordered_map` (`searchCoeff` は定数時間)
  - 座標 (`SplineCoeff::updateGeometry`): キャッシュから座標を読んで平滑化 -> 軸の spline -> 法線 -> 法線の spline
  - 座標が動いたとき (`SplineRenderer::updateMovedAtoms` -> `SplineCoeffSet::markMoved`) は座標の部分だけを
    やり直す。軸方向の細かさ・平滑化・pivot 名・構造の変化と二次構造の変化 (`OBE_CHANGED`、二次構造の再計算は
    descr `"secondary"`)・`xformMat` では全部捨てる (`invalidateSplineCoeffs` -> `cleanup`)
  - 補間に失敗したセグメントは `searchCoeff` が返さない (描かない)

## VBO の転送

座標・色の更新で送り直すのは頂点バッファだけ (インデックスは buffer の寿命の間変わらないので送らない。
`BufferStore.drawBuffer` / `EcBufferRep::update`)。`DisplayContext::drawElem` は buffer の作成時に更新の印を
消す (作成で全量を送っているため)。詳細と数字は `tritium/docs/architecture/renderer-update-cost.md`。

## TubeGpuSupport と host renderer の契約

- `beginRend(pdl)` で `tubeGpuBeginRend(pdl)` を呼ぶ: pdl が非 null (display list / ファイル) なら Direct モード、
  null なら `tubeGpuPrepare()` が設定したモードのまま
- `tubeGpuRenderMesh()` は `render(nullptr)`。`SplineRenderer::beginRend` / `endRend` は null pdl を許す
- `tubeGpuPreRender()` / `tubeGpuPostRender()` は host の `preRender()` / `postRender()`
- `display()` / `displayPick()` は `tubeGpuDisplay()` / `tubeGpuDisplayPick()` を呼び、false (ファイル context、
  shader なし、`tubeGpuIsEnabled()` false) なら `super_t` の display list 経路に落とす
- pick pass は同じ prim を描く。`TrigGpuPrim` が `isPickDraw()` で pick program に切り替える。
  hit name は「strip 全体に current ring の名前」(`gpu-id-picking.md` §3.3) のまま
- `invalidateDisplayCache()` は `tubeGpuOnInvalidateDisplay()` を呼んでから super に流す。
  setter (cap type、seg-end fade、line width など) も `super_t::invalidateDisplayCache()` ではなく
  仮想呼び出しにしてある (GPU mesh を確実に捨てるため)
- `tubeGpuPrepare()` は polygon mode (fill / wire) が変わったら作り直す (index buffer の形が違うため)

### invalidation

| イベント | 処理 |
|---|---|
| `OBE_CHANGED` + `"atomsMoved"` で mesh が有効 (`tubeGpuOnAtomsMoved()` が true) | `tubeGpuMarkDirty(UPD_GEOM)`。tube / ribbon は `SplineRenderer::updateMovedAtoms()` (spline 係数だけ破棄、`Scene::setUpdateFlag()`、`invalidateHittestCache()`)。cartoon は `m_diffvecs` を捨てる (spline は `endSegment` が毎回作り直す)。どちらも super の `objectChanged` には流さない (`TraceStickRenderer` と同じ形) |
| `coloring` / `coloring.*` の prop 変更 | `tubeGpuBeginColorOnly()` / `tubeGpuEndColorOnly()` で囲んで super の `propChanged` を回す。その間の `invalidateDisplayCache()` は `tubeGpuMarkDirty(UPD_COLOR)` になる |
| それ以外の `invalidateDisplayCache()` | `tubeGpuInvalidate()` (次の display でフル再構築)。section や cap など形に効く変更はすべてここを通る |
| `unloading()` | `tubeGpuUnload()` |

## renderer ごとの注意

- ribbon: partition cap (JctTable の `isReqPart`) は「前の色がある」ことを条件にしていたが、座標だけの更新では
  色を計算しないので、条件を `wantColor()` のときだけに絞った (そうしないと Update でトポロジが変わり、毎回フル再構築になる)
- ribbon: helix の裏面色 / sheet の側面色 (`evalMolColor`) も `wantColor()` のときだけ計算する
- cartoon: `renderHelix` / `renderSheet` / `renderCoil` / `renderHelixCoil` の色・hit name の計算を
  `wantColor()` / `wantName()` で囲む

## テスト

`src/tests/modules/molvis/test_tubegpumesh.cpp`:
- tube / ribbon / cartoon で、原子を動かして `fireAtomsMoved()` すると Update がトポロジを保って成功し、
  結果が動かした原子からのフル再構築と一致する (古い spline 係数が残ると落ちる)
- `TubeMeshBuilder` の Update が指定のデータだけを上書きし、トポロジの変化を検出する

テストからは `tubeGpuBuildMesh()` / `tubeGpuUpdateMesh()` / `tubeGpuMesh()` (DisplayContext なしで mesh を記録・更新する公開 API) を使う。

## NARenderer (nucl)

`TubeRenderer` の派生で、tube に加えて塩基の stick (sphere / cylinder) と ring 板を描く。すべて同じ traversal で
記録し、座標・色の変化も同じ Update traversal で書き換える (coord texture は使わない)。

| 要素 | 受け皿 |
|---|---|
| 主鎖 tube | TubeGpuSupport の `TrigGpuPrim` |
| 塩基の ring 板 (detail1 / detail2) | 同じ `TrigGpuPrim`。`BallStickRenderer::collectRingAtom()` / `drawCollectedRings(TubeMeshBuilder *)` で描く (`drawRings` の描画先は builder) |
| sphere / cylinder (全モード) | `SphereGpuPrim` / `CylinderGpuPrim` (impostor)。位置・半径・色 devcode・hit name を `NARenderer::Stick` として記録 |

- `stickSphere()` / `stickCyl()` が `pdl->sphere` / `pdl->cylinder` の代わり。direct (display list / ファイル) では
  `loadName` -> `color` -> `pdl->sphere/cylinder` (従来と同じ出力)、Build では記録を追加、Update では同じ順に
  上書き (UPD_GEOM で位置、UPD_COLOR で色)。数が合わなければ `tubeGpuInvalidate()` して作り直す
- 1 回の traversal の結果は `NARenderer::prepareGpu()` が `tubeGpuPrepare()` の直後に stick prim へ反映する
  (Build なら alloc + `setData`、Update なら `setData` + `setUpdated(true)`)
- 色の分岐 (同色なら 1 本、2 色なら中点で 2 本) がトポロジを決めるので、stick の色は Update(UPD_GEOM) でも計算する
- detail モードの原子と bond は NA 自身が描く (補助の `BallStickRenderer` は色と ring の計算だけに使う)。
  同色 bond と原子と ring 板の hit name は残基の pivot、2 色 bond の半分は各原子
- stick は pick 対応の座標属性版 prim で描くので、GPU pick にも描かれる (`gpu-id-picking.md`)
- テスト: `NARendererGpuMeshTest` (1ehz、detail1) が、atomsMoved の Update が tube・ring・stick を保ってフル再構築と
  一致することを確認する
