# GTAO (スクリーンスペース環境遮蔽) 実装メモ

libcuemol2 の OpenGL (core profile) バックエンドに実装した、リアルタイム
**GTAO (Ground-Truth Ambient Occlusion)** の設計・実装記録。アルゴリズムは Intel
**XeGTAO** (MIT, Jimenez et al. 2016) の core 数式を fragment shader のみへ移植した
もの (compute 不使用)。本書は今後の **tritium (WebGL2) 実装**、さらに **WebGPU 化**の
際の参照を目的とする。特に「移植で必ず踏むハマりどころ」を重視して記述する。

対象ブランチ: `gtao_mrt_normal_0606` (depth-only の Phase 1 は別途 develop マージ済み)。

---

## 1. 全体パイプライン

ライブ描画 1 フレームの流れ (`qsys::GUIView::drawScene`, CSM_NONE 分岐):

```
1. scene  -> off-screen FBO (m_pAOSceneRT)  ※常にフル解像度
              COLOR0 = 色 (RGBA8) / DEPTH = 深度tex (DEPTH24) / COLOR1 = 法線 (RGBA16F, MRT)
2. GTAO   -> AO RT (m_pAoRT, RGBA8)        R=遮蔽 G=packed edges  ※aoHalfRes 時は半解像度 (§4.7)
3. denoise-> denoise RT (m_pAoDenRT)       edge-aware 3x3 blur (単一パス)  ※AO RT と同解像度
4. composite (color * AO, 半解像度時は edge-aware upsample) + post-AA -> default framebuffer  (§4.5/§4.7)
     aa_method=none: composite を直接 default fb へ
     aa_method=fxaa: composite -> m_pCompRT(LINEAR) -> FXAA -> default fb
5. depth blit (scene depth -> default fb)  UI overlay の depth test 用
6. UI overlay / 2D-UI / swapBuffers        AO/AA の影響を受けない
```

> **AA は AO 経路でのみ必要**: scene を single-sample off-screen FBO に描くため、AO 有効時は
> default FB の MSAA が効かず edge AA が失われる (非 AO 経路は従来どおり MSAA)。これを後段の
> post-process AA で補う (§4.5)。

AO を使わない (無効・stereo・FBO 非対応) 場合は従来パス (clearBuffer + display) に
フォールバックする。判定は `pScene->isAOEnabled() && hasFBO() && getStereoMode()==CSM_NONE`。

### 主要ファイル

| 区分 | パス | 役割 |
|---|---|---|
| Scene プロパティ | `src/qsys/Scene.{qif,hpp,cpp}` | `aoEnabled/aoRadius/aoIntensity/aoSlices/aoSteps/aoHalfRes` + `aa_method` (none/fxaa/smaa) + `aaJitterLevel` (.qsc にシリアライズ) |
| FBO 抽象 | `src/gfx/RenderTarget.hpp` | `RTFlags` / `RTTexUnit` / `RenderTarget` IF |
| FBO 実装 | `src/sysdep/ogl_core/OcRenderTarget.{hpp,cpp}` | MRT (color+depth+normal)、clear、blit |
| フルスクリーン描画 | `src/gfx/PostProcGpuPrim.{hpp,cpp}` | `drawGtao` / `drawDenoise` / `drawComposite` / `drawFxaa` + `struct AoConstants` |
| ライブ経路 | `src/qsys/GUIView.cpp` | `drawScene` の AO 分岐 / `ensureAORTs` / `computeAoConstants` / `cleanupAORTs` / `unloading` |
| GTAO 本体 | `src/sysdep/ogl_core/gtao_frag.glsl` | horizon 積分・法線選択・line 除外 |
| denoise | `src/sysdep/ogl_core/ao_denoise_frag.glsl` | edge-aware blur |
| composite | `src/sysdep/ogl_core/ao_composite_frag.glsl` | `color.rgb * AO` (+ 半解像度時 joint bilateral upsample) |
| post-AA (FXAA) | `src/sysdep/ogl_core/fxaa_frag.glsl` | FXAA 3.11 (§4.5) |
| 頂点 | `src/sysdep/ogl_core/postproc_vert.glsl` | 全画面トライアングル (v_uv) |
| scene shader | `trig`/`trigedge`/`sphere`/`cylinder`/`mapsurf`/`linew`/`pixdraw`/`mapmesh` | MRT 法線出力 (後述) |

---

## 2. depth → view space 復元 (projection 行列由来定数)

near/far の lerp ではなく、**実 projection 行列から導いた定数**で復元する (XeGTAO 流)。
CPU 側 (`GUIView::computeAoConstants`) で算出し `AoConstants` (vec2 uniform 群) として渡す
(mat uniform 制約に抵触しない)。

```
viewZ      = u_depthUnpack.x / (u_depthUnpack.y - rawDepth)   // 正の線形距離
viewPos.xy = (u_ndcToViewMul * uv + u_ndcToViewAdd) * viewZ
```

