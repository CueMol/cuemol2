# GPU ID-buffer picking と 3D view の hover 情報

tritium の 3D view で、描画結果に即した hittest (renderer が実際に描いた幾何に対する当たり判定) と、
マウス hover で左下ステータス領域に対象を表示する機能の設計記録。libcuemol2 (C++) の pick pass と
tritium react-gui の hover UI の 2 層からなる。uxp_gui は従来の CPU hittest のまま動く。

- Status: implemented (2026-09)
- Related: [GTAO](gtao-screen-space-ao.md) (offscreen パイプラインと WebGL2 の制約),
  mapping `widget.mainview` (UXP `tabmolview` の hover tooltip は JS-only で動作していなかった)

---

## 1. 動機

従来の `View::hitTest` は CPU 側の「点 in 視錐台」判定である。各 renderer は `renderHit()` で pickable な
要素につき **原子座標 1 点** を `gfx::HittestList` に登録し、`HittestContext::callDisplayList` が pick matrix で
射影して 10px の箱に入る点を拾う。ribbon / cartoon / tube 系は `MainChainRenderer::rendHitResid` が残基の
pivot 原子 (CA) だけを登録するため、帯の上をクリックしても CA から離れていると当たらなかった。hover 経路も
無かった (C++ `MouseEventHandler::move` はボタン非押下の move を破棄する)。

Mol* の pick pass (`mol-canvas3d/passes/pick.ts`) と同じく、renderer/要素 ID を offscreen framebuffer に
描画してカーソル下の texel を読み戻す方式に切り替えた。Mol* は 24bit ID を RGBA8 に pack するが、
本実装は整数 render target (RGBA32UI) を使う。

## 2. ID のデータ構造: 既存の name stack と HitData を GPU 経路に昇格

新しい ID 型は作らず、GL selection 由来の既存 API を正式なデータ経路にした。

| 既存の構造 | 役割 (CPU hittest) | GPU 経路での役割 |
|---|---|---|
| `DisplayContext::loadName / pushName / popName` | `HittestContext` が name stack として実装 (基底は no-op だった) | 基底 `DisplayContext` が状態として実装。renderer は `render()` 内で `pdl->loadName(aid)` と呼ぶ |
| `DisplayContext::startHit(uid) / endHit()` | `HittestContext` が現在 renderer を記録 | 基底が pass 内の renderer uid テーブルを積み、1-based index を保持 |
| `gfx::HitData::HitEntry{rend_id, index, data}` | 1 hit = name list (外側の名前 ... + 要素 id) | `HitData::addHit(uid, names)` で同じ形に積む |
| `Renderer::interpHit(RawHitData)` | name の意味付け (atom / residue / symop) | 無変更。GPU 経路もこれで JSON を組み立てる |

- 要素 id の意味は renderer が決める (`MolAtomRenderer` = aid、`MainChainRenderer` = pivot 原子の aid を残基として
  解釈、`SymmRenderer` = [symop, aid])。データに kind は持たせない。
- 頂点属性 / texel への符号化は `gfx::encodeHitName` / `decodeHitName` の 1 対のみ (`-1` (no name) -> 0、`n` -> `n+1`)。
- 制約: display list 内での `pushName` の入れ子は属性 1 本では表現できない。「DL 記録中は top のみ記録、
  外側 1 段は描画時 (callDisplayList 時) の drawing context の name stack から」と定義した。現行の 2 段利用は
  `SymmRenderer` の [symop, aid] だけで、これで足りる (Phase 3、未実装)。

## 3. 経路

