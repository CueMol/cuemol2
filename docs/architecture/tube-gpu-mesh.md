# tube 系 renderer の GPU mesh (`TubeMeshBuilder` / `TubeGpuSupport`)

`TubeRenderer` (tube)、`RibbonRenderer` (ribbon)、`Ribbon2Renderer` (cartoon) は display list を経由せず、
`gfx::TrigGpuPrim` を直接構築して描く。
座標の変化 (MD trajectory / morphing の `atomsMoved`) と色の変化 (coloring の変更) は、
同じ traversal を回し直して VBO の頂点データを in-place で書き換えるだけで反映する
(再確保なし、index buffer は再送しない)。

残りの計画 (spline 係数の in-place 再生成、NA) は `../plans/261017-tube-gpu-mesh-plan.md`。

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

## TubeGpuSupport と host renderer の契約

- `beginRend(pdl)` で `tgBeginRend(pdl)` を呼ぶ: pdl が非 null (display list / ファイル) なら Direct モード、
  null なら `tgPrepare()` が設定したモードのまま
- `tgRenderMesh()` は `render(nullptr)`。`SplineRenderer::beginRend` / `endRend` は null pdl を許す
- `tgPreRender()` / `tgPostRender()` は host の `preRender()` / `postRender()`
- `display()` / `displayPick()` は `tgDisplay()` / `tgDisplayPick()` を呼び、false (ファイル context、
  shader なし、`tgIsEnabled()` false) なら `super_t` の display list 経路に落とす
- pick pass は同じ prim を描く。`TrigGpuPrim` が `isPickDraw()` で pick program に切り替える。
  hit name は「strip 全体に current ring の名前」(`gpu-id-picking.md` §3.3) のまま
- `invalidateDisplayCache()` は `tgOnInvalidateDisplay()` を呼んでから super に流す。
  setter (cap type、seg-end fade、line width など) も `super_t::invalidateDisplayCache()` ではなく
  仮想呼び出しにしてある (GPU mesh を確実に捨てるため)
- `tgPrepare()` は polygon mode (fill / wire) が変わったら作り直す (index buffer の形が違うため)

### invalidation

| イベント | 処理 |
|---|---|
| `OBE_CHANGED` + `"atomsMoved"` で mesh が有効 (`tgOnAtomsMoved()` が true) | `tgMarkDirty(UPD_GEOM)`。tube / ribbon は `SplineRenderer::updateMovedAtoms()` (spline 係数だけ破棄、`Scene::setUpdateFlag()`、`invalidateHittestCache()`)。cartoon は `m_diffvecs` を捨てる (spline は `endSegment` が毎回作り直す)。どちらも super の `objectChanged` には流さない (`TraceStickRenderer` と同じ形) |
| `coloring` / `coloring.*` の prop 変更 | `tgBeginColorOnly()` / `tgEndColorOnly()` で囲んで super の `propChanged` を回す。その間の `invalidateDisplayCache()` は `tgMarkDirty(UPD_COLOR)` になる |
| それ以外の `invalidateDisplayCache()` | `tgInvalidate()` (次の display でフル再構築)。section や cap など形に効く変更はすべてここを通る |
| `unloading()` | `tgUnload()` |

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

テストからは `tgBuildMesh()` / `tgUpdateMesh()` / `tgMesh()` (DisplayContext なしで mesh を記録・更新する公開 API) を使う。

## NARenderer

`TubeRenderer` の派生だが、base pair・糖・埋め込みの ball & stick を同じ pdl に描くので
`tgIsEnabled()` を false にして display list 経路のまま。