CueMol の perspective (`makePersProjMat`, t = dist/(zoom/2)) から:
```
depthLinearizeMul = far*near/(far-near)   depthLinearizeAdd = far/(far-near)
tanHalfFOVY = (zoom/2)/dist               tanHalfFOVX = aspect * tanHalfFOVY
```

**GL 固有の座標系** (移植時に最重要):
- GL の window depth は `[0,1]` (`glClipControl` 既定)。上式はそのまま成立し handedness
  反転は不要。
- `postproc_vert` の `v_uv` は **bottom-up** (左下原点)。よって
  `NDCToViewMul = (2*tanHalfFOVX, +2*tanHalfFOVY)`, `NDCToViewAdd = (-tanHalfFOVX, -tanHalfFOVY)`。
  Y 符号は XeGTAO (DX, top-down) と**逆**。
- horizon march の方向ベクトルも `omega = (cosPhi, +sinPhi) * r` (XeGTAO は `-sinPhi`)。

> WebGL2/WebGPU 移植時: UV 原点と clip-space depth レンジ ( `[0,1]` か `[-1,1]` か) を
> 必ず確認し、`NDCToView` の Y 符号と depth 線形化式を合わせること。WebGL は GL と同じ
> bottom-up・`[0,1]` 窓深度。WebGPU は clip-space `z in [0,1]`、フレームバッファ Y は
> top-down なので符号が変わる。

`u_debugMode==1` (法線を RGB 表示) / `==2` (線形 depth) で座標系を目視検証できる。

---

## 3. GTAO 本体 (`gtao_frag.glsl`)

XeGTAO MainPass (Jimenez Algorithm 1) の逐語移植。slice ごとに directionVec /
orthoDirectionVec / axisVec / projectedNormalVec を作り `n = signNorm*acos(cosNorm)`、step
ごとに `s = pow((step+stepNoise)/steps, 2.0) + minS`、`horizonCos = max(...)`、arc 積分
`iarc = (cosNorm + 2h*sin(n) - cos(2h-n))/4` を両 horizon 合算。最後に
`visibility /= sliceCount; visibility = pow(max(visibility,0), finalValuePower); visibility = max(0.03, ...)`。

要点:
- **point sampling 必須**: depth/AO/normal/edge は全て NEAREST + CLAMP_TO_EDGE。linear
  filtering は packed データを壊す。
- ノイズ 2 段: per-pixel = interleaved gradient noise (IGN, blue-ish で denoise しやすい)、
  per-step = golden-ratio。slice 数=角度サンプル=ノイズ量、step 数=半径サンプル、
  effectRadius=広がり (world 単位) を**独立**に制御。
- **screenspaceRadius クランプ (256px)**: depth MIP を持たないため、ズームイン時に
  world 半径が巨大な画面半径に化けてキャッシュスラッシュ→コマ落ちする。クランプして
  effectiveRadius を逆算し falloff の一貫性を保つ。

### edges + denoise
MainPass が `calculateEdges` (slope 調整 + `saturate(1.25 - e/(z*0.011))`) と PackEdges を
AO RT の G に出力し、`ao_denoise_frag.glsl` が edge をアンパックして対称化した 3x3 加重
blur を行う (単一パス)。低 slice + TAA 無しでは denoise 必須だが、過剰な blur は凸面の
broad AO を白側へ薄めるので blurAmount は控えめ。

---

## 4. MRT geometry 法線 (Phase 3)

depth から有限差分で復元した法線は tessellation メッシュ (tube/cartoon = trig) で
**ファセット**になりポリゴン境界が陰影として目立つ。これを解消するため、**scene の各
fragment shader が eye-space 法線を MRT COLOR1 へ出力**し、GTAO がそれを直接使う
(XeGTAO の "normals provided" モードに相当)。

### 設計
- scene FBO に `RT_NORMAL_RGBA16F` を追加 (COLOR1)。clear は color0=背景色 / 法線=sentinel
  `(0,0,0)` に分離 (`glClearBufferfv`)。
- **全 in-scene shader**が `layout(location=1) out vec4 o_Normal` を出力:
  - 実法線: `trig`/`trigedge`/`mapsurf` (VS の eye-space 法線を varying で渡す)、
    `sphere`/`cylinder` (FS の per-pixel impostor 法線)。
  - sentinel `(0,0,0)`: `linew`/`pixdraw`/`mapmesh` (法線を持たない primitive)、impostor の
    silhouette edge。
  - 未出力ピクセルは GL 仕様上 undefined になるため、**法線アタッチメントを持つ FBO に
    描く shader は全て location=1 に書く**こと。
- `gtao_frag` の `selectNormal`: 法線が sentinel なら depth 復元へフォールバック、実法線なら
  使用。

### 座標変換 (eye-space → GTAO 空間)
scene の eye-space 法線は **+Z がカメラ向き** (front-facing、`flight2` に渡すものと同じ)。
GTAO 積分空間は `vz>0` が前方 = カメラ方向 `V` は `z<0`。よって変換は **Z 反転のみ**:
`N = normalize(vec3(n.x, n.y, -n.z))`。その後、grazing/裏面 (`dot(N,V)<0`) を
**反転ではなく可視半球へ折り込む** (`N - 1.01*dot(N,V)*V`)。ハードフリップは silhouette で
面内成分を反転させバンディングを生む。