```
renderer::render(pdl)              pdl->loadName(aid); ... vertex() ...      (色・法線と同格の描画状態)
  -> gfx::DisplayList               頂点ごとに encodeHitName(getCurrentName()) を記録
       LineDrawAttr / TrigVertBuf / GrowMesh 頂点 / SphereList / CylinderList (name フィールド)
  -> TrigGpuPrim / LineGpuPrim      頂点構造体に uint hitName (整数属性: glVertexAttribIPointer /
                                    gl.vertexAttribIPointer)。表示用 shader はこの location を宣言しないだけ
GpuPrim 直描き renderer             SphereIdx / CylinderIdx / LineIdx / LineValIdx の頂点に hitName を追加、
                                    setData(...) で encodeHitName(aid) を直接渡す (index -> aid の逆引き不要)

pick pass (GUIView::renderPickBuffer)
  pick RT (RGBA32UI + depth, backing size * PICK_SCALE=0.5, NEAREST) を bind / clear(0)
  pdc: PICK_DRAW, blend off, viewport = pick size, jitter 無しの projection, model matrix
  Scene::displayPick(pdc): 可視 / 非UIロック / isPickSupported / alpha > 0.6 の renderer ごとに
      pdc->resetNames(); pdc->startHit(uid); pRend->displayPick(pdc); pdc->endHit()
      DispListRenderer: 表示用の同じ display list を callDisplayList (pick 用の複製は無い)
      GpuPrim: draw() が isPickDraw() を見て pick program (*_pick_*.glsl) に切り替える
  texel = uvec4(R = renderer index, G = 要素 name, B = 外側 name, 0)

GUIView::hitTest(x, y)   [View::hasGpuPick() && stereo == CSM_NONE]
  1. dirty なら renderPickBuffer()   (dirty = drawScene() 末尾 / sizeChanged / unloading で true)
  2. カーソル位置 (backing px * scale, bottom-left 原点) の (2r+1)^2 窓を readColorUInt で読み、
     gfx::findNearestPickTexel が中心から外側へ (Chebyshev ring、ring 内は距離順) 走査
  3. pickTexelToHitData: (R, G, B) -> rend uid (テーブル), names = [decode(B)?, decode(G)] -> HitData::addHit
  4. 既存の interpHit + JSON 組み立て (formatHitResult)。JSON 形式は不変
  5. miss かつ Scene::hasCpuOnlyHitRenderers() のときだけ、それらに限定して従来 CPU hittest
     (processHit(pdc, bCpuOnly=true))
```

### 3.1 pick shader
- `src/sysdep/ogl_core/pick_inc.glsl`: DrawParamsBlock の pick tail (`u_rend_idx`, `u_outer_name`) 用マクロ。
- `trig_pick_vert/frag.glsl`, `linew2_pick_vert.glsl`, `linew2idx_pick_vert.glsl`, `linevalidx_pick_vert.glsl`,
  `linew_pick_frag.glsl` (line 系共用)。line は両端点の name と補間パラメータ `v_pickT` を持ち、fragment で
  近い側の端点を選ぶ (二色 bond の各半分が自分の原子を返す)。
- impostor: `sphere_body_frag.glsl` / `cylinder_body_frag.glsl` を include-only の body に切り出し、
  `PICK_MODE` で `uvec4 o_Pick` 出力 / edge ring discard に分岐。`sphere2idx_pick_vertex.glsl` /
  `cylinder_idx_pick_vertex.glsl` は `USE_COORD_TEX` + `PICK_MODE` で body を include。cylinder は
  `v_impos.y` (ta 端 = -1, tb 端 = +1) で A/B の name を選ぶので、単色 bond は中点で分かれ、二色の半分は
  両端に同じ name を持つ。
- 整数 varying は `flat`、`uint` 演算は `u` リテラル。`#version` は従来通り実行時に前置 (desktop `410` /
  WebGL2 `300 es`)。
- UBO は既存の DrawParamsBlock の末尾に 16 byte の tail を足した `PickDrawParams` (各 GpuPrim に定義)。

### 3.2 render target と読み戻し
- `gfx::RT_COLOR_RGBA32UI` (`RenderTarget.hpp`): attachment 0 を RGBA32UI (常に NEAREST)、`clear()` は
  `glClearBufferuiv` で (0,0,0,0)。`readColorUInt(idx, x, y, w, h, quint32*)` を追加。