### line/label を AO 的に "ghost" 化
線・ラベルは sentinel 法線を使い:
1. **影を受けない**: 中心ピクセルが sentinel なら `AO=1` で早期 return。
2. **影を落とさない**: horizon サンプル先が sentinel ならそのサンプルの weight を 0 に
   する。`weight>0` のサンプルのみ法線 fetch して等価のまま高速化。

---

## 4.5 post-process AA (FXAA)

AO 経路は scene を **single-sample** off-screen FBO に描くため、MSAA がバインド中の FBO の
サンプル数で決まる以上、AO 有効時は edge AA が一切効かない (非 AO 経路は default FB の MSAA
がそのまま効く)。失われた AA を **AO の後段で独立にかける** (AO と AA は直交)。

### 設計: Mol* 流の 2 直交軸
- **軸1 = 空間 AA メソッド**: `Scene.aa_method` enum (`none`/`fxaa`/`smaa`)。差し替え可能な
  fragment ポストパスとして実装。**FXAA と SMAA 1x を実装済み**。
- **軸2 = temporal jitter SS** (実装済み): projection を per-frame で subpixel jitter し、
  静止時のみ accumulation buffer に蓄積、カメラ変化でリセット (motion vector 不要)。`§4.6`。

### FXAA パス (`fxaa_frag.glsl`, `PostProcGpuPrim::drawFxaa`)
- `aa_method=fxaa`: composite を **LINEAR の中間 RT** (`m_pCompRT`, RGBA8) へ描き、FXAA が
  それを読んで default FB へ書く。`aa_method=none` は composite を default FB へ直書き (従来挙動)。
- FXAA は Lottes FXAA 3.11 相当・**1 パス・lookup texture 不要**。luma は RGB から算出
  (`sqrt(dot(rgb, vec3(0.299,0.587,0.114)))`)。`textureOffset` ベースで desktop GL core /
  **WebGL2 GLSL ES 3.00 双方へ移植可**。
- **中間 RT は LINEAR 必須** (`RT_COLOR_RGBA8` のみ、NEAREST フラグ無し)。FXAA のサブテクセル
  sampling に不可欠。
- AA は overlay/2D-UI の **前** に走るので UI 文字はぼけない。

### SMAA 1x パス (`smaa_{edges,weights,blend}_frag.glsl`, `PostProcGpuPrim::drawSmaa*`)
- `aa_method=smaa`: composite を `m_pCompRT` へ描いた後、3 パス:
  edges (`m_pSmaaEdgeRT`, clear 必須) → weights (`m_pSmaaWeightRT`, clear 必須) →
  blend (default FB)。GUIView が RT bind/unbind を編成。
- **Mol* (three.js SMAA 2.8, MIT) からの移植**。Mol* は WebGL(bottom-up) 向けに Y 符号を
  調整済みで、CueMol の GL も bottom-up のため**そのまま適用**。offset は専用 VS の代わりに
  各 fragment shader 内で `v_uv`/`u_rcpFrame` から算出し `postproc_vert` を共用。
- **lookup texture**: AreaTex (160x560 RG8, LINEAR) と SearchTex (66x33 R8, NEAREST) を
  `share/data/textures/smaa_{area,search}.dat` として同梱。**Mol* の base64 PNG を offline
  デコードして生成** (R/G チャンネル抽出。`UNPACK_FLIP_Y=false` の Mol* 挙動に合わせ flip 無し)。
  PNG decoder は持たないため raw データ同梱とした。
- **data-texture インフラ**: CPU バイト列→sampler を作る汎用 `gfx::DataTexture` /
  `sysdep::OcDataTexture` を新設 (`DisplayContext::createDataTexture[FromFile]`)。FBO 専用の
  `RenderTarget` とは別系統 (R8/RG8・LINEAR/NEAREST・CLAMP)。
- FXAA より silhouette/色境界の品質が高い。コスト = 中間 RT 2 枚 + lookup 2 枚 + 3 パス。

### なぜ hardware MSAA (case B) を採らないか (重要)
「scene FBO を MSAA 化し GTAO は sample0 を texelFetch、color は MSAA resolve」案は不採用:
- **XeGTAO 自体が MSAA depth 非対応** (`vaGTAO.cpp` で `SampleCount()==1` を assert)。
- **WebGL2 は `sampler2DMS` / multisample texture / per-sample texelFetch を持たない**。
  sampleable な MRT 法線 (§4) を MSAA で保持できず、desktop 専用シェーダ分岐になり「OpenGL と
  WebGL2 で同一 fragment shader を 1 本維持」という方針 (§8) を崩す。
- **Mol*** (WebGL ベース分子ビューア) も hardware MSAA を使わず post-AA を既定 (SMAA) に
  している (`mol-canvas3d/passes/postprocessing.ts`)。tritium 行きの CueMol が取るべき道の傍証。