- desktop: `OcRenderTarget` (`GL_RGBA_INTEGER` / `GL_UNSIGNED_INT`)。WebGL2: `EcRenderTarget::readColorUInt`
  -> peer `readPixelsUInt` (`FboStore.readPixelsUInt`: `readPixels(RGBA_INTEGER, UNSIGNED_INT, Uint32Array)`)。
  `FboStore.createFramebuffer` は `RT_COLOR_RGBA32UI` で `texImage2D(RGBA32UI, RGBA_INTEGER, UNSIGNED_INT)`、
  `clearRenderTarget` は整数 target なら `clearBufferuiv` (`gl.clear` は整数 draw buffer に INVALID_OPERATION)。
- 整数頂点属性: `AbstDrawAttrs::setAttrInteger(ind, true)` -> `OcBufferRep` は `glVertexAttribIPointer`、
  `EcBufferRep` は elem_info JSON に `"integer"`、`BufferStore` は `gl.vertexAttribIPointer`。
- pick pass の far clip は **fog end (center + slab/2)** (`GUIView::computeSlabPlanes(bPickProj = true)`、
  `renderPickBuffer` が `m_bPickProj` を立てて `setUpProjMat` を呼ぶ)。表示の far clip は center + slab だが、
  fog は fog end で 100% になり (全 GL renderer が無条件に fog を受ける、pick shader には fog が無い)、
  その先は見えないのに pick できてしまうため。GPU pick と併走する CPU fallback (`hitTestImpl`) も
  `far_factor = PICK_FAR_FACTOR (0.5)` で同じ可視範囲にする。純 CPU 経路 (uxp_gui) と `hitTestRect` /
  `hitTestPolygon` は従来の far のまま。

### 3.3 renderer 側の name 供給 (Phase 1 / Phase 2)
- `MolAtomRenderer::render` の基底ループ: `rendBond` の前に atom1、`rendAtom` の前にその原子。二色 bond を
  半分ずつ描く subclass (BallStick DL 経路 / Simple DL 経路 / NARenderer) は 2 本目の色切替の隣で
  `loadName(atom2)`。
- 主鎖系: `MainChainRenderer::calcHitName(rho, pRes1, pRes2)` (= `rendHitResid` と同じ pivot 原子)。
  `SplineRenderer::calcHitName(par, pCoeff)`、`Ribbon2Renderer::calcHitName / calcCoilHitName` を `calcColor`
  の隣で呼ぶ。`TubeSection::doTess` (cartoon) と `TubeRenderer` / `RibbonRenderer` の strip ループは、前リングと
  現在リングの間の strip 全体に **現在の name (区間単位)** を付けるので、残基境界はリングの上にぴったり乗る。
  リングごとに name を変えると provoking vertex (LAST) により三角形が交互に前後の残基に属し、境界がノコギリ状に
  なる (hover highlight で目立った)。
- GpuPrim 直描き (CPK2 / BallStick / Simple / Trace): `displayPick()` は `display()` を呼ぶだけ。coord-texture
  経路の prim は pick program で描き、DL fallback 経路は名前付き DL がそのまま描かれる。pick program を持たない
  `SphereGpuPrim` / `CylinderGpuPrim` (座標属性版) は `isPickDraw()` で何も描かない (この経路は pick 不可)。
- `isPickSupported()`: `MolAtomRenderer` / `MainChainRenderer` で `isHitTestSupported()`。name を付けない
  renderer (AtomIntr / MolSurf / NameLabel / Selection / Symm / LW / UnitCell) は false のまま。

### 3.4 uxp_gui 非適用の gating
- `ViewCap::hasGpuPick()` (既定 false)。`ElecViewCap` のみ true。`OcViewCap` は override しないので desktop /
  uxp_gui では `GUIView::hitTest` の呼び出し列は従来と同一 (`hitTestImpl` -> `Scene::processHit(pdc, false)`)。