## 4.6 temporal jitter supersampling (軸2)

カメラ静止中に投影をサブピクセル jitter して複数フレームを蓄積する真の SS (Mol*
`multi-sample.ts` の temporal 相当)。各サンプルは軸1 (none/fxaa/smaa) で描かれ、その最終色を
平均する。フル TAA (motion vector 再投影) ではなく、動いたらリセットする「静止時 SS」。

### 制御
- `Scene.aaJitterLevel` (0=off, 1..5 → 2/4/8/16/32 サンプル)。AO 経路・CSM_NONE のみ。
- jitter オフセット表は Mol* JitterVectors (1/16px 単位) を `GUIView.cpp` に複製。

### 1 フレーム (jitterActive 時)
```
reset 判定 (getUpdateFlag()=カメラ変更 / forceRedraw override=シーン編集) → sampleIndex=0
setUpProjMat に当該サンプルの subpixel offset を注入 (perspective=射影の z 列, ortho=平行移動列)
scene→GTAO→denoise→composite→(none/fxaa/smaa) の最終色を m_pJitterSampleRT へ
accumRT(RGBA16F) に additive blend で sample*(1/N) を加算 (sampleIndex==0 で clear)
accumRT*(N/(sampleIndex+1)) を default FB へ表示 (部分和の正規化平均)
sampleIndex++ / 収束で停止
```

### idle 駆動 (核心)
- `View::needsContinuousRedraw()` (新規 virtual, 既定 false) を `GUIView` が override し、未収束の
  間 true。`Scene::checkAndUpdate` else 分岐が `getUpdateFlag() || needsContinuousRedraw()` で
  drawScene を駆動 → 静止中に N フレーム蓄積し、収束で停止 (恒常ループにならない)。
  uxp_gui の idle (`SceneManager::doIdleTask`→`checkAndUpdateScenes`) / tritium の RAF 両対応。
- **罠**: checkAndUpdate は drawScene 直後に update flag を必ずクリアするので、drawScene 内から
  setUpdateFlag しても次フレームは来ない。継続は needsContinuousRedraw 経由で行う。
- リセット: カメラ変更は view update flag → drawScene 内 `getUpdateFlag()` で検知。シーン編集は
  scene flag → `GUIView::forceRedraw` override (`m_jitterResetRequested`) で検知。

### 新規インフラ
- `RT_COLOR_RGBA16F` (color0 を float 化; 8bit 蓄積のバンディング回避)。
- `DataTexture` とは別に accum/sample RT。`DisplayContext::setBlendModeAdd` (加算 blend)。
- `jitter_compose_frag.glsl` (`PostProcGpuPrim::drawJitterCompose`, sample*weight)。

### 既知の制限 / 将来
- AO は毎サンプル再計算 (Mol* reuseOcclusion 最適化は未実装 = 重いが正しい)。
- フル TAA (動作中 AA)、hold バッファによるフリッカ低減、非 AO 経路統一、stereo は未対応。

---

## 4.7 半解像度 AO (負荷削減)

GTAO の fragment コストは **AO バッファのピクセル数に比例**する (1 ピクセルあたり数十回の
depth fetch + horizon march)。`aoHalfRes` を有効にすると GTAO + denoise を **半解像度
(1/2×1/2 = 1/4 ピクセル)** で計算し、composite で **edge-aware upsample** してフル解像度へ
戻す。GTAO + denoise のコストが約 1/4 になる。

### adaptive (drag=half / idle=full / export=full)
`aoHalfRes` は「常に半解像度」ではなく jitter SS (§4.6) と同じ idle 機構で **adaptive** に効く:
- **カメラ移動中 (drag)** = `getUpdateFlag()` true のフレームだけ半解像度 → レスポンス優先。
- **静止 (idle)** = 続く continuous-redraw フレーム (`getUpdateFlag()` false) でフル解像度に描き直す
  → 静止画の品質を担保。
- **off-screen export** (`renderAOColorFrame`) は `getUpdateFlag` を見ず **常にフル解像度**
  (half-res はライブ操作の最適化であって品質設定ではない)。
- off (既定) = 常にフル解像度 (従来挙動)。

half フレームを描いた後にフル解像度の追い描きへ idle ループを継続させるため、
`needsContinuousRedraw()` を `m_jitterMoreSamples || m_aoHalfPending` とする。`m_aoHalfPending`
は「この frame は half で描いたので full の追い描きが要る」フラグで、jitter OFF でも idle 追い描き
が 1 回発火する (jitter ON なら jitter 蓄積が同じ idle ループを既に回す)。

### 何を半解像度にするか
- **半解像度**: `m_pAoRT` / `m_pAoDenRT` (GTAO 項 + packed edges) のみ。`ensureAORTs(w,h,halfRes)`
  が `(w+1)/2, (h+1)/2` で確保する。`resize()` は no-op 判定があるので runtime トグル追従可。
- **フル解像度のまま**: `m_pAOSceneRT` (色・深度・法線)。composite と upsample に full-res depth が
  要るため。`m_pCompRT` / SMAA 中間 RT もフル解像度。

### ピクセルサイズの受け渡し (`AoConstants`)
- `viewportPixelSize` = 出力 (フル) の 1/size。`aoTexelSize` = AO バッファの 1/size。
- GTAO / denoise には `viewportPixelSize = aoTexelSize` にした **コピー (`aocAO`)** を渡す。GTAO の
  `screenspaceRadius` / edge / サンプルオフセットは全て pixel size 基準なので、半解像度の pixel
  size を渡すだけで world 半径のカバレッジは自動で保たれる (数式変更不要)。
- composite には元の `aoc` (フル `viewportPixelSize` + 半解像度 `aoTexelSize`) を渡す。
  `u_upsample` は `aoTexelSize > viewportPixelSize*1.5` で判定 (フル解像度では false)。

### edge-aware upsample (halo 防止の肝, `ao_composite_frag.glsl`)
naive bilinear だと深度不連続 (シルエット) で AO が滲んで halo が出る。**nearest-depth
upsample ハイブリッド** (NVIDIA 系の定番) で防ぐ:
- 各 full-res ピクセルで自身の線形 depth `zC`、および周囲 4 つの half-res texel の AO 値 `a00..a11`
  と線形 depth `z00..z11` を full-res depth から求める。
- 4 tap の depth spread `zmax-zmin` を `threshold = max(|zC|,eps)*0.03` と比較:
  - **spread ≤ threshold (平坦面)**: 通常の bilinear 加重平均 (滑らか)。
  - **spread > threshold (シルエット)**: `zC` に **depth が最も近い 1 tap の AO をそのまま採用**。
    跨ぎ tap を一切混ぜないので halo が原理的に出ない。
- 初版は soft な joint bilateral (`exp(-|zC-zi|/range)`) だったが、指数重みは跨ぎ tap を完全に
  ゼロにできず前景輪郭に背景の明るい AO が滲んで halo が残ったため、nearest-depth に変更した。
- half-res texel の depth は別 RT に保存せず full-res depth を texel 中心で読み直して近似する
  (追加 RT 不要)。
- トレードオフ: グレージング (斜め) で連続的な面でも spread が大きいと nearest-depth 側に倒れて
  AO がややブロック状になりうるが、AO は低周波なので halo より目立たない。

### 相互作用
- **jitter SS (§4.6)**: 半解像度 GTAO の粗いノイズも jitter 蓄積 + `aoNoiseOffset` 回転で平均化
  されるので相性良。export 経路 (`renderAOColorFrame`) も同じ composite を通るので半解像度が効く。
- **post-AA (§4.5)**: FXAA / SMAA はフル解像度の composite 出力に掛かるので影響なし。
- **非回帰**: `aoHalfRes=false` で `aoTexelSize == viewportPixelSize`、`aocAO == aoc`、
  `u_upsample=0` となり従来と完全同一。既定 false (opt-in)。

---

## 5. 移植で必ず踏むハマりどころ (最重要)

Apple M2 / Metal バックエンド OpenGL 4.1 + MSAA x4 の実機で、以下を順に踏んだ。WebGL2 /
WebGPU でも形を変えて再発しうるので、移植前に必ず設計へ織り込むこと。

1. **グローバル `GL_BLEND` が MRT の全 draw buffer に適用され法線 COLOR1 を破壊する。**
   `OcView::setup` が色パス用に `glEnable(GL_BLEND)` している。blend 状態は全カラー
   アタッチメントに掛かるため、法線 (alpha-composite すべきでない量) がブレンドされ壊れる。
   - 症状: impostor の誤陰影、メッシュに**回転で動く黒ごま塩ノイズ** (両面リボンの裏面
     法線が z-fight で勝つフレームで AO が真っ黒)。
   - 対策: 法線 MRT 対象の bind/unbind 中だけ **`glDisablei(GL_BLEND, 1)`** で draw buffer 1
     のブレンドを無効化 (`OcRenderTarget::bind/unbind`)。
   - **WebGL2 注意**: per-draw-buffer のブレンド有効/無効は core に無い
     (`OES/EXT_draw_buffers_indexed` 拡張が必要)。拡張が無ければ「不透明 MRT パス中は
     `GL_BLEND` 自体を無効化する」「半透明を別パスにする」等の設計が要る。
   - **WebGPU**: ブレンドは render pipeline 記述子で**ターゲット毎**に設定するため、法線
     ターゲットだけ blend 無しにできる (クリーン)。

2. **vec4/vec3 混在 MRT 出力を Apple GL が誤処理し、output 0 を全ターゲットへブロード
   キャストする。** → `o_Normal` を **vec4** で宣言し、color 出力 (vec4) と要素数を揃える。

3. **`GL_RGB16F` は color-renderable 保証が無い。** FBO completeness が通っても書き込みが
   化ける環境がある。法線は **`RGBA16F`** で確保 (`RT_NORMAL_RGBA16F`)。