- 基底 `DisplayContext` の name stack は状態を持つだけで GL 呼び出しは増えない。`HittestContext` の override、
  `renderHit()` / `HittestList` / `HitData::createNearest|createAll` は無変更。
- renderer が `render()` で呼ぶ `loadName` は desktop でも実行されるが、DisplayList に 4 byte/頂点 が
  記録されるだけで表示用 shader は属性を読まない。

## 4. tritium の hover UI

- `naviHover` service (`worker/server/services/navi/naviTool.ts`): `view.hitTest(x, y)` のみ (MsgLog / undo
  txn なし)。結果 `{ hit, label?, raw? }`。`label` (`HoverLabel`) は worker が `mol.getAtomByID` で解決した
  構造化データ (`objName` / `rendName` / `rendType` / `chain` / `resName` / `resIndex` / `atomName` / `symop`)。
  cartoon / ribbon / tube / spline / nucl / trace の hit は `residueLevel = true` で atom 名を持たない
  (帯は残基のものなので原子名を出さない)。MolCoord 以外は `text` (C++ の message) だけ。
- `useHoverInfoHandler` (`features/molview/`): `.content-pane` に listener を委譲 (rectSelect / lasso 中は
  `RectSelectOverlay` が canvas を覆うため)。33ms throttle、in-flight 1 件、latest-wins、`buttons !== 0` で抑止、
  `mousedown` / `mouseleave` / view 切替で clear、`useStaleGuard` で遅延応答を破棄、同一文字列では setter を
  呼ばない。全ツールで有効。
- 表示: `MolViewHoverLabel` (`features/molview/`) が content pane の**左下**に click-through のチップ
  (tool palette と同じ `--bg-elevated` 面、z-index は select overlay (5) と palette (10) の間) を出す。
  1 行目 = chain バッジ + `ALA 10` (+ 原子レベルなら ` CA`)、2 行目 = `1CRN | cartoon1` (+ symop)。
  hover 状態はこの component が持つので、ポインタ移動で再描画されるのはチップだけ (pane / canvas は
  再描画されない)。status bar は click メッセージ専用のまま (hover は status bar に出さない: owner 指定)。
- transport: `invokeService(name, args, { quiet: true })` は busy counter に乗らない (`WorkerTransport._call`
  に統合、`invokeWorkerWithTransfer` と同じ非計上経路)。hover の 30Hz 呼び出しで Busy 表示 / wait cursor が
  瞬かないため。
- click / context menu / measure / bond edit は既存の `view.hitTest` 経由なので、判定だけが renderer 準拠になる。
  `hitTestRect` / `hitTestPolygon` (矩形・lasso) は CPU 判定のまま。

### 4.1 設定 (on / off)
- Settings tab > Mouse & Navigation に **GPU Picking** と **Hover Info** の 2 スイッチ。どちらもホストの都合
  (遅いマシンでは常に off) なので scene ではなく electron-store (`UiState.gpuPicking` / `hoverInfo`、既定 true)
  に永続化し、`PickingPrefsContext` が起動時に読み込む。一度 off にすれば on に戻すまで残る。
- **GPU Picking** は C++ の `ViewInputConfig.gpu_pick` (`.qif` boolean、既定 true) に `setGpuPickEnabled` service で
  即時反映される。`GUIView::isGpuPickActive()` (= `hasGpuPick() && gpu_pick && stereo == NONE`) を `hitTest` が毎回
  評価するので再起動不要。off のときは pick target を解放して VRAM を戻し、click / hover は従来の CPU hittest
  (原子中心の 10px 箱) で動く。`ViewInputConfig` の他のプロパティ (`hitprec`) と違い user style file には書かない
  (persistence は electron-store 側の 1 箇所)。
- **Hover Info** は renderer だけの設定で、off にすると `useHoverInfoHandler` が mousemove を購読しない
  (30Hz の hittest 要求自体が止まる)。CPU hittest でも大きな分子では全原子射影が走るので、GPU Picking とは
  独立に切れるようにした。