4. **point sampling**: 全ての packed/法線/depth テクスチャは NEAREST + CLAMP。

5. **shader `#version`** は `GL_SHADING_LANGUAGE_VERSION` から動的決定 (`OglProgramObject`)。
   macOS Core 4.1 → `#version 410`。WebGL2 は GLSL ES 3.00、WebGPU は WGSL なので shader を
   それぞれ書き分ける。

### デバッグ手法 (再発時に有効だった切り分け)
`u_debugMode` に「UV グラデーション (パイプライン生存確認)」「raw 法線バッファ表示」を一時
追加し、composite を乗算ではなく直接表示に差し替えて COLOR1 の中身を可視化。さらに scene
shader の `o_FragColor`/`o_Normal` に定数 (マゼンタ/緑) を焼いて「どのバッファに何が
入っているか」「shader が実機で更新されているか」を確定。`glGetFragDataLocation` のログで
output location も確認。これらで「location は正しい→書き込みが blend で壊れている」と特定
できた。

---

## 6. Scene プロパティ (チューニング可能化)

`.qsc` にシリアライズされる Scene プロパティで調整可能 (UI で preset 化可能)。

| プロパティ | 既定 | 意味 |
|---|---|---|
| `aoEnabled` | false | AO 有効化 |
| `aoRadius` | 4.0 | effectRadius (world 単位、広がり) |
| `aoIntensity` | 2.2 | finalValuePower (コントラスト) |
| `aoSlices` | 9 | 角度サンプル数 (= 基本ノイズ量) |
| `aoSteps` | 3 | スライスあたり半径サンプル数 (大半径のバンディング) |
| `aoHalfRes` | false | adaptive 半解像度 GTAO: drag 中 half / idle full / export 常に full (負荷削減, §4.7) |
| `aa_method` | fxaa | post-process AA (none/fxaa/smaa, §4.5) |
| `aaJitterLevel` | 0 | temporal jitter SS レベル (0=off, 1..5=2..32 枚, §4.6) |

FalloffRange / SampleDistributionPower / RadiusMultiplier 等の XeGTAO ヒューリスティックは
shader 定数のまま (必要なら同様に Scene プロパティへ昇格できる構造)。

---

## 7. GPU リソースのライフサイクル

`OcRenderTarget` / `PostProcGpuPrim` (VBO) のデストラクタは
`SceneManager::getViewS(viewID)->getDisplayContext()->setCurrent()` で**自分で GL context を
ガード**する。`GUIView::cleanupAORTs` からは `getDisplayContext()` を呼ばない (派生 view
破棄後は pure virtual call で落ちる)。GL リソースは context が生きている
`View::unloading()` (Scene::unloading から呼ばれる) で解放する。

---

## 8. 今後の展開で参考になる点

### tritium (WebGL2) への展開
- `gfx_manager.ts` の FBO peer に COLOR1 (法線, RGBA16F) を追加、`ElecDisplayContext` に
  `enableAO` と AO 定数 (AoConstants) の peer ブリッジを足す。
- GLSL を **GLSL ES 3.00** へ移植 (`in/out`、`texture()`、precision 修飾)。
- WebGL2 は MRT (`drawBuffers`) が core。ただし**§5-1 のブレンド問題**に注意 (per-draw
  blend disable は拡張)。不透明 scene を AO FBO に描く間は blend off にするのが無難。
- 既存の depth-only パス (色+深度のみの単一 color FBO) は WebGL2 でも素直に動くので、まず
  depth-only GTAO を載せ、その後 MRT 法線を足すと切り分けやすい。

### WebGPU 化
- ブレンドが render pipeline 記述子のターゲット毎設定なので **§5-1 が構造的に解消**する
  (法線ターゲットを blend 無しで宣言)。MRT・RGBA16F も素直。
- **compute shader が使える**ので、本来の XeGTAO の compute 3 パス (PrefilterDepths で
  linear-Z + depth MIP → MainPass → Denoise) を載せられる。depth MIP による per-sample
  `mipLevel` でワイド半径のノイズ/コストを改善でき、現状の screenspaceRadius クランプの
  ような妥協が不要になる。bent normals / TAA も視野に入る。
- 座標系: clip-space depth は `[0,1]` で GL と同じだが、**フレームバッファ Y が top-down**
  なので §2 の `NDCToView.y` 符号と horizon march の `sinPhi` 符号を反転する必要がある
  (DX/XeGTAO 側に近くなる)。
- shader は WGSL へ全面書き換え。数式 (horizon 積分・arc) は言語非依存なのでそのまま移せる。

### 共通の未実装/将来最適化 (現状スコープ外)
- depth MIP チェーン (prefilter パス) によるワイド半径の高速化・低ノイズ化。
- bent normals、TAA。

(半解像度 AO + edge-aware upsample は §4.7 で実装済み。)

### AA ロードマップ (§4.5/§4.6 の続き)
- **フル TAA**: motion vector 再投影で動作中も AA。reuseOcclusion 最適化、hold バッファ。
- **全経路統一**: 非 AO 経路も offscreen+post-AA/jitter に通し AA を context MSAA 非依存にする
  (tritium と整合)。現状は AO 経路のみ、非 AO は default FB MSAA。stereo 対応。