## 5. 契約行
- `worker/shared/calls/navi.ts`: `naviHover: { args: NaviHoverArgs; result: NaviHoverResult }` + `NAVI_KEYS`。
  `NaviHoverArgs.highlight` (view の hover highlight を同じ往復で更新) と `naviHoverClear: { args: { viewId };
  result: { ok } }` (§10)。
- `View.qif`: `setHoverHit(rend_id, atom_id, symm_id)` / `clearHoverHit()` (§10)。`ViewInputConfig.qif`:
  `hover_hl_color`。`UiState.hoverHighlight` / `PickingPrefs.hoverHighlight` / 設定行 `picking.hoverHighlight`。
- `worker/client/WorkerTransport.ts`: `InvokeOptions.quiet`。`tritium/CLAUDE.md` の dispatch 表に 1 行。
- `worker/server/services/navi/naviTool.ts`: `HoverLabel` (hover チップの表示契約)。
- `worker/shared/calls/view.ts`: `setGpuPickEnabled: { args: { enabled }; result: { ok } }`。
- `shared/types/uiPrefs.ts`: `UiState.gpuPicking` / `hoverInfo`。`contexts/PickingPrefsContext.tsx`:
  `usePickingPrefs()` (provider 外では既定値を返す)。`ViewInputConfig.qif`: `gpu_pick`。
- GfxManager peer API (`gfxManagerContract.test.ts`): `readPixelsUInt` を追加。
- C++: `ViewCap::hasGpuPick`、`View::hasGpuPick`、`Renderer::isPickSupported / displayPick`、
  `Scene::displayPick / processHit(bCpuOnly) / hasCpuOnlyHitRenderers`、`HitData::addHit`、
  `RenderTarget::readColorUInt`、`AbstDrawAttrs::setAttrInteger`。`View.qif` / JSON 形式は無変更。

## 6. 採らなかった案
- **色に ID を埋め込む**: pick build 中だけ `ColSchmHolder::getColor` が ID 色を返し、pick 用 DL を別途
  キャッシュする案。renderer コードは触らずに済むが、色 hook / smooth color 抑止 / 色 proofing bypass / DL 複製が
  散らばる負債になるため却下 (owner 判断)。
- **新規 ID 型 (kind + index)**: renderer が `interpHit` で name を解釈する既存設計と責務が重複するため却下し、
  name stack に統合した。
- **C++ に hover event を追加**: `MouseEventHandler` が plain move を捨てる設計を崩し、UXP / python も同じ
  event category を listen するため見送り。hover は renderer thread の DOM mousemove だけで実装した。
- **RGBA8 pack (Mol* 方式)**: 整数 RT が WebGL2 core で使えるので、丸め誤差の無い RGBA32UI を選んだ。
- tooltip popup (UXP 形式: ポインタ追従) ではなく、位置固定の左下チップにした (owner 指定。ポインタ追従は
  視線が動き、canvas 上の hover を横取りしやすい)。当初 status bar の 1 行だったが、視線が 3D view から
  離れるため mol view 内へ移した。

## 7. テスト
- C++ (test_qsys): `gpu_pick` の既定と `GUIView::isGpuPickActive` の gating (`test_viewinputconfig.cpp` /
  `test_guiview.cpp`)。tritium: `setGpuPickEnabled` の live-only 書き込み (`viewInputParamsService.test.ts`)、
  Hover Info off で mousemove を購読しないこと (`useHoverInfoHandler.test.tsx`)。
- C++ (test_gfx / test_qsys): 基底 name stack と符号化 (`test_displaycontext_names.cpp`)、DisplayList が頂点に
  name を記録し recordStart で戻ること (`test_gpuprim.cpp`)、読み戻し窓の最近傍探索 (`test_pickbuffer.cpp`)、
  texel -> HitData 変換 (`test_guiview.cpp`)、`Scene::displayPick` の選別と `processHit(bCpuOnly)` の skip
  (`test_scene_pick.cpp`)。