---

## 9. XeGTAO ソース / 原論文との対応

移植元:
- **XeGTAO** (Intel, MIT): <https://github.com/GameTechDev/XeGTAO>
  - `Source/Rendering/Shaders/XeGTAO.hlsli` — core 数式 (本書では `hlsli` と略記)
  - `Source/Rendering/Shaders/XeGTAO.h` — 定数導出・既定値 (`XeGTAO.h`)
  - `Source/Rendering/Shaders/vaGTAO.hlsl` — エントリ / 法線生成 / ノイズ (`vaGTAO`)
- **原論文** Jimenez, Wu, Pesce, Jarabo, *"Practical Real-Time Strategies for Accurate
  Indirect Occlusion"*, SIGGRAPH 2016 (Activision):
  <https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf>

> 行番号は本リポジトリに置いた XeGTAO スナップショット時点のもの。upstream の更新でずれ得る
> ため、関数名で参照すること。CueMol は HLSL/compute → GLSL/fragment へ移したので、構造は
> 対応するが API (RWTexture/groupshared 等) は持たない。

### 対応表 (CueMol 実装 → XeGTAO → 論文)

| CueMol (`gtao_frag.glsl` 等) | XeGTAO | 論文 |
|---|---|---|
| `linearizeZ()` (`viewZ = mul/(add - d)`) | `XeGTAO_ScreenSpaceToViewSpaceDepth` (hlsli:112)、定数は `XeGTAO.h:175` | Sec. 3「Algorithm overview」の depth→view 復元 |
| `viewPos()` (`(ndcToViewMul*uv+add)*vz`) | `XeGTAO_ComputeViewspacePosition` (hlsli:104) | 同上 |
| `computeAoConstants()` (`GUIView.cpp`) | `XeGTAO.h:175-195` (`DepthUnpackConsts`/`NDCToViewMul`/`Add`) | — (実装詳細) |
| `reconstructNormal()` (depth 復元法線) | `XeGTAO_CalculateNormal` (hlsli:143)、`XeGTAO_ComputeViewspaceNormal` (vaGTAO:153) | HBAO 系の depth-from-normal 近似 |
| stored 法線 (`selectNormal`, MRT) | `XeGTAO_MainPass` の `viewspaceNormal` 引数 = `LoadNormal` (vaGTAO:53,105) | Algorithm 1 の入力法線 n |
| `calculateEdges()` | `XeGTAO_CalculateEdges` (hlsli:120) | Sec. 4「Spatial/temporal denoising」の edge 検出 |
| `packEdges()` / denoise の `unpackEdges()` | `XeGTAO_PackEdges` (hlsli:132) / `XeGTAO_UnpackEdges` (hlsli:686) | 同上 |
| **horizon 積分ループ** (slice/step) | `XeGTAO_MainPass` (hlsli:245-575)、slice ループ ~hlsli:380- | **Algorithm 1**「Horizon-based visibility」 |
| `n = signNorm*acos(cosNorm)`、projectedNormalVec | hlsli:~400-406 | 法線をスライス平面へ射影し基準角 n を取る件 |
| `s = pow((step+stepNoise)/steps, 2.0)+minS` | `sampleDistributionPower` 適用 (hlsli MainPass) | Sec.「小さな凹部を重視」= SampleDistributionPower |
| `weight = saturate(dist*falloffMul+falloffAdd)` | `falloffMul`/`falloffAdd` (hlsli MainPass) | 距離フォールオフ |
| **arc 積分** `iarc=(cosNorm+2h*sin(n)-cos(2h-n))/4` | hlsli:542-543 (`iarc0`/`iarc1`) | **視認性積分の閉形式解** (Sec. 3、cosine 重み付き弧の解析積分) |
| `visibility/=sliceCount; pow(.,finalValuePower); max(0.03,.)` | hlsli:~558 + `FinalValuePower` | スライス平均と最終トーン補正 |
| `ao_denoise_frag.glsl` (3x3 edge-aware blur) | `XeGTAO_Denoise` (hlsli:734) / `XeGTAO_AddSample` (hlsli:704) | Sec. 4「Spatial denoising」 |
| denoise の `diagWeight=0.425` | `diagWeight = 0.85*0.5` (hlsli:737) | 同上 (対角サンプル重み) |
| `omega=(cosPhi,+sinPhi)*r` (**+sinPhi**) | `lpfloat2(cosPhi,-sinPhi)` (hlsli:~378) | スライス方向。符号差は GL(bottom-up) vs DX |
| IGN ノイズ + per-step golden ratio | `SpatioTemporalNoise` (Hilbert+R2, vaGTAO:74) | Sec. 4 のノイズ。CueMol は TAA 無しなので別ノイズ |