- tritium: hover controller の呼び出し列 (`useHoverInfoHandler.test.tsx`)、`naviHover` の `HoverLabel` 契約
  (残基レベル / 原子レベル / 非分子 / miss、`naviHoverService.test.ts`)、`{ quiet: true }` が busy に乗らない
  こと (`AsyncCueMolBusy.test.ts`)。
- hover highlight (§10): フレーム計画 `GUIView::planFrame` の表 (present 専用 / 通常 / jitter 再開)、
  `setHoverHit` が GPU pick 有効時だけ present 専用フレームを予約すること、hover 要素 -> pick texel ID の変換
  `hoverIdToPickId` (`test_guiview.cpp`)、`hover_hl_color` の既定 (`test_viewinputconfig.cpp`)。tritium:
  `naviHover` の `highlight` 引数が `setHoverHit` / `clearHoverHit` に写ること (`naviHoverService.test.ts`)、
  hover 終了時に `naviHoverClear` が 1 回だけ送られること、右押下と context menu の hold では clear せず解除で
  再サンプルすること (`useHoverInfoHandler.test.tsx`)。

## 8. ビルドの注意
- tritium の addon は `.build_out` の dylib ではなく `tritium/core/build/lib/libcuemol2.dylib` (core の install 時に
  コピーされる staging 版) を `@rpath` で読む。libcuemol2 側 (gfx / qsys / renderer / shader) を変えたら
  `task build_libcuemol2` だけでは反映されず、`task build_tritium` が必要。

## 9. 既知の制約と今後
- SymmRenderer の GPU pick (外側 name = symop、Phase 3) は未実装で CPU fallback。GPU hit は CPU-only renderer
  より優先されるため、cartoon の手前にある symm コピーは報告されない。
- `hitTestRect` / `hitTestPolygon` は CPU の点リスト (cartoon の矩形選択は CA 位置基準)。ID buffer 化すれば
  `renderHit()` の点リストは GPU 対応 renderer で不要になる。
- 座標属性版 GpuPrim (`SphereGpuPrim` / `CylinderGpuPrim` / 名前無しの `LineGpuPrim`) は pick 不可
  (tritium では float data texture が常に使えるので通常この経路は通らない)。
- readback は同期 `readPixels`。async (PBO + fence) は未実装。
- hover ハイライトは §10 (pick buffer からの screen-space overlay)。カーソル変更は未実装。
- stereo (CSM_PARA / CROSS) では GPU pick を使わず CPU 経路 (hover highlight も出ない)。

## 10. hover highlight (pick ID buffer からの screen-space overlay)

hover 中の要素 (chip と同じ単位: cartoon 系は残基の帯、atom 系はその原子) を 3D view 上で
半透明の塗り + 輪郭で示す。**3D シーンは再描画しない**。

### 10.1 方式

pick ID buffer (§3.2) には「どの画素にどの renderer のどの要素が描かれたか」が既にあるので、highlight は
それを入力にした小さな pass 3 回で描ける (`PostProcGpuPrim::drawHoverMask / drawHoverMaskBlur /
drawHoverHighlight`):

```
pass 1 (pick 解像度, hover_mask_frag.glsl):  mask(p) = texelFetch(u_pickTex, p).xyz == uvec3(u_hlId)
                                             を横方向に Gaussian blur (sigma, +-radius)   -> maskRT[0]
pass 2 (pick 解像度, hover_blur_frag.glsl):  maskRT[0] を縦方向に同じ kernel で blur          -> maskRT[1]
pass 3 (画面解像度, hover_hl_frag.glsl):     s = texture(maskRT[1], uv).r  (RGBA8 LINEAR、1 sample)
    band = smoothstep(BAND_LO, ..) * (1 - smoothstep(BAND_HI, ..))   // s が Phi(-1)..Phi(+1) = 境界の +-sigma
    edge = mix(u_edgeDark, u_edgeLight, smoothstep(0.42, 0.58, s)) * band   // 外側は暗く内側は明るい二色
    fill = u_fillColor.a * smoothstep(0.45, 0.55, s)                        // s > 0.5 = 要素の内側
    out  = edge over fill (通常の alpha ブレンド)
```