### 既定値 (XeGTAO と一致)
`RadiusMultiplier 1.457` / `FalloffRange 0.615` / `SampleDistributionPower 2.0` /
`ThinOccluderCompensation 0.0` / `FinalValuePower 2.2` は `XeGTAO.h:107-112` の
`XE_GTAO_DEFAULT_*` をそのまま採用 (一部は shader 定数に焼き込み)。品質プリセット
(slice,step) も XeGTAO の Low(1,2)/Medium(2,2)/High(3,3)/Ultra(9,3) (vaGTAO:105-129) に対応し、
CueMol の既定 `aoSlices=9, aoSteps=3` は **Ultra 相当**。

### 意図的に落とした/変えた部分 (各々の意図・理由)

- **compute 3 パス → fragment 1 系列** (`CSPrefilterDepths16x16`/`CSGTAO*`/`CSDenoise*`,
  vaGTAO:95-146 → 全画面 fragment パス)。groupshared MIP 縮約・fp16 (`lpfloat`)・RWTexture
  出力は持たない。
  - **なぜ**: CueMol が対象とするバックエンドのうち **WebGL2 は compute shader を一切持たない**
    (tritium の描画は WebGL2)。OpenGL と WebGL2 で**同一アルゴリズムを 1 つ**維持するには
    fragment-only が必須。compute 固有最適化は fragment では表現できないので必然的に落ちる。
    将来 WebGPU では compute が使えるので本来の 3 パス版に寄せられる (§8)。

- **depth MIP チェーン未実装** (`XeGTAO_PrefilterDepths16x16` / `XeGTAO_DepthMIPFilter`,
  hlsli:579-680、per-sample `mipLevel` を省略 → screenspaceRadius を 256px クランプで代替)。
  - **なぜ**: MIP prefilter は groupshared を使う compute 前提 (または多パス) で、上記の
    fragment-only 方針と相反する。本来は**広半径時のノイズ/帯域**を改善する最適化だが、
    初版では複雑さに見合わないと判断。問題の実害は「ズームインで画面半径が巨大化し
    キャッシュスラッシュ→コマ落ち」なので、より安価な **半径クランプ**で実用上の崖だけ
    潰した。MIP は WebGPU/compute 化時の宿題 (§8)。

- **bent normals 未実装** (`XE_GTAO_COMPUTE_BENT_NORMALS` ブロック = Algorithm 2 拡張,
  hlsli:545-552、`EncodeVisibilityBentNormal` を省略)。
  - **なぜ**: bent normal は**間接光/スペキュラ遮蔽の指向性**を上げる拡張で、エンコード/
    デコードと格納が増える。CueMol の合成は「環境光に AO スカラを乗算」する単純なもので、
    指向性情報を消費する経路が無い。コストだけ増えて得が無いためスコープ外。

- **TAA/時間ノイズ無し** (Hilbert+R2 の `SpatioTemporalNoise`, vaGTAO:74 → IGN を使用)。
  - **なぜ**: CueMol に**時間蓄積の基盤が無い** (motion vector も history buffer も無く、構造を
    眺める間カメラ静止が多い対話描画)。XeGTAO のノイズは TAA で**フレーム間収束**させる前提で、
    TAA 無しでは規則的な静止ノイズに見えてしまう。**IGN は青ノイズ寄り**で単一フレームの空間
    denoise と相性が良く、slice 数を上げて補えば TAA 無しでも実用域になる。

- **DX→GL 座標系** (`NDCToView` Y 符号 `XeGTAO.h:181-182` の `*-2/*1` → CueMol `*+2/*-1`、
  horizon march の `sinPhi` 符号反転)。
  - **なぜ**: これは選択ではなく**ターゲット API の必然**。XeGTAO は D3D (top-down FB Y) 前提、
    CueMol の OpenGL は bottom-up UV。符号を合わせないと AO が上下反転/破綻する。WebGPU は
    FB Y が top-down に戻るため、移植時にこの符号を**再反転**する点を明記してある (§8)。

- **AO 項を RGBA8 の R に直接出力** (XeGTAO の visibility+bentNormal を uint へ pack する
  `XeGTAO_EncodeVisibilityBentNormal` を使わない)。
  - **なぜ**: bent normal を持たず compute scatter も無い (上記) ので、uint パッキングの必要が
    無い。スカラ AO は素の R チャンネルで十分かつ移植が容易。pack は省くほどシンプルで安全。

- **法線は MRT geometry 法線を主とし、sentinel で depth 復元へフォールバック** (XeGTAO は
  通常 `XeGTAO_CalculateNormal` の depth 復元かエンジン G-buffer 法線, §4)。
  - **なぜ**: これは CueMol 固有の**品質要件**。分子表示は impostor (球/円柱) が多く真の
    per-pixel 法線を持ち、tessellation メッシュ (cartoon) では depth 復元法線が**ファセット**化
    して境界が目立つ (Phase 3 を起こした動機そのもの)。実 geometry 法線を使うとこれが解消する。
    一方、線・ラベルなど法線を持たない primitive は sentinel で除外でき、AO 的に "ghost" 化
    (影を受けない/落とさない) も同じ仕組みで実現できる。