二値 mask を sigma = 輪郭 1 色分の幅 (CSS 約 1.5 px を dpr と `PICK_SCALE` で pick texel に換算) で blur すると、
値 s は境界からの符号付き距離 d の `Phi(d / sigma)` になるので、閾値だけで「内側 / 輪郭帯 / 外側」が滑らかに
分かれる。pick 格子 (backing 2 px) の階段は 2 次元の blur と bilinear 参照で消える。
pass 1-2 は **pick buffer が描き直されたか (`m_pickSerial`)、hover 要素か、sigma が変わったフレームだけ** 走る
(`GUIView::drawHoverOverlay` のキャッシュ判定)。jitter の progressive フレームでは overlay の 1 sample だけ。
maskRT は RGBA8 × 2 (pick 解像度 = backing の 1/4 画素、dpr 2 の 4K 相当で約 5 MB)。
`ShaderObject` に unsigned の setter が無いので ID は `ivec3` で渡し、shader 側で `uvec3` に変換する。

**二色の輪郭**: 内側が明るい灰色 (0.95)、外側が暗い灰色 (0.1) の 2 本 (alpha 0.9) で、UI の選択枠と同じく
どんな下地の色でも片方の線がコントラストを持つ (赤い帯の上でも見える)。塗りは `ViewInputConfig::hover_hl_color`
(既定 Mol* の highlightColor 相当 (1.0, 0.4, 0.6)) を alpha 0.35 で重ねる (`GUIView.cpp` の定数)。
下の色を読んで色を変える方式 (反転 ROP) は試したが、反転色の見た目が不自然だったので採っていない。

### 10.2 present 専用フレーム (シーン再描画も jitter リセットもしない)

Mol* は marker が変わるとシーン全体と post-process を再描画し temporal multi-sample もリセットする
(`canvas3d.ts` の `markingUpdated`)。CueMol では pick buffer が既にあるので、hover 対象が変わったときは
pipeline の **最終段だけ** を保持済みの中間 RT から再実行して画面を作り直し、その上に overlay を重ねる:

```
通常フレーム (scene / camera 変更、jitter progressive):
  scene -> FrameRenderPipeline::render (最終段 = composite / FXAA / SMAA blend / jitter 表示 を StageRecord に記録)
  -> [highlight 中: sceneChanged なら pick pass] -> overlay pass -> UI DrawObj -> swap

present 専用フレーム (setHoverHit / clearHoverHit だけが起きた):
  FrameRenderPipeline::presentLast (記録した最終段 1 回 + depth blit) -> overlay pass -> UI DrawObj -> swap
```

- `GUIView::setHoverHit(rend_id, atom_id, symm_id)` / `clearHoverHit()` (View.qif) は値が変わったときだけ
  `m_bPresentDirty` を立てる。update flag は立てないので jitter 累積は続く。`needsContinuousRedraw()` が
  これを返し、rAF loop (`Scene::checkAndUpdate`) が `drawScene` を呼ぶ。
- `drawScene` 先頭の `GUIView::planFrame` (純関数) が判定する: `sceneChanged = updateFlag || jitterReset`、
  `presentOnly = presentDirty && !sceneChanged && !jitterMore && !aoHalfPending && frameCached`、
  `restartJitter = presentDirty && !presentOnly && !sceneChanged && !jitterMore` (収束済みの累積に最後の
  サンプルを二重に足さないための再開)。一回限りの要求 flag (`m_bPresentDirty` / `m_jitterResetRequested`) は
  ここで消費する (以前は `m_jitterResetRequested` が jitter 無効時に消費されず true のままだった)。
- pick buffer の dirty 規則は「scene / camera が変わったフレームだけ」に絞った (`if (plan.sceneChanged)
  m_bPickDirty = true`)。jitter の progressive フレームや AO の full-res 追従フレームでは pick pass は走らない。
- highlight 表示中は plain モード (AO / AA 無し) も pipeline を通す (AA-only composite = plain copy) ので、最終段が
  再実行できる。highlight が無いときの描画経路は従来と完全に同一。
- `FrameRenderPipeline::presentLast` は `setSize` (サイズ / AO target の変更) と `dispose` で無効になる。
  exporter (`OffScreenView`) は自前の pipeline を持ち `enablePostAA = false` なので記録しない。

コスト: hover 変更 1 回 = fullscreen pass 2 回 (最終段 + overlay)。highlight 中の通常フレームは overlay pass
1 回の追加、pick pass は scene が変わったフレームだけ (drag 中は UI 側が hover を消す)。新しい RT は無い。

### 10.3 tritium 側

- `naviHover` の引数 `highlight` (Settings の `picking.hoverHighlight`、既定 on、electron-store に永続化) が true
  なら、worker は hitTest と同じ往復で `view.setHoverHit(raw.rend_id, raw.atom_id, raw.symm_id ?? -1)` (MolCoord の
  hit) または `view.clearHoverHit()` (miss / 非分子 / 例外) を呼ぶ。`atom_id` は pick の name そのもの
  (cartoon 系でも残基 pivot 原子の ID) なので、C++ は `hoverIdToPickId` で pick texel の ID に戻す。
- hover の終了 (pane 外 / drag 開始 / view 切替 / pref off) で `useHoverInfoHandler` が `naviHoverClear` を
  1 回だけ (`{ quiet: true }`) 送る。worker はメッセージを順に処理するので、in-flight の hover 要求の後に届く。
- **context menu 中は hold**: 右押下 (`e.button === 2`) は navigation drag ではなく context menu のジェスチャなので
  hover を終了させない (左 / 中ボタンは従来どおり clear)。`useNaviContextMenu` はメニューの `await` (macOS の
  `NAVI_CTX_SHOW` / Windows・Linux の `showContextMenu`) だけを `withHoverHold`
  (`features/molview/hoverHold.ts`) で包み、hold 中の `useHoverInfoHandler` は mousemove / mouseleave で clear も
  再サンプルもせず、ポインタ位置だけ記録する。メニューが実行 / キャンセルで解決したら記録した位置で hit test を
  1 回出し直す (canvas 外に出ていれば clear)。凍結した hit を残すのではなく再サンプルするのは、`centerAt` の
  ようにビューを動かすアクションの後でもポインタ下の要素が光るようにするため。hold は context ではなく module
  state — holder (`useNaviContextMenu`) と controller (`MolViewHoverLabel` 内) は兄弟で、hold でどちらも
  再描画させない。メニュー実行後のダイアログ (`createSymmMol`) には hold を伸ばさない。
- highlight の同値判定は C++ (`setHoverHit`) 側。chip の dedupe (`hoverLabelKey`) とは独立。

### 10.4 制約

- overlay の解像度は pick buffer (backing の 0.5) のまま。dpr 1 では縁がやや粗い。`PICK_SCALE` を上げれば
  改善するが pick pass コストと RGBA32UI メモリが 4 倍になるので上げていない。
- overlay に AA (FXAA / SMAA / jitter) はかからない (最終段の後に重ねる)。縁の滑らかさは blur した mask の
  bilinear 参照によるもので、pick 解像度より細かい形状 (細い線の太さの差など) は再現しない。
- alpha <= 0.6 の renderer、CPU fallback の renderer (`*symm` 等)、stereo では highlight されない
  (pick buffer に無い)。
- highlight の単位は hit 要素のみ。残基単位で同一分子の全 renderer を光らせるには Mol* の marker texture
  相当 (原子 ID -> mark の lookup と rend -> 分子の対応) が要る (未実装)。
