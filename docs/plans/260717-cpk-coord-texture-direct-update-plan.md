# 実装計画: CPK renderer の座標テクスチャによる direct update (Phase 1) と MD Trajectory (Phase 2)

分子座標が毎フレーム変化する表示 (morphing / MD trajectory) を、ジオメトリの全再構築なしに実現する。座標を GPU の 2D データテクスチャに置き、頂点シェーダが原子 index でフェッチしてインポスタを展開する。

**Phase 1 のマイルストーン: CPK 表示のみ・renderer/GL 層のみで direct update を成立させ、既存の MorphMol 再生で効果を実測する。** この段階では `MolCoord` / `MolAtom` / `MorphMol` / `AnimMgr` を一切変更しない。

Phase 2 で `AnimMol` と `Trajectory` を導入し、MD trajectory の realtime 表示へ進む。

---

## 0. 前提・規約

- **コードコメントは英語**、本ドキュメント等の markdown は日本語 (リポジトリ全体の規約)。コメントに `─` 等の非 ASCII 文字を含めない。
- ソースコード中の文字列は基本的に英語。
- コミットメッセージは英語。`Co-Authored-By` 行を含めない。
- ビルド/テストは `Taskfile.yml` の task があればそれを用いる。
- 本計画は **2 つの独立したリポジトリ作業ツリー**を参照する。混同しないこと。

| 役割 | パス | ブランチ | 位置づけ |
|---|---|---|---|
| **実装先** | `/Users/user1/proj64/cuemol2` | `develop` | CMake ビルド。tritium (Electron/WebGL2) を含む現行本流 |
| **参照実装** | `/Users/user1/proj64/cuemol2_png` | `dev201608` | autotools ビルドの 2016-2018 年レガシーブランチ。**読むだけ。変更しない** |

両者は同一 origin (`github.com:CueMol/cuemol2`) の別ブランチで、分岐点は `2bdc93e2` (2018-05-23)。`dev201608` は develop に**マージされていない**。以降、本書で「参照実装」と書いたら `/Users/user1/proj64/cuemol2_png` 内のパスを指す。

---

## 1. 目的とマイルストーン

### 解決する問題

現在、分子座標が変化すると **ジオメトリが毎フレーム全再構築される**。連鎖は以下の通り (すべて develop で確認済み):

```
MorphMol::update()                         src/modules/anim/MorphMol.cpp:514-527
  → 全原子 pAtom->setPos(pos) ループ
  → fireAtomsMoved()                       src/modules/molstr/MolCoordGeomImpl.cpp:256-263
      → ObjectEvent{OBE_CHANGED, descr="atomsMoved"}
  → DispCacheRenderer::objectChanged()     src/qsys/DispCacheRenderer.cpp:71-86
      → invalidateDisplayCache() + invalidateHittestCache()
  → CPK2Renderer::invalidateDisplayCache() src/modules/molvis/CPK2Renderer.cpp:73-77
      → m_sphGpuPrim.invalidate()
  → 次の display() で isValid()==false
  → renderShaderImpl() で全再構築         src/modules/molvis/CPK2Renderer.cpp
      (AtomIterator 走査 + 色解決 + バッファ再確保 + 全頂点書き込み)
```

`docs/../tritium/docs/architecture/buffer-alloc-routing.md` の実測では、frame 0 の 210.20ms のうち **C++ レンダラのジオメトリ生成が 172.27ms (約 82%)** を占める。座標が変わるたびにこのクラスのコストを払っている。

### Phase 1 のゴール

- 座標を 2D float テクスチャに置き、頂点シェーダが原子 index でフェッチする経路を **CPK 表示のみ**で成立させる
- 座標変化時に `renderShaderImpl()` を再実行せず、**テクスチャ更新だけ**で済ませる
- `MolCoord` / `MolAtom` / `MorphMol` / `AnimMgr` を**変更しない**
- 既存の MorphMol 再生 (現状 indirect update で動作している) を駆動源とし、変更前後で描画結果が一致し、かつ再構築が消えることを確認する

### Phase 1 で意図的にやらないこと

- BallStick / Simple / Spline / Tube への展開 (Phase 3 以降)
- `AnimMol` の導入 (Phase 2)
- `Trajectory` / `TrajBlock` / DCD reader (Phase 2)
- 真のインスタンシング化 (`vertexAttribDivisor`) や `gl_VertexID` によるインポスタ角の導出 (別課題。§8 参照)
- `EcBufferRep::update()` の復活 (座標テクスチャ方式では VBO が静的なままなので不要。§3.6 参照)

---

## 2. 背景 — 調査で判明した事実

実装前に前提として知っておくべき事実。すべて実コードで確認済み。

### 2.1 WebGL2 に texture buffer object (TBO) は存在しない

WebGL2 は OpenGL ES 3.0 相当で、`GL_TEXTURE_BUFFER` / `samplerBuffer` は デスクトップ GL 3.1 / GLES 3.2 の機能。したがって使えない。コード上もそうなっている:

```cpp
// tritium/core/cxx_src/ElecDisplayContext.cpp:162-166
gfx::BufTexRep *ElecDisplayContext::createBufTexRep()
{
    MB_DPRINTLN("createBufTexRep called");
    return nullptr;
}
```

native 側 (`src/sysdep/ogl_core/OcBufTexRep.cpp`) は本物の TBO 実装 (`glTexBuffer` + `GL_DYNAMIC_DRAW` + `glBufferSubData`) を持つ。`src/modules/xtal/mapmesh2_vert.glsl` 等が `usamplerBuffer` を使っているが、これらは **WebGL2 ではコンパイルすら通らない** (`ShaderStore.ts:116` が全シェーダに `#version 300 es` を強制付与する)。

**帰結**: 参照実装の `USE_TBO` 経路は使わない。**`sampler2D` + `texelFetch` + 幅折り返しの一本道で行く** (§3.2)。

### 2.2 参照実装の 2D テクスチャ経路は macOS/Linux の既定経路で、動作実績がある

参照実装は `USE_TBO` を **WIN32 でのみ**定義する:

```cpp
// 参照実装 src/modules/molvis/GLSLCPK3Renderer.cpp:20-25
#ifdef WIN32
#define USE_TBO 1
#else
#endif

#define TEX2D_WIDTH 1024
```

同一の形が `src/modules/molvis/GLSLBallStick2Renderer.cpp:20-23` と `src/modules/molstr/SimpleRendGLSL.cpp:24-27` にもある。つまり **Windows は TBO、macOS/Linux は `sampler2D` + 幅 1024 折り返し**の 2 経路構成であり、後者は本開発の対象プラットフォーム上で既定として動いていた**実績のあるコード**である。

シェーダ側の切り替えは実行時のマクロ注入で行っていた:

```cpp
// 参照実装 src/modules/molvis/GLSLCPK3Renderer.cpp:77-82
ssh.setUseInclude(true);
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
    ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif
```

**帰結**: `lib_atoms.glsl` の折り返しロジックは実績のあるコードとして扱ってよい。ただし移植時に 2 点の変換が必要 (§6 Step 3):

- `texelFetch2D()` は GLSL ES 3.00 に存在しない → `texelFetch()` に置換する
- 実行時の `defineMacro` は develop の `ShaderSetupHelper` に無い → ビルド時プリプロセスに置き換える (§2.3)

### 2.3 GLSL の `#include` とマクロはビルド時に解決される

`src/glsl.cmake` の `GLSL_PREPROC()` が C プリプロセッサ (`cpp` / MSVC `cl /EP`) でシェーダを前処理する。

- `SHADER_INCLUDE_DIRS` → `-I` (molvis では `src/sysdep/ogl_core`、`src/modules/molvis/CMakeLists.txt:92-94`)
- `SHADER_DEFINES` → `-D` (グローバル変数。molvis では未設定)
- 出力は `${CMAKE_BINARY_DIR}/processed_shaders/${SHADER_NAME}` で **入力 1 ファイルにつき出力 1 ファイル**
- `SHADER_DEPS` に列挙したファイルは依存関係として追跡される (再ビルドのトリガ)

**帰結**: 参照実装が持っていた実行時の `defineMacro()` (`src/sysdep/OglShaderSetupHelper.hpp:71`) を復活させる必要は**ない**。同一 body を `#define` 違いで 2 回 include する薄いラッパを 2 ファイル置けばよい (§6 Step 3)。develop の `ShaderSetupHelper` に `defineMacro` が無いのは問題ではない。

### 2.4 tritium の GL コンテキストは 1 本

`GfxManager` は `private _context!: WebGL2RenderingContext` を 1 つだけ持ち (`tritium/react-gui/src/renderer/worker/server/gfx_manager.ts:84`)、`bindCanvas` は再バインドを弾き (`:102`)、`addView` は canvas バインド済みを前提とする (`:160`)。`bindCanvas` / `addView` はどちらも同じ `this` を `cuemol.bindPeer(view, this)` で渡すので、**View が何個あっても peer は同一オブジェクト**。

`tritium/CLAUDE.md` の "OffscreenCanvas / WebGL lifecycle constraints" 節が、`transferControlToOffscreen()` が canvas 要素あたり 1 回きりで `GfxManager._canvas` に unbind パスが無いことを裏付けている。

**帰結**: GPU リソースをオブジェクト側が保持してもコンテキスト不整合は起きない (Phase 2 で効いてくる)。Phase 1 ではレンダラが持つので問題にならない。

### 2.5 C++ ↔ JS 境界は描画ホットパスに無い

ネイティブアドオンは Worker スレッド内で `require()` される (`tritium/react-gui/src/renderer/worker/server/WorkerService.ts:1-4` のコメント)。WebGL2 コンテキストも同じ Worker 内。したがって C++ → peer 呼び出しは**同一スレッドの同期 N-API 呼び出し**で、`postMessage` もシリアライズも介在しない。

さらに `ElecDisplayContext::allocBuffer` (`tritium/core/cxx_src/ElecDisplayContext.cpp:259-296`) が `Napi::ArrayBuffer` を先に確保して C++ 側配列をそこに向ける (`ada.setDataRef(vert_ab.Data(), nvert)`) ゼロコピー設計。

**帰結**: 「境界を越えるバイト数を減らす」ことは設計動機に**ならない**。座標テクスチャの動機は転送量ではなく、**C++ 側の座標→ジオメトリ計算を GPU に移すこと**である。

### 2.6 現在の `SphereGpuPrim` は 4 頂点複製

```cpp
// src/gfx/SphereGpuPrim.hpp:27-33
struct SphElem {
    qfloat32 cenx, ceny, cenz;  // 中心座標
    qfloat32 dspx, dspy;        // ビルボード角変位 (±1)
    qfloat32 rad;               // 半径
    qbyte r, g, b, a;           // RGBA
};
```

`alloc()` は `pDC->allocBuffer(sphdata, nsph * 4, nsph * 6)` で **1 球 = 4 頂点 + 6 index**、`setData()` は同じ center/rad/color を 4 エントリに複製して `dspx/dspy` だけ変える (`src/gfx/SphereGpuPrim.cpp`)。ヘッダのコメントは "Per-instance vertex attribute layout" / "Uses instanced quad rendering" とあるが、実態は `vertexAttribDivisor` を使わない indexed triangle 描画。

**帰結**: Phase 1 では**この構造を踏襲**し (dsp は残す)、`cenx/ceny/cenz` を `index` に置き換えるだけにする。真のインスタンシング化は独立した課題として分離する (§8.1)。

### 2.7 `gfx::DataTexture` は immutable で 8bit 専用

```cpp
// src/gfx/DataTexture.hpp:12-16
/// Backend-independent immutable 2D sampler texture created from CPU data.
/// Unlike RenderTarget (an FBO attachment), this is a plain lookup texture
/// (e.g. the SMAA AreaTex / SearchTex).
```

インターフェースは `bind` / `unbind` / `getWidth` / `getHeight` のみで**更新経路が無い**。JS 側も `internalFmt = ncomp === 2 ? gl.RG8 : gl.R8` / `UNSIGNED_BYTE` 固定 (`tritium/react-gui/src/renderer/worker/server/gfx/TextureStore.ts:76-77, 85-86`)。`texSubImage2D` はコードベースに **1 件も存在しない**。

**帰結**: `DataTexture` は流用せず、**新しい可変 float テクスチャ抽象を追加する** (§3.3)。SMAA が依存している immutable の契約を壊さない。

### 2.8 `descr=="atomsMoved"` を見る前例がある

```cpp
// src/modules/molstr/SimpleRendererGLSL.cpp:218-230
void SimpleRenderer::objectChanged(qsys::ObjectEvent &ev)
{
    if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED) {
        if (ev.getDescr().equals("atomsMoved")) {
            if (m_bUseShader) {
                m_lineGpuPrim.invalidate();
                return;
            }
        }
    }
    super_t::objectChanged(ev);
}
```

`CPK2Renderer` は `objectChanged` を override して**いない** (`src/modules/molvis/CPK2Renderer.hpp` に宣言なし) ため、基底の全 invalidate に落ちている。

**帰結**: 新しいイベント型 (`OBE_CHANGED_DYNAMIC`) を Phase 1 で導入する必要は**ない**。既存の `OBE_CHANGED` + `descr=="atomsMoved"` で判別できる。

### 2.9 `DispCacheRenderer::invalidateDisplayCache()` は再描画要求のみ

```cpp
// src/qsys/DispCacheRenderer.cpp
void DispCacheRenderer::invalidateDisplayCache()
{
  ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();
}
```

キャッシュ破棄は派生側 (`DispListRenderer::invalidateDisplayCache()` が `m_dlcache.invalidate()`、`CPK2Renderer::invalidateDisplayCache()` が `m_sphGpuPrim.invalidate()`) が行う。

**帰結**: 「キャッシュを捨てずに再描画だけ要求する」には `getScene()->setUpdateFlag()` を直接呼べばよい。

### 2.10 レンダーループと `objectChanged()` のタイミング

**本設計の要となる部分**。tritium の rAF 1 ティックは以下の順序で、これは意図的 (`tritium/react-gui/src/renderer/worker/server/gfx/ViewLoopController.ts:56-82`、`:58-64` のコメントが「AnimMgr playback ... is drawn this same frame」と明記):

```
requestAnimationFrame(render):
  1. cuemol.performIdleTasks()                      // C++ event/timer pump
  2. sceMgr.invokeMethod('checkAndUpdateScenes')    // 描画
  3. requestAnimationFrame(render)                  // 無条件に自己再スケジュール
```

再描画はフラグのポーリングで、**単一 bool** (`src/qsys/Scene.cpp:885-910`。`:888` で読み `:896` でクリア):

```cpp
void Scene::checkAndUpdate()
{
  if (m_bUpdateRequired) {
    for (each view) if (pV->isActive()) pV->forceRedraw();
    clearUpdateFlag();
  }
  else { /* per-view flag */ }
}
```

これらから、以下が導かれる。

| 経路 | `objectChanged()` が走る場所 | 描画されるタイミング |
|---|---|---|
| **タイマー駆動** (AnimMgr → MorphMol → `fireAtomsMoved`) | `performIdleTasks()` の中 = **rAF コールバック内** | **同一ティック**で保証される (順序 1 → 2) |
| **UI 駆動** (React → RPC → `setProp` → `propChanged`) | worker のメッセージハンドラタスク / マイクロタスク = **rAF の外** | 次の rAF ティック (**最大 1 フレーム遅延**) |

補足として確認済みの事実:

- **イベント配送は完全同期**。`Object::fireObjectEvent` → `EventCaster::replicaFire` (`src/qlib/EventCaster.hpp:209-234`) はリスナを即実行し、キューイングしない。つまり `objectChanged()` は `setPos` / `setProp` の呼び出しスタック上で走る
- **rAF 外からの GL 呼び出しは既に本番で行われている**。`WorkerService.ts:364` の `resized()` → `view.checkAndUpdate()` (フル drawScene) はメッセージハンドラタスク内で同期実行され、`:333-351` のコメントが**意図的**であることを明記している。他に `activateView()` → `redraw` (`gfx_manager.ts:229`)、`ViewLoopController.ts:99` の初回同期 `render()`、`exportImage.service.ts:157` の FBO レンダ + `readPixels` がある。安全性の根拠は「rAF だから」ではなく、**GL コンテキストが Worker の生存期間中ずっと保持されるから** (`tritium/CLAUDE.md:364`「`GfxManager._canvas` has no unbind path」)
- **描画はコアレスされるが、アップロードはコアレスされない**。`m_bUpdateRequired` は単一 bool、アクティブ view は 1 つ (`gfx_manager.ts:217-220`)、rAF ループも 1 本 (`:222-224`) なので描画はフレーム 1 回。しかし **1 タスク内で `setProp` が N 回呼ばれれば `objectChanged()` は N 回発火する**。ドラッグ中の preview 書き込み (`services/genericProps.service.ts:205-215` が毎フレーム txn 無しで `setProp`) が典型的にこれを踏む
- **`objectChanged(ObjectEvent &ev)` には `DisplayContext*` が渡ってこない** (`src/qsys/DispCacheRenderer.cpp:71` のシグネチャ)

**帰結**: テクスチャのアップロードを `objectChanged()` の中で行ってはならない (§3.9)。

---

## 3. 設計方針 (確定事項)

以下は調査と議論の結果、**確定した決定**である。実装時に再検討しないこと。異論がある場合は実装を止めて相談すること。

### 3.1 座標テクスチャの動機は「CPU のジオメトリ計算を消す」こと

転送量削減ではない (§2.5)。現状 CPU が座標から導出しているもの (球なら 4 頂点への複製、円柱なら `dir = pos2 - pos1`、スプラインなら断面展開) を GPU の頂点シェーダに移す。これにより座標更新時の CPU 作業が O(ジオメトリ) から O(原子数) 以下に落ちる。

### 3.2 機構は `sampler2D` + `texelFetch` + 幅 1024 固定の折り返し。TBO は使わない

WebGL2 に TBO が無い (§2.1) ため、native/WebGL2 で**同一の一本道**にする。

参照実装は Windows のみ TBO、他は 2D テクスチャという 2 経路を保守していた (§2.2) が、**それは踏襲しない**。WebGL2 で TBO が使えない以上どのみち 2D 経路は必須であり、native だけ TBO を併走させても保守コストに見合う利得が無い (Phase 1 の CPK では原子数ぶんのテクセルしか触らないので、TBO と 2D テクスチャの性能差は測定可能な水準に達しないと見込む)。将来 native で TBO を使いたくなったら `gfx::FloatDataTexture` の実装を差し替えれば済むよう、抽象の裏に隠しておく。

- 幅は `TEX2D_WIDTH = 1024` 固定 (参照実装と同じ)
- 高さは `ceil(natoms / 1024)`
- 1 テクセル = 1 原子の xyz
- 容量は `1024 × MAX_TEXTURE_SIZE`。WebGL2 の規格保証最低値 2048 でも 209 万原子、デスクトップ実機の通常値 16384 なら 1677 万原子。実用上、上限には当たらない
- フォーマットは **RGB32F** (12 バイト/原子)。`texelFetch` はフィルタリングを行わないので filterable でなくてよい。行長 `1024 × 12 = 12288` バイトは 4 の倍数なので `UNPACK_ALIGNMENT` の既定 4 で問題ない

### 3.3 新しい抽象 `gfx::FloatDataTexture` を追加する

`gfx::DataTexture` (immutable, R8/RG8) は流用しない (§2.7)。`gfx::BufTexRep` も流用しない (名前が TBO を含意し、WebGL2 実装が `nullptr` のまま)。

```cpp
// src/gfx/FloatDataTexture.hpp (新規)
class GFX_API FloatDataTexture
{
public:
    virtual ~FloatDataTexture() {}
    /// Allocate the texture storage (w*h texels, ncomp floats each).
    virtual bool create(int w, int h, int ncomp) = 0;
    /// Upload w*h*ncomp floats, replacing the whole texture contents.
    virtual void update(const void *data) = 0;
    virtual void bind(int texUnit) = 0;
    virtual void unbind() = 0;
    virtual int getWidth() const = 0;
    virtual int getHeight() const = 0;
};
```

`DisplayContext::createFloatDataTexture()` で生成。**既定実装は `nullptr` を返す**ので、未実装バックエンドでは自動的に従来経路にフォールバックする (§3.5)。

### 3.4 Phase 1 では index map を作らない

CPK では「球 i ↔ `CPK2Renderer::renderShaderImpl()` の `AtomIterator` 列挙順 i」なので、**テクセル index はレンダラ自身の列挙順そのもの**。AID → index のマップは不要。

これにより Phase 1 は `AnimMol` も `MolCoord` の仮想フックも必要としない。Phase 2 で座標の供給元が `Trajectory` になったとき、index が「レンダラの列挙順」から「`AnimMol::getCrdArrayInd(aid)`」に変わるだけで、シェーダと `SphereIdxGpuPrim` は変更不要。

**前提として検証すること**: `AtomIterator` の列挙順が、同一 `MolCoord` + 同一 `Selection` に対して呼び出し間で安定していること (§5 の事前確認ステップ)。

### 3.5 フォールバックを必ず残す

`createFloatDataTexture()` が `nullptr` を返す、または `create()` が失敗した場合は、既存の `SphereGpuPrim` 経路にフォールバックする。これにより:

- native OpenGL と WebGL2 のどちらかを先に実装しても、もう一方が壊れない
- 問題が起きたときにフラグ 1 つで従来動作に戻せる
- `pdc->isFile()` (レイトレース等のファイル出力) は従来どおり `super_t::display(pdc)` に落ちる (既存の分岐をそのまま使う)

### 3.6 `EcBufferRep::update()` は復活させない

`tritium/core/cxx_src/EcBufferRep.cpp:150-172` は本体が丸ごとコメントアウトされた空関数で、`create()` 内の `m_bDataUpdated = true;` (`:119`) も無効化されている。これはドラッグ回転ジャンク修正 (`fa3909cd "Fix drag-rotation jank by managing dirty flag in EcBufferRep"`) の結果であり、現状 `isUpdated` は恒久的に false、毎フレームの VBO アップロードはゼロ。

**座標テクスチャ方式では VBO は不変データ (index / dsp / 半径 / 色) だけを持つので `STATIC_DRAW` のままでよく、`bufferSubData` は不要**。この修正と衝突しない。触らないこと。

### 3.7 `OBE_CHANGED_DYNAMIC` / `OBE_CHANGED_FIXDYN` は Phase 1 では導入しない

- `OBE_CHANGED` + `descr=="atomsMoved"` で判別できる (§2.8)
- `OBE_CHANGED_FIXDYN` の目的は「動的更新の終了後に重い高品質再構築をしてよい」で、参照実装がこれを必要としたのは**再生中に GLSL モードへ切り替えて終了時に VBO モードへ戻していたから**。本方式にモード切替は無く、テクスチャが最終品質なので戻す対象が無い。**恒久的に不要**と判断する

Phase 2 で `OBE_CHANGED_DYNAMIC` を導入する場合は §7.4 の注意を必ず読むこと。

### 3.8 参照実装の `AnimMol` をそのまま移植しない (Phase 2 の方針)

Phase 1 には不要だが、Phase 2 の設計判断として先に確定しておく。参照実装の `AnimMol` (`src/modules/molstr/AnimMol.hpp/cpp`, 約 210 行) のうち:

- **self-anim 一式は落とす** (`qlib::TimerListener` 多重継承、`m_bSelfAnim`、`setSelfAnim` / `startSelfAnim` / `stopSelfAnim` / `getSelfAnimLen` / `onTimer` / `unloading`、qif の `self_anim` プロパティ)。develop の `MorphMol` に self-anim は無く、`AnimMgr` が `frame` を駆動して動いている。Trajectory の単独再生が必要になった段階で入れる
- **`getAtomCrd` / `setAtomCrd` と validity flag による二重表現は Phase 2 では入れない**。呼び出し元は `MolAtom.cpp:102` / `:135` だけで、この 2 メソッドは二重表現を支えるためだけに存在する。代償として `MolAtom::getPosImpl()` が全呼び出しで仮想呼び出し + 分岐を払い、アニメ中は `unordered_map::find` になる (`getPos()` は選択・レンダラ・測定・`getCenter()` 等の超ホットパス)
- 代わりに **`Trajectory::update()` が CrdArray と MolAtom の両方に書く**。CPU コストは今日と同じで、`MolCoord` / `MolAtom` を一切触らずに済む
- ゼロコピー (`getCrdArrayImpl()` が TrajBlock の生ポインタを返す) が必要になった時点で、flag と `MolAtom` フックを**追加的に**入れる。`getCrdArrayImpl()` / `createIndexMapImpl()` のインターフェースは変わらない

### 3.9 テクスチャのアップロードは `objectChanged()` ではなく `display()` で行う

**`objectChanged()` はダーティフラグを立てて再描画を要求するだけにし、実際の `texSubImage2D` は `display()` の中で、ダーティなら 1 回だけ実行する。**

§2.10 の事実から、この形にする理由は 3 つある。

1. **アップロードがフレーム単位で自然にコアレスされる**。1 タスク内で `setProp` が N 回呼ばれると `objectChanged()` も N 回発火する (ドラッグ中の preview 書き込みが典型)。アップロードを `objectChanged()` に置くと `texSubImage2D` が N 回走って描画は 1 回、という無駄が出る。`display()` に遅延すれば必ず 1 フレーム 1 回に収束する
2. **`DisplayContext*` が自然に手に入る**。`objectChanged(ObjectEvent&)` には `pdc` が渡ってこないので、テクスチャ側で `m_nViewID` から View を再解決する回り道が要る (`EcDataTexture` はそうしている)。`display(DisplayContext *pdc)` なら `renderCoordTexImpl(pdc)` と同じ文脈で書ける
3. **GL 呼び出しが常に rAF 内かつ描画直前になる**。UI 駆動の `objectChanged()` は rAF の外で走る (§2.10) が、この形なら rAF 外で GL を叩くこと自体が無くなり、アップロードとドローの順序も自明になる。rAF 外 GL は既存実績があり安全ではある (§2.10) が、**わざわざ踏む理由が無い**

この設計では、両経路とも最終的に `display()` 内の同じコードに合流する:

| 経路 | 流れ |
|---|---|
| タイマー駆動 | `performIdleTasks()` → `objectChanged()` がダーティ + `setUpdateFlag()` → **同一ティック**の `checkAndUpdateScenes()` → `display()` → アップロード + ドロー |
| UI 駆動 | メッセージハンドラで `objectChanged()` がダーティ + `setUpdateFlag()` (GL は叩かない) → 次ティックの `checkAndUpdateScenes()` → `display()` → アップロード + ドロー |

---

## 4. 事前確認ステップ

実装を始める前に必ず実行し、出力を確認すること。前提が崩れていたら実装を止めて相談する。

### 4.1 リポジトリ状態

```bash
# 実装先
cd /Users/user1/proj64/cuemol2
git branch --show-current        # develop であること
git status --short               # 作業ツリーがクリーンであること

# 参照実装 (読むだけ)
cd /Users/user1/proj64/cuemol2_png
git branch --show-current        # dev201608 であること
```

### 4.2 前提ファイルの存在

```bash
cd /Users/user1/proj64/cuemol2
ls src/gfx/SphereGpuPrim.hpp src/gfx/SphereGpuPrim.cpp src/gfx/GpuPrim.hpp
ls src/gfx/DataTexture.hpp src/gfx/DisplayContext.hpp
ls src/modules/molvis/CPK2Renderer.hpp src/modules/molvis/CPK2Renderer.cpp
ls src/modules/molvis/sphere2_vertex.glsl src/modules/molvis/sphere_frag.glsl
ls src/modules/molvis/CMakeLists.txt src/glsl.cmake
ls src/sysdep/ogl_core/OcDataTexture.hpp src/sysdep/ogl_core/OcDisplayContext.hpp
ls tritium/core/cxx_src/EcDataTexture.hpp tritium/core/cxx_src/ElecDisplayContext.hpp
ls tritium/react-gui/src/renderer/worker/server/gfx/TextureStore.ts
ls tritium/react-gui/src/renderer/worker/server/gfx_manager.ts
ls tritium/react-gui/src/renderer/__test__/gfxManagerContract.test.ts

# 参照実装
ls /Users/user1/proj64/cuemol2_png/src/modules/molstr/lib_atoms.glsl
ls /Users/user1/proj64/cuemol2_png/src/modules/molvis/GLSLCPK3Renderer.cpp
```

### 4.3 前提の再確認 (壊れていたら設計見直し)

```bash
cd /Users/user1/proj64/cuemol2

# (a) CPK2Renderer は objectChanged を override していないこと
grep -n "objectChanged" src/modules/molvis/CPK2Renderer.hpp    # ヒットしないはず

# (b) texSubImage2D がまだ存在しないこと (存在するなら誰かが先に入れている)
grep -rn "texSubImage2D" tritium/react-gui/src/renderer/worker/server/

# (c) SHADER_INCLUDE_DIRS が ogl_core を指していること
sed -n '86,96p' src/modules/molvis/CMakeLists.txt

# (d) EcBufferRep::update() が空のままであること (§3.6 の前提)
sed -n '150,172p' tritium/core/cxx_src/EcBufferRep.cpp
```

### 4.4 `AtomIterator` の列挙順の安定性 (§3.4 の前提)

`CPK2Renderer::renderShaderImpl()` と、新設する `updateCoordTex()` は、同じ `AtomIterator(pMol, getSelection())` の列挙順に依存する。この順序が呼び出し間で安定していることを、`src/modules/molstr/AtomIterator.hpp/cpp` を読んで確認すること (`MolCoord` の `AtomPool` / `IndexedTable` の走査順に依存する)。

**もし安定でない場合**: `renderShaderImpl()` で `std::vector<int> m_aidcache` に AID を記録し、`updateCoordTex()` はそれを走査する方式に変更する (実装コストは小さい。むしろ最初からこうしてもよい)。

---

## 5. Phase 1 — 成果物サマリ

| 層 | ファイル | 種別 |
|---|---|---|
| gfx 抽象 | `src/gfx/FloatDataTexture.hpp` | 新規 |
| gfx 抽象 | `src/gfx/DisplayContext.hpp` / `.cpp` | 変更 (`createFloatDataTexture()` 追加、既定 `nullptr`) |
| gfx prim | `src/gfx/SphereIdxGpuPrim.hpp` / `.cpp` | 新規 |
| shader | `src/sysdep/ogl_core/lib_atoms.glsl` | 新規 (参照実装から移植・TBO 経路削除) |
| shader | `src/modules/molvis/sphere2_body_vert.glsl` | 新規 (既存 body を移動 + ガード追加) |
| shader | `src/modules/molvis/sphere2_vertex.glsl` | 変更 (薄いラッパ化) |
| shader | `src/modules/molvis/sphere2idx_vertex.glsl` | 新規 (薄いラッパ) |
| build | `src/modules/molvis/CMakeLists.txt` | 変更 |
| native GL | `src/sysdep/ogl_core/OcFloatDataTexture.hpp` / `.cpp` | 新規 |
| native GL | `src/sysdep/ogl_core/OcDisplayContext.hpp` / `.cpp` | 変更 (`createFloatDataTexture()` override) |
| native GL | `src/sysdep/CMakeLists.txt` | 変更 |
| WebGL2 | `tritium/core/cxx_src/EcFloatDataTexture.hpp` / `.cpp` | 新規 |
| WebGL2 | `tritium/core/cxx_src/ElecDisplayContext.hpp` / `.cpp` | 変更 (`createFloatDataTexture()` override) |
| WebGL2 | `tritium/react-gui/src/renderer/worker/server/gfx/TextureStore.ts` | 変更 (float テクスチャの生成・更新) |
| WebGL2 | `tritium/react-gui/src/renderer/worker/server/gfx_manager.ts` | 変更 (peer API 2 つ追加) |
| WebGL2 | `tritium/react-gui/src/renderer/__test__/gfxManagerContract.test.ts` | 変更 (`EXPECTED_PEER_API` 更新) |
| renderer | `src/modules/molvis/CPK2Renderer.hpp` / `.cpp` | 変更 |
| docs | `tritium/CLAUDE.md` | 変更 (Worker 内の rAF / GL 規約を追記。§6 Step 7) |

**変更しないファイル (重要)**: `src/modules/molstr/MolCoord.*`、`src/modules/molstr/MolAtom.*`、`src/modules/anim/MorphMol.*`、`src/qsys/AnimMgr.*`、`src/qsys/ObjectEvent.hpp`、`src/qsys/DispCacheRenderer.*`、`src/gfx/SphereGpuPrim.*`、`tritium/core/cxx_src/EcBufferRep.*`

**React / レンダラースレッド側の変更は不要** (§2.10)。再描画要求の仕組み (`Scene::setUpdateFlag()` を rAF ループが毎フレームポーリングする) は既に存在し、rAF ループは無条件に回り続けるので、新しい通知チャネルは要らない。MorphMol の `frame` は既存の `setGenericProp` (`services/genericProps.service.ts`) で、再生は `animPlay` / `animGoTime` (`services/animation.service.ts`) で既に到達可能。

> **用語の注意**: 上表の `tritium/react-gui/src/renderer/worker/server/**` はパス上 `renderer/` 配下だが **Worker スレッドのコード**である (`tritium/CLAUDE.md:62`「file location determines execution thread」)。「React 側の変更不要」とは `components/` / `hooks/` / `worker/client/` が無変更、という意味。

---

## 6. Phase 1 — 実装手順

順序に意味がある。各ステップの終わりでビルドが通ることを確認しながら進める。

### Step 1: `gfx::FloatDataTexture` 抽象と `DisplayContext` フック

1. `src/gfx/FloatDataTexture.hpp` を新規作成 (§3.3 の定義)。
2. `src/gfx/DisplayContext.hpp` に前方宣言と仮想関数を追加。既存の `createDataTexture` / `createBufTexRep` の宣言の近く (`:525-545` 付近) に置く。

```cpp
    /// Create a backend-specific mutable float data texture.
    /// Returns nullptr if not supported (caller must fall back).
    virtual FloatDataTexture *createFloatDataTexture();
```

3. `src/gfx/DisplayContext.cpp` に既定実装を追加。

```cpp
FloatDataTexture *DisplayContext::createFloatDataTexture()
{
    return nullptr;
}
```

この時点でビルドが通ること。既存動作に影響なし。

### Step 2: native OpenGL 実装 (`OcFloatDataTexture`)

先に native を実装する。Electron を起動せずに反復できるので、シェーダとレンダラのデバッグが速い。

1. `src/sysdep/ogl_core/OcFloatDataTexture.hpp` / `.cpp` を新規作成。`OcDataTexture.hpp/cpp` を雛形にする。
   - `create(w, h, ncomp)`: `glGenTextures` → `glBindTexture(GL_TEXTURE_2D, ...)` → `glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB32F, w, h, 0, GL_RGB, GL_FLOAT, nullptr)` → `MIN/MAG_FILTER = GL_NEAREST`、`WRAP_S/T = GL_CLAMP_TO_EDGE`
   - `update(data)`: `glBindTexture` → `glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, m_nWidth, m_nHeight, GL_RGB, GL_FLOAT, data)`
   - `bind(texUnit)`: `glActiveTexture(GL_TEXTURE0 + texUnit)` → `glBindTexture(GL_TEXTURE_2D, m_nTexID)`
   - `ncomp` は 3 のみサポートし、それ以外は `false` を返す (Phase 1 の割り切り)
2. `src/sysdep/ogl_core/OcDisplayContext.hpp` / `.cpp` に `createFloatDataTexture()` の override を追加。
3. `src/sysdep/CMakeLists.txt` にソースを追加。

### Step 3: シェーダ

1. **`src/sysdep/ogl_core/lib_atoms.glsl` を新規作成**。参照実装 `/Users/user1/proj64/cuemol2_png/src/modules/molstr/lib_atoms.glsl` から移植するが、**TBO 経路 (`#ifdef USE_TBO` の側) は削除**し `sampler2D` 一本にする (§3.2)。また参照実装の `texelFetch2D` は GLSL ES 3.00 に無いので `texelFetch` に置換する。

```glsl
// -*-Mode: C++;-*-
//
//  Atom coordinate texture lookup helpers.
//
//  The coordinate texture is a 2D RGB32F texture holding one atom position
//  per texel, laid out row-major with a fixed width. A linear atom index is
//  wrapped onto (x, y) so that large systems exceed neither MAX_TEXTURE_SIZE
//  nor the per-dimension limit.
//
#ifndef LIB_ATOMS_GLSL_INCLUDED
#define LIB_ATOMS_GLSL_INCLUDED

#ifndef TEX2D_WIDTH
#  define TEX2D_WIDTH 1024
#endif

vec3 getAtomPos3(in sampler2D tex, in int ind)
{
    ivec2 iv;
    iv.x = ind % TEX2D_WIDTH;
    iv.y = ind / TEX2D_WIDTH;
    return texelFetch(tex, iv, 0).xyz;
}

vec4 getAtomPos(in sampler2D tex, in int ind)
{
    return vec4(getAtomPos3(tex, ind), 1.0);
}

#endif
```

**注意**: `#include` はビルド時に C プリプロセッサで解決される (§2.3)。インクルードガードは C プリプロセッサに対して効く。

2. **`src/modules/molvis/sphere2_body_vert.glsl` を新規作成**。既存 `sphere2_vertex.glsl` の内容を移し、座標の取得元だけをガードする。

```glsl
// -*-Mode: C++;-*-
//
//  vertex shader body for spheres (predefined attribute locations)
//
//  Included by sphere2_vertex.glsl (direct position) and
//  sphere2idx_vertex.glsl (coordinate texture). Do not add to
//  GLSL_SHADER_FILES; it is an include-only body.
//
#define varying out

#include <matrices_inc.glsl>

#ifdef USE_COORD_TEX
#include <lib_atoms.glsl>
#endif

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float u_edge;       // offset 4
    int   u_bsilh;      // offset 8
    float _pad;         // offset 12
    vec4  u_edgecolor;  // offset 16
};

////////////////////
// Vertex attributes (predefined locations)

#ifdef USE_COORD_TEX
// atom index into the coordinate texture
layout(location = 0) in float a_index;
uniform sampler2D u_coordTex;
#else
// position
layout(location = 0) in vec4 a_vertex;
#endif

// impostor
layout(location = 1) in vec2 a_impos;

// radius
layout(location = 2) in float a_radius;

// color
layout(location = 3) in vec4 a_color;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;
varying float v_edgeratio;

////////////////////
// Program

void main()
{
    vec4 pos;

#ifdef USE_COORD_TEX
    pos = getAtomPos(u_coordTex, int(a_index));
#else
    pos = a_vertex;
#endif

    pos = u_ModelViewMatrix * pos;
    pos.xy = pos.xy + a_impos.xy * (a_radius + u_edge);
    v_ecpos = pos;
    pos = u_ProjectionMatrix * pos;

    gl_Position = pos;

    v_edgeratio = (a_radius + u_edge) / a_radius;
    v_impos = a_impos * v_edgeratio;
    v_radius = a_radius;
    v_color = a_color;
}
```

**`a_index` を `float` にする理由**: `AbstDrawAttrs::setAttrInfo` の型指定 (`QTC_FLOAT32` 等) と `vertexAttribPointer` の経路が整数属性でどう振る舞うか未検証のため。float で index を運び `int()` でキャストする方が既存経路と同型で安全。原子数 1677 万まで float32 は整数を正確に表現できる (2^24 = 1677 万) ので、§3.2 の容量上限と整合する。

3. **`src/modules/molvis/sphere2_vertex.glsl` を薄いラッパに変更**。

```glsl
// -*-Mode: C++;-*-
//
//  vertex shader for spheres (direct position attribute)
//
#include <sphere2_body_vert.glsl>
```

4. **`src/modules/molvis/sphere2idx_vertex.glsl` を新規作成**。

```glsl
// -*-Mode: C++;-*-
//
//  vertex shader for spheres (position fetched from the coordinate texture)
//
#define USE_COORD_TEX 1
#include <sphere2_body_vert.glsl>
```

5. **`src/modules/molvis/CMakeLists.txt` を変更** (`:81-94` 付近)。

```cmake
  SET(GLSL_SHADER_FILES
    sphere_frag.glsl
    sphere2_vertex.glsl
    sphere2idx_vertex.glsl        # 追加
    cylinder_vertex.glsl
    cylinder_frag.glsl
  )
  SET(SHADER_DEPS
    ${CMAKE_SOURCE_DIR}/src/sysdep/ogl_core/lighting_inc.glsl
    ${CMAKE_SOURCE_DIR}/src/sysdep/ogl_core/fog_inc.glsl
    ${CMAKE_SOURCE_DIR}/src/sysdep/ogl_core/matrices_inc.glsl
    ${CMAKE_SOURCE_DIR}/src/sysdep/ogl_core/lib_atoms.glsl        # 追加
    ${CMAKE_CURRENT_SOURCE_DIR}/sphere2_body_vert.glsl            # 追加
  )
  SET(SHADER_INCLUDE_DIRS
    ${CMAKE_SOURCE_DIR}/src/sysdep/ogl_core
    ${CMAKE_CURRENT_SOURCE_DIR}                                   # 追加 (body の include 用)
  )
```

**確認**: ビルド後に `${CMAKE_BINARY_DIR}/processed_shaders/sphere2_vertex.glsl` と `sphere2idx_vertex.glsl` が生成され、前者に `a_vertex`、後者に `u_coordTex` と `texelFetch` が展開されていること。`sphere2_body_vert.glsl` が `processed_shaders/` に出力されていないこと (`GLSL_SHADER_FILES` に入れていないので出力されないはず)。

### Step 4: `gfx::SphereIdxGpuPrim`

`src/gfx/SphereGpuPrim.hpp` / `.cpp` を雛形に新規作成する。**既存の `SphereGpuPrim` は変更しない** (§5)。

```cpp
// src/gfx/SphereIdxGpuPrim.hpp (骨子)

/**
 * Sphere impostor draw primitive with texture-fetched positions.
 *
 * Same billboard-quad layout as SphereGpuPrim, but the sphere centre is not
 * stored per vertex. Instead each vertex carries an index into a coordinate
 * texture that the caller binds via setCoordTexUnit(). Only the texture needs
 * re-uploading when positions change; this VBO stays immutable.
 */
class GFX_API SphereIdxGpuPrim : public GpuPrim
{
public:
    /** Per-vertex attribute layout (one sphere = 4 vertices). */
    struct SphIdxElem
    {
        qfloat32 index;             ///< Index into the coordinate texture
        qfloat32 dspx, dspy;        ///< Billboard corner displacement (+-1)
        qfloat32 rad;               ///< Sphere radius
        qbyte r, g, b, a;           ///< RGBA colour
    };

    // DrawParams is identical to SphereGpuPrim::DrawParams (std140, 32 bytes)
    struct DrawParams { /* same as SphereGpuPrim */ };

    using SphIdxElemAry32 = gfx::DrawAttrElems<quint32, SphIdxElem>;

    bool init(DisplayContext *pDC) override;   // loads "gpu_sphere2idx"
    void alloc(DisplayContext *pDC, int nsph);
    /// Set the per-sphere invariant data. idx is the coordinate texture index.
    void setData(int i, int idx, float rad, quint32 devcode);
    /// Bind the coordinate texture to this unit before draw().
    void setCoordTex(FloatDataTexture *pTex, int texUnit);
    void draw(DisplayContext *pDC) override;
    void invalidate() override;
    bool isValid() const override;
    int getSize() const;

private:
    static constexpr int ATTRLOC_INDEX  = 0;
    static constexpr int ATTRLOC_IMPOS  = 1;
    static constexpr int ATTRLOC_RAD    = 2;
    static constexpr int ATTRLOC_COLOR  = 3;
    static constexpr int COORD_TEX_UNIT = 0;

    gfx::ShaderObject *m_pPO;
    SphIdxElemAry32 *m_pDrawElem;
    FloatDataTexture *m_pCoordTex;   // non-owning
    qfloat32 m_dsps[4][2];
};
```

実装の要点:

- `init()`: `pDC->loadShaderObject("gpu_sphere2idx", "%%CONFDIR%%/data/shaders/sphere2idx_vertex.glsl", "%%CONFDIR%%/data/shaders/sphere_frag.glsl")`。frag は既存を流用 (varying が同じなので変更不要)。`m_pPO->initDrawParamsUBO(sizeof(DrawParams))` も同様。
- `alloc()`: `SphereGpuPrim::alloc()` と同形。`setAttrInfo(0, ATTRLOC_INDEX, 1, QTC_FLOAT32, offsetof(SphIdxElem, index))` に変える以外は同じ。`pDC->allocBuffer(data, nsph * 4, nsph * 6)`、`setDrawMode(DRAW_TRIANGLES)`。
- `setData()`: `SphereGpuPrim::setData()` と同形 (index を 4 頂点に複製、`dspx/dspy` だけ変える、index buffer も同じ)。
- `draw()`: `SphereGpuPrim::draw()` と同形。ただし `m_pPO->enable()` の後に `m_pCoordTex->bind(COORD_TEX_UNIT)` とサンプラ uniform の設定を行い、描画後に `m_pCoordTex->unbind()`。

  **uniform API 名の注意**: C++ の `gfx::ShaderObject` (`src/gfx/ShaderObject.hpp:80-89`) は int を `setUniform(name, int)` のオーバーロードで受け、float 用が `setUniformF`。**`setUniformI` は存在しない** (それは JS 側 peer API の名前であって C++ 側ではない)。サンプラの設定は:

  ```cpp
  m_pPO->setUniform("u_coordTex", COORD_TEX_UNIT);
  ```

- `src/gfx/CMakeLists.txt` にソースを追加 (`SphereGpuPrim.cpp` が `:25` にあるので、その並びに置く)。

### Step 5: `CPK2Renderer` の変更

**この Step が Phase 1 の本体**。以下を `src/modules/molvis/CPK2Renderer.hpp` に追加する。

```cpp
    // ---- coordinate texture path (direct update) ----

    /// Sphere primitive with texture-fetched positions (used when available)
    gfx::SphereIdxGpuPrim m_sphIdxGpuPrim;

    /// Coordinate texture (owned). Null when the backend does not support it.
    gfx::FloatDataTexture *m_pCoordTex;

    /// CPU-side staging buffer for the coordinate texture (w*h*3 floats)
    std::vector<qfloat32> m_coordbuf;

    /// AIDs in the same order as the coordinate texture texels
    std::vector<int> m_aidcache;

    int m_nTexW, m_nTexH;

    /// True when the coordinate texture path is in use
    bool m_bUseCoordTex;

    /// Set by objectChanged(); consumed by display(). See the plan section 3.9:
    /// the upload is deferred so that it coalesces to once per frame and always
    /// runs inside the rAF tick with a DisplayContext at hand.
    bool m_bCoordDirty;

    void renderCoordTexImpl(DisplayContext *pdc);
    bool updateCoordTex();

  public:
    virtual void objectChanged(qsys::ObjectEvent &ev);
```

実装:

1. **`renderCoordTexImpl(pdc)`** — `renderShaderImpl()` を雛形にする。差分:
   - `AtomIterator` で数えた `nsphs` から `m_nTexW = TEX2D_WIDTH (1024)`、`m_nTexH = (nsphs + 1023) / 1024` を決め、`m_coordbuf.resize(m_nTexW * m_nTexH * 3)`、`m_aidcache.resize(nsphs)`
   - `m_pCoordTex = pdc->createFloatDataTexture()`。`nullptr` なら `m_bUseCoordTex = false` にして即 return (呼び出し元が従来経路へ)
   - `m_pCoordTex->create(m_nTexW, m_nTexH, 3)` が false なら同様にフォールバック
   - `m_sphIdxGpuPrim.alloc(pdc, nsphs)`
   - 原子ループ内で `m_aidcache[i] = aid`、`m_coordbuf` に `pAtom->getPos()` を書き、`m_sphIdxGpuPrim.setData(i, i, rad, devcode)` を呼ぶ (**index は列挙順 `i` そのもの**、§3.4)
   - ループ後に `m_pCoordTex->update(&m_coordbuf[0])`、`m_sphIdxGpuPrim.setCoordTex(m_pCoordTex, 0)`
   - 色解決 (`getColSchm()->start/end`) は既存と同じ

2. **`updateCoordTex()`** — 座標だけを再収集してテクスチャを更新する。**これが direct update の本体**。`display()` からのみ呼ぶ (§3.9)。

```cpp
/// Re-gather atom positions into the coordinate texture.
/// Only positions are touched; the VBO (index/radius/colour) stays as is.
bool CPK2Renderer::updateCoordTex()
{
    if (!m_bUseCoordTex || m_pCoordTex == nullptr) return false;
    if (m_aidcache.empty()) return false;

    MolCoordPtr pMol = getClientMol();
    if (pMol.isnull()) return false;

    const int nsphs = static_cast<int>(m_aidcache.size());
    for (int i = 0; i < nsphs; ++i) {
        MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
        if (pAtom.isnull()) return false;   // topology changed; force rebuild
        const qlib::Vector4D pos = pAtom->getPos();
        m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
        m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
        m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
    }
    m_pCoordTex->update(&m_coordbuf[0]);
    return true;
}
```

`m_aidcache` を持つことで `AtomIterator` の順序安定性 (§4.4) に依存しなくなる。これは意図的な保険。

3. **`objectChanged()`** — `SimpleRenderer::objectChanged()` (`src/modules/molstr/SimpleRendererGLSL.cpp:218-230`) が前例。**ここでは GL を一切叩かない** (§3.9)。

```cpp
void CPK2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
    if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
        ev.getDescr().equals("atomsMoved")) {
        // Positions changed but topology/colour did not. Mark the coordinate
        // texture dirty and let display() do the upload: this runs inside the
        // rAF tick, has a DisplayContext, and coalesces repeated writes in one
        // task (e.g. drag preview) into a single upload per frame.
        if (m_bUseCoordTex && m_sphIdxGpuPrim.isValid()) {
            m_bCoordDirty = true;
            qsys::ScenePtr pScene = getScene();
            if (!pScene.isnull()) pScene->setUpdateFlag();
            invalidateHittestCache();
            return;
        }
    }
    super_t::objectChanged(ev);
}
```

**注意 1**: `invalidateHittestCache()` は残す。ヒットテストのキャッシュは遅延構築なので、毎フレーム invalidate しても実際のコストはヒットテスト時にしか発生しない。ここを省くとピック位置がずれる。

**注意 2**: テクスチャが未作成のうち (初回 `display()` 前) に `objectChanged()` が来る場合は `m_sphIdxGpuPrim.isValid()` が false なので `super_t` に落ち、従来のジオメトリ再構築になる。これは正しい挙動。

4. **`invalidateDisplayCache()`** — 既存に `m_sphIdxGpuPrim.invalidate()` と座標テクスチャの解放を追加。

```cpp
void CPK2Renderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
  m_sphGpuPrim.invalidate();
  m_sphIdxGpuPrim.invalidate();
  if (m_pCoordTex != nullptr) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
  }
  m_aidcache.clear();
  m_coordbuf.clear();
  m_bCoordDirty = false;
}
```

5. **`display()`** — 既存の分岐に座標テクスチャ経路を追加する。`pdc->isFile()` の分岐と `m_bUseShader` の判定は既存のまま。

```cpp
void CPK2Renderer::display(DisplayContext *pdc)
{
  if (pdc->isFile()) {
    super_t::display(pdc);   // 既存: file (non-ogl) rendering
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_sphGpuPrim.init(pdc);
    // Try the coordinate texture path; falls back silently when unavailable.
    m_bUseCoordTex = m_bUseShader && m_sphIdxGpuPrim.init(pdc);
    m_bCheckShaderOK = true;
  }

  if (m_bUseShader &&
      (m_nGlRendMode==REND_DEFAULT || m_nGlRendMode==REND_SHADER)) {
    if (m_bUseCoordTex) {
      if (!m_sphIdxGpuPrim.isValid()) {
        renderCoordTexImpl(pdc);
        // renderCoordTexImpl clears m_bUseCoordTex when the backend
        // cannot provide a float data texture.
      }
      if (m_bUseCoordTex && m_sphIdxGpuPrim.isValid()) {
        // Deferred coordinate upload (see plan section 3.9): runs at most once
        // per frame, inside the rAF tick, right before the draw.
        if (m_bCoordDirty) {
          if (!updateCoordTex()) {
            // Topology changed under us: fall back to a full rebuild.
            invalidateDisplayCache();
            return;
          }
          m_bCoordDirty = false;
        }
        preRender(pdc);
        m_sphIdxGpuPrim.draw(pdc);
        postRender(pdc);
        return;
      }
    }
    // fall through to the existing (non-texture) shader path
    if (!m_sphGpuPrim.isValid()) {
      renderShaderImpl(pdc);
      if (!m_sphGpuPrim.isValid()) return;
    }
    preRender(pdc);
    m_sphGpuPrim.draw(pdc);
    postRender(pdc);
  }
  else {
    super_t::display(pdc);   // 既存: old version (DisplayContext::sphere)
  }
}
```

**この時点で native OpenGL ビルドで動作確認できる**。§6 の検証を先に native で行うこと。

### Step 6: WebGL2 実装 (`EcFloatDataTexture` + TS 側)

native で動いてから着手する。

1. **`tritium/react-gui/src/renderer/worker/server/gfx/TextureStore.ts`** に 2 メソッド追加。`createDataTexture` (`:68-98`) が雛形。

```ts
    /**
     * Create a mutable float data texture (RGB32F, NEAREST, clamp-to-edge).
     * Used for per-atom coordinate lookup from vertex shaders. ncomp is
     * currently limited to 3. Returns false if `name` is already taken.
     */
    createFloatDataTexture(name: string, width: number, height: number,
                           ncomp: number): boolean {
        if (name in this._tex_data) { return false; }
        if (ncomp !== 3) { return false; }
        const gl = this._gl;
        const tex = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, width, height, 0,
                      gl.RGB, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._tex_data[name] = tex;
        this._tex_size[name] = { width, height };   // 新規メンバ
        return true;
    }

    /** Replace the whole contents of a float data texture. */
    updateFloatDataTexture(name: string, array_buf: any): boolean {
        const tex = this._tex_data[name];
        const sz = this._tex_size[name];
        if (!tex || !sz) { return false; }
        const gl = this._gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sz.width, sz.height,
                         gl.RGB, gl.FLOAT, new Float32Array(array_buf));
        gl.bindTexture(gl.TEXTURE_2D, null);
        return true;
    }
```

既存の `bindTexture` / `unbindTexture` / `deleteTexture` は `_tex_data` を引くので **そのまま再利用できる** (`deleteTexture` は `_tex_size` の後始末を追加すること)。

**確認事項**: `gl.RGB32F` は WebGL2 コアの sized internal format。`texelFetch` はフィルタリングしないので filterable 不要。`EXT_color_buffer_float` (`gfx_manager.ts:121`) は**レンダーターゲット用であり本件とは無関係**。もし `gl.RGB32F` で問題が出たら `gl.RGBA32F` + 4 コンポーネントに切り替える (実装差が少ない。その場合 C++ 側の `ncomp` と `m_coordbuf` のストライドも 4 にする)。

2. **`tritium/react-gui/src/renderer/worker/server/gfx_manager.ts`** に peer API を 2 つ追加。既存の `createDataTexture` (`:429`) の隣に置き、**`/// API` マーカーを必ず付ける**。

```ts
    /// API
    createFloatDataTexture(name: string, width: number, height: number,
                           ncomp: number): boolean {
        return this.textures.createFloatDataTexture(name, width, height, ncomp);
    }

    /// API
    updateFloatDataTexture(name: string, array_buf: any): boolean {
        return this.textures.updateFloatDataTexture(name, array_buf);
    }
```

3. **`tritium/react-gui/src/renderer/__test__/gfxManagerContract.test.ts`** の `EXPECTED_PEER_API` (`:37-73`) に 2 つ追加する。このリストは**アルファベット順**なので、挿入位置は以下の 2 箇所:

   - `'createDataTexture'` の直後に `'createFloatDataTexture'`
   - `'unbindTexture'` の直後、`'updateDrawParamsUBO'` の前に `'updateFloatDataTexture'`

   このテストは `gfx_manager.ts` を実行時に再パースして `/// API` マーカー付きメソッドを抽出し、`EXPECTED_PEER_API` との**完全一致**を主張する (`:91-120`, `:149-153`)。マーカーとリストの両方を更新しないとテストが落ちる。これは意図的な設計。

4. **`tritium/core/cxx_src/EcFloatDataTexture.hpp` / `.cpp`** を新規作成。`EcDataTexture.hpp/cpp` が雛形。peer 呼び出しの定型は `EcDataTexture.cpp:15-50` を参照。

```cpp
bool EcFloatDataTexture::create(gfx::DisplayContext *pdc, int w, int h, int ncomp)
{
    auto pView = dynamic_cast<ElecView *>(pdc->getTargetView());
    if (pView == nullptr) { MB_THROW(qlib::RuntimeException, "..."); return false; }
    m_nViewID = pView->getUID();
    m_texName = qlib::LString::format("fdatatex_%p", this);
    m_nWidth = w; m_nHeight = h; m_nComp = ncomp;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("createFloatDataTexture").As<Napi::Function>();
    auto rval = method.Call(peer, {Napi::String::New(env, m_texName),
                                   Napi::Number::New(env, w),
                                   Napi::Number::New(env, h),
                                   Napi::Number::New(env, ncomp)});
    return rval.As<Napi::Boolean>().Value();
}
```

`update()` は `EcDataTexture::create` の `createBuffer(env, data, data_size)` パターン (transient buffer) をそのまま流用する。データサイズは `w * h * ncomp * sizeof(float)`。`bind` / `unbind` / デストラクタは `EcDataTexture` と同一 (既存の `bindTexture` / `unbindTexture` / `deleteTexture` peer を使う)。

**寿命**: `EcDataTexture` と同じく `qsys::SceneManager::getViewS(m_nViewID)` で View を引き直す方式にする (`EcDataTexture.cpp:57`)。View が消えていれば黙って諦める。

5. **`tritium/core/cxx_src/ElecDisplayContext.hpp` / `.cpp`** に `createFloatDataTexture()` の override を追加 (`createBufTexRep` / `createVBORep` の隣、`:162-182` 付近)。

```cpp
gfx::FloatDataTexture *ElecDisplayContext::createFloatDataTexture()
{
    return MB_NEW EcFloatDataTexture();
}
```

**注意**: `EcFloatDataTexture::create()` は `DisplayContext*` を必要とするので、`gfx::FloatDataTexture::create(w, h, ncomp)` のシグネチャと合わない。`FloatDataTexture` の生成時に `DisplayContext*` を保持させるか、`createFloatDataTexture()` が `create()` まで済ませる形にするか、実装時に整合させること。`OcFloatDataTexture` は `DisplayContext` を必要としないので、**`EcFloatDataTexture` にコンストラクタか `setContext()` で `pdc` を渡す**のが素直。

6. **`tritium/core/CMakeLists.txt`** (または該当するビルド定義) にソースを追加。

### Step 7: `tritium/CLAUDE.md` にスレッド/GL 規約を追記

`tritium/CLAUDE.md` 全体を検索したが、「GL 呼び出しは rAF 内から行うこと」といった規約は**存在しない**。スレッド規約 (renderer vs worker) はあっても、Worker 内のタスク種別 (rAF vs メッセージハンドラ) についての記述が無い。本変更でこの区別が設計判断の根拠になったので、"OffscreenCanvas / WebGL lifecycle constraints" 節 (`:358-376`) に 1 段落追記する。

盛り込む内容:

- Worker 内では GL コンテキストが Worker の生存期間中ずっと保持される (`:364` の既存記述) ため、rAF コールバック外 (メッセージハンドラ / サービスタスク) からの GL 呼び出しも合法。実例は `WorkerService.ts:364` の `resized()`、`gfx_manager.ts:229` の `activateView()`、`exportImage.service.ts:157` の export
- ただし present は rAF 内の `drawScene` に依存するので、**再描画は `Scene::setUpdateFlag()` で要求する**こと
- rAF 1 ティックは `performIdleTasks()` → `checkAndUpdateScenes()` の順。したがって timer 駆動の変更は同一ティックで描画されるが、UI 駆動 (メッセージハンドラ) の変更は次ティックになる
- 毎フレーム走る GL アップロードは、`objectChanged()` 等のイベントハンドラではなく `display()` に遅延させると、フレーム単位で自然にコアレスされる

あわせて `:62` の "Rule of thumb: file location determines execution thread" の記述で services が「runs **synchronously** inside the Web Worker」とある点は誤解を招く。実装は `WorkerService.ts:193` で `Promise.resolve().then(...)` にラップされており、**メッセージハンドラタスクのマイクロタスク**として走る。「同期」は「C++ ラッパに await しない」の意であって rAF タイミングの保証ではない、と注記を足す。

---

## 7. Phase 1 — 受け入れ条件と検証

### 7.1 受け入れ条件

1. native OpenGL ビルドと tritium (WebGL2) ビルドの両方で、CPK 表示が**従来と視覚的に同一**であること (色・半径・シルエット・エッジ)
2. MorphMol 再生中に `renderCoordTexImpl()` が**再実行されない**こと (ログまたはカウンタで確認)
3. `animtest_molmorph3_frame_cpk.qsc` の再生が**現状の約 3 fps を大きく上回る**こと。ただし `*selection` レンダラを切り離した状態で正味の効果を測ること (§7.4)
4. `createFloatDataTexture()` が `nullptr` を返す状況で、従来の `SphereGpuPrim` 経路にフォールバックして正常描画されること
5. `pdc->isFile()` (レイトレース/ファイル出力) が従来どおり動作すること
6. `MolCoord` / `MolAtom` / `MorphMol` / `AnimMgr` / `ObjectEvent` / `DispCacheRenderer` / `SphereGpuPrim` / `EcBufferRep` に**変更が無い**こと (`git diff --stat` で確認)
7. `pnpm test` (tritium) の `gfxManagerContract.test.ts` が通ること
8. ヒットテスト (原子のピック) がアニメ後も正しい位置を返すこと
9. **`react-gui/src/renderer/` のうち `components/` / `hooks/` / `worker/client/` に変更が無い**こと。本変更は worker/server + C++ で完結する (§2.10)。`git diff --stat` で確認
10. **`objectChanged()` から GL 呼び出しが発生しない**こと。アップロードは `display()` に遅延している (§3.9)。コードレビューで確認
11. **1 タスク内で座標が複数回変更されても、アップロードはフレーム 1 回に収束する**こと。UI からプロパティをドラッグ操作して `updateCoordTex()` の呼び出し回数をカウントし、フレーム数を超えないことを確認する (§7.4)

### 7.2 テストデータとベースライン

**専用のテストシーンが用意されている。これを使うこと。**

| ファイル | レンダラ | 現状の実測 fps |
|---|---|---|
| `~/Dropbox/works/test_data/animtest_molmorph3_frame_cpk.qsc` | `cpk` (`CPK2Renderer`) + `*selection` | **約 3 fps** |
| `~/Dropbox/works/test_data/animtest_molmorph3_frame.qsc` | `simple` (`SimpleRenderer`) + `*selection` | 約 1 fps |

**Phase 1 の対象は前者 (`_cpk` 付き)**。後者は Phase 1 の範囲外 (§8.5)。

シーンの構成 (XML ヘッダより):

```xml
<object type="MorphMol" name="mol1" src="datachunk:00001" srctype="qdfmol">
  <coloring type="PaintColoring"> ... </coloring>
  <renderer type="*selection" group=""/>
  <renderer type="cpk" group="" name="simple1" style="DefaultCPK,DefaultCPKColoring"/>
  <frames>
    <this/>
    <mol src="datachunk:00000" srctype="qdfmol" name="mol2"/>
  </frames>
</object>
<animation length="6" loop="true">
  <motion type="MolAnim" ... mol="mol1" prop="frame" start="0" end="3" startValue="0" endValue="1"/>
  <motion type="MolAnim" ... mol="mol1" prop="frame" start="3" end="6" startValue="1" endValue="0"/>
</animation>
```

- 大きめの分子の一部分が動く 2 フレームの morph
- `MolAnim` が `frame` を 0→1 (0-3s) / 1→0 (3-6s) で駆動、`loop="true"`
- つまり **AnimMgr のタイマー駆動経路** (§2.10 の上段) を通る。`objectChanged()` は rAF 内で走り、同一ティックで描画される
- **注意**: `style="DefaultCPKColoring"` はカラーリングのスタイル名であって CPK レンダラのことではない。レンダラの種別は `type` 属性で決まる (`CPK2Renderer::getTypeName()` が `"cpk"` を返す、`src/modules/molvis/CPK2Renderer.cpp:31-34`)

### 7.3 機能検証の手順

1. `animtest_molmorph3_frame_cpk.qsc` を tritium で開く
2. アニメーションを再生する (`animPlay` / アニメーション UI。`animDetail.service.ts:448` が `className === "MorphMol"` でアニメ対象として拾う)
3. 補間が滑らかに描画され、座標が実際に追従することを目視確認
4. 変更前 (`git stash`) と描画結果を比較する。色・半径・シルエット・エッジが一致すること
5. native OpenGL ビルドでも同じシーンを開いて確認する

### 7.4 性能検証

**ベースラインは約 3 fps (`animtest_molmorph3_frame_cpk.qsc`)。これを大きく上回ること。**

#### まず `*selection` レンダラを切り離して測ること

このシーンには `*selection` (`SelectionRenderer`) が同居している。`SelectionRenderer::objectChanged()` (`src/modules/molstr/SelectionRenderer.cpp`) は `OBE_PROPCHG` + `descr=="sel"` しか特別扱いせず、その後 `super_t::objectChanged(ev)` に落ちるので、**`atomsMoved` では基底の全 invalidate が走り、毎フレーム再構築される**。Phase 1 では CPK2Renderer しか変換しないので、**SelectionRenderer の再構築コストが床として残る**。

同じシーン構成で `simple` 版が 1 fps、`cpk` 版が 3 fps と差が出ていることから、**支配的なコストは分子レンダラ自身の再構築であって SelectionRenderer ではない**と推定できる (SelectionRenderer が支配的なら両者は同じ fps になるはず)。ただしその寄与は未測定で、3 fps = 333ms のうち何割かは不明。

したがって計測手順は:

1. **シーンから `<renderer type="*selection" .../>` を削除した版**を作り、それで変更前後を測る。これが CPK2Renderer の direct update の正味の効果
2. 次に `*selection` を戻した版で測る。ここで頭打ちになるなら、SelectionRenderer が新たな律速になったということ (§8.5 の対象)

CPK の再構築がゼロになっても `*selection` 込みで劇的に改善しない場合、それは**設計の失敗ではなく §9.6 の「遅い方が律速する」が効いているだけ**。切り分けずに結論を出さないこと。

#### 計測の道具

tritium 側には計測の仕掛けが既にある。

- `tritium/react-gui/src/renderer/worker/server/perf.ts` の `PERF_MEASURE` (`:8`) を `true` にすると計測が有効になる (現在は `false`)
- `frameTimeMs` / `frameTimeMaxMs` / `frameCount` などが出る
- **注意**: `BYPASS_WRAP_GL` (`:14`) は `true` のままにすること。`false` にすると全 GL 呼び出し後に `gl.getError()` が入り CPU/GPU パイプラインが同期して測定が無意味になる (`perf.ts:11-13` のコメント参照)
- 計測が終わったら `PERF_MEASURE` を `false` に戻す

C++ 側は `renderCoordTexImpl()` と `updateCoordTex()` に `MB_DPRINTLN` を入れて呼び出し回数を数えるのが簡単。**受け入れ条件 2 と 11 の確認は必須**:

- **条件 2**: MorphMol 再生中に `renderCoordTexImpl()` のログが出ないこと (出ていたら全再構築が残っている)
- **条件 11**: UI からプロパティをドラッグ操作したとき、`updateCoordTex()` のログ数が rAF フレーム数を超えないこと。超えていたら §3.9 の遅延が効いていない

### 7.5 検証の限界 (承知の上で進めること)

- **MorphMol では「CPU 作業ゼロ」には到達しない**。`MorphMol::update()` は本質的に補間なので O(原子数) のループが必ず残り、加えて `updateCoordTex()` が O(原子数) の再収集を行う。Phase 1 で得られるのは「O(ジオメトリ全再構築) → O(原子数)」であって、目標である「trajectory memory → texture の転送だけ」は Phase 2 で初めて見える
- **規模の検証にならない**。MorphMol は通常フレーム数も原子数も小さいので、テクスチャサイズや転送帯域のストレスにはならない。10 万原子級の確認は Phase 2 で行う
- **CPK は座標テクスチャの主眼を実証しない**。1 原子 = 1 球で座標の共有が無いため、indirection による重複除去の利得はゼロ。この設計の本当の価値は結合 (1 原子が複数の結合に現れる) やスプライン (制御点の共有) で出る。Phase 1 が実証するのは **WebGL2 の機構が動くこと**であって、設計の価値ではない

---

## 8. Phase 1 の範囲外 (別課題として記録)

### 8.1 真のインスタンシング化

現在の `SphereGpuPrim` / `CylinderGpuPrim` は 1 球/1 円柱あたり 4 頂点にデータを複製している (§2.6)。一方 `LineGpuPrim` は既に `setNumInstances(nlines)` + `setAttrDivisor(0..3, ndiv)` で真のインスタンシングを使っている (`src/gfx/LineGpuPrim.cpp:59-86`)。`vertexAttribDivisor` / `drawArraysInstanced` / `drawElementsInstanced` は WebGL2 (`BufferStore.ts:100, 196, 203`) と native (`OcBufferRep.cpp:158, 186, 196`) の**両方で実装済み**。

Sphere/Cylinder を `LineGpuPrim` と同じ形に揃えれば、静的描画のメモリと帯域が 1/4 になる。座標テクスチャとは独立に得なので、別課題として実施すべき。

関連: 参照実装の `sphere_vertex.glsl` は `a_impos` 属性を廃止して `vec2 impos = dsps[gl_VertexID%4];` (`:43`) で頂点 ID から導出していた。develop の `sphere2_vertex.glsl:27` は `layout(location = 1) in vec2 a_impos;` と属性に戻しており、この点は退行している。`gl_VertexID` は GLSL ES 3.00 コア。

### 8.2 spline / tube は別プリミティブが必要

チューブの頂点は原子座標から直接は決まらない。制御点を平滑化して 3 次スプライン係数にしてから断面を展開するので、テクスチャに載せるべきは原子座標ではなく**係数**。参照実装の `GLSLTube2Renderer::updateCrdGLSL()` (`src/modules/molvis/GLSLTube2Renderer.cpp:262-276`) は `m_pCoefTex->setData(nCtlPts * 4, 1, 1, pSeg->m_scoeff.getCoefArray())` とスプライン係数・binormal 係数を送っている。

これは「レンダラごとの shader が必要」ということではなく「**別のプリミティブが必要**」と捉えるべき (係数テクスチャを受け取る `TubeGpuPrim` のような形)。ただし係数計算自体は CPU に残るので、sphere/cylinder ほどきれいには CPU 作業がゼロにならない。

### 8.3 レンダラごとの shader は不要

参照実装は GLSL レンダラごとに shader を持っていたが (`GLSLCPK3Renderer` / `GLSLBallStick2Renderer` / `SimpleRendGLSL` / ...)、これは当時 `GpuPrim` 抽象が無く各レンダラが自前で VBO とシェーダを組んでいたためで、必然ではない。**shader はプリミティブ単位のまま、レンダラ間で共有できる** (CPK2Renderer と BallStickRenderer が同じ球シェーダを使う)。変わるのはデータレイアウトであって shader の粒度ではない。

必要なのは各プリミティブに「直接座標版」と「index 版」の 2 バリアントを持つことで、それは §6 Step 3 の方式 (共通 body + `#define` 違いの薄いラッパ 2 ファイル) で実現する。

### 8.4 座標テクスチャの所有権 (Phase 2 で移動する)

Phase 1 では `CPK2Renderer` が座標テクスチャを所有する。しかしこれは Phase 1 限りの割り切りで、**1 分子に CPK と BallStick と Spline が付いていれば、同じ座標を毎フレーム 3 回アップロードすることになる**。参照実装も各 GLSL レンダラが自前の `m_pCoordTex` を持っていた (`GLSLCPK3Renderer.hpp:75`, `SimpleRendGLSL.hpp:70`)。

Phase 2 で `AnimMol` が座標テクスチャを 1 枚持ち、レンダラは `bind` して index 属性だけ自前で持つ形に移す (§9.3)。tritium の GL コンテキストが 1 本 (§2.4) なので、オブジェクト側所有でコンテキスト不整合は起きない。

### 8.5 次に変換すべきは `SimpleRenderer`、その次に `SelectionRenderer`

Phase 1 の直後の課題として記録する。

**`SimpleRenderer`** — テストシーン `animtest_molmorph3_frame.qsc` (約 1 fps、§7.2) が使っているレンダラであり、実測ベースラインがある。しかも CPK より条件が良い:

- `LineGpuPrim` は**既に真のインスタンシングを使っている** (`src/gfx/LineGpuPrim.cpp:59-86` の `setNumInstances(nlines)` + `setAttrDivisor(0..3, ndiv)`)。`SphereGpuPrim` の 4 頂点複製問題 (§2.6, §8.1) が無いので、そのまま index 版を作れる
- `SimpleRenderer::objectChanged()` は既に `descr=="atomsMoved"` を見ている (`src/modules/molstr/SimpleRendererGLSL.cpp:218-230`)
- **座標テクスチャの本当の価値が初めて実証されるのはここ**。CPK は 1 原子 = 1 球で座標の共有が無いため indirection の利得はゼロだが (§7.5)、結合は 1 原子が複数の結合に現れるので `LineElem { x1,y1,z1, x2,y2,z2, ... }` では原子座標が結合本数ぶん複製される。テクスチャならその重複が消え、中点計算も GPU に移る

CPK より手間がかかる点:

- 結合は原子を AID で参照し、レンダラは**結合を列挙する**ので、CPK のような「列挙順 = テクセル index」が成立しない。**原子リストと AID → テクセル index のマップが要る** (参照実装の `SimpleRendGLSL` は `m_sels` がこれ)
- 単結合 / 多重結合 (二重・三重) / 孤立原子の 3 経路がある

参照実装が揃っている: `src/modules/molstr/SimpleRendGLSL.{hpp,cpp}`、`src/modules/molstr/simple_vertex.glsl` (原子 index を `a_ind12` 属性で渡し、`ind2` の符号で「結合の中点」と「孤立原子の星形 6 方向」をエンコードする)、`src/modules/molstr/dblbon_vert.glsl`。非 WIN32 では `sampler2D` 経路が既定で動いていた (§2.2)。

**`SelectionRenderer`** — テストシーン両方に同居しており、`atomsMoved` で毎フレーム再構築される (§7.4)。Phase 1 完了後もこれが床として残るので、CPK を変換しても頭打ちになるならここが次の律速。参照実装は `src/modules/molstr/SelectionRenderer.cpp:354` に `updateDynamicVBO()` を持つ。

---

## 9. Phase 2 — MD Trajectory (概要)

Phase 1 完了後に着手する。ここでは方針のみ記す。着手時に別途詳細プランを起こすこと。

### 9.1 依存関係

```
AnimMol (molstr)  ←  Trajectory (mdtools)
TrajBlock         ←  DCDTrajReader, Trajectory
座標テクスチャ     ←  AnimMol   (Phase 1 から所有権を移す)
```

`TrajBlock` / `DCDTrajReader` / `FortBinStream` は **`AnimMol` に依存しない**。純 I/O で設計リスクがゼロ、gtest で headless に検証できる (`tests/modules/importers/test_grofilereader.cpp` が前例)。**Phase 1 と並行して進められる**し、別の担当に切り出せる。

### 9.2 移植元 (参照実装)

| クラス | 参照実装のパス | 備考 |
|---|---|---|
| `AnimMol` | `src/modules/molstr/AnimMol.{hpp,cpp,qif}` | **そのまま移植しない**。§3.8 の方針で削減する |
| `Trajectory` | `src/modules/mdtools/Trajectory.{hpp,cpp,qif}` | `std::deque<TrajBlockPtr>` でブロック連結。`frame` / `dynframe` / `nframe` / `frame_aver_size` |
| `TrajBlock` | `src/modules/mdtools/TrajBlock.{hpp,cpp,qif}` | `qsys::Object`。遅延ロード機構を持つ |
| `DCDTrajReader` | `src/modules/mdtools/DCDTrajReader.{hpp,cpp,qif}` | 実装済みで動作する。seek 併用の遅延ロードあり |
| `FortBinStream` | `src/modules/mdtools/FortBinStream.{hpp,cpp}` | DCD 用 Fortran 非整形バイナリ |
| `XTCTrajReader` | — | **移植しない**。`readHeader` / `readBody` / `loadFrm` が全て空のスタブ (`XTCTrajReader.cpp:74-89`)。`docs/plans/gro_reader_planning_brief.md:80-81` は vendored xdrfile か chemfiles による新規実装を想定している |

### 9.3 主な作業

1. `AnimMol` を molstr に導入 (§3.8 の削減版。`getCrdArrayImpl()` / `createIndexMapImpl()` の純粋仮想、index map、変更シリアル、座標テクスチャの保持)
2. 座標テクスチャの所有権を `CPK2Renderer` から `AnimMol` へ移す。シリアル比較で 1 フレーム 1 回のアップロードに収束させる (`m_nValidFlag` は 3 状態フラグなので「今フレームで既にアップロード済みか」を表現できない。単調増加のシリアルが必要)
3. `CPK2Renderer` の index を「列挙順 `i`」から「`AnimMol::getCrdArrayInd(aid)`」に変える。`AnimMol` は**全原子**を CrdArray index 順で持つので、部分選択でも CPU gather は不要になる (参照実装は `m_bUseSels` のとき `m_coordbuf` に詰め直していたが、それはテクスチャがレンダラ所有だったため)
4. `MorphMol` を `AnimMol` 派生に付け替える。参照実装の `MorphMol::update()` (`src/modules/anim/MorphMol.cpp:480-515`) が参照実装。ただし §3.8 の方針により、CrdArray と MolAtom の**両方**に書く
5. `TrajBlock` / `DCDTrajReader` / `FortBinStream` を移植 (並行可)
6. `Trajectory` を移植して繋ぐ

### 9.4 入口 (reader) が存在しない問題

参照実装では `PsfReader::createDefaultObj()` が `Trajectory` を返すのが入口だった (`src/modules/mdtools/PsfReader.cpp:57-60`)。**develop の `PsfReader` は `ObjReader` ですらない**。`attach(MolCoordPtr)` + `read(InStream)` の素のヘルパクラスに作り替えられており、`NAMDCoorReader.cpp:144` がスタック上で `PsfReader psf;` と使っている。

ただしこれは好都合で、PSF パースが再利用可能なヘルパとして切り出されているので、薄い reader を新設すれば済む。

```cpp
qsys::ObjectPtr PsfTrajReader::createDefaultObj() const
{
    return qsys::ObjectPtr(MB_NEW Trajectory());
}

bool PsfTrajReader::read(qlib::InStream &ins)
{
    TrajectoryPtr pTraj(getTarget<Trajectory>());
    PsfReader psf;
    psf.attach(pTraj);   // Trajectory is a MolCoord via AnimMol
    psf.read(ins);
    pTraj->setup();
    return true;
}
```

`.qif` を書き、`mdtools.moddef` と `mdtools.cpp` の `registReader<>()` に登録する。参照実装の `readSel()` (部分原子読み込み) は最初は省略してよい。

### 9.5 `OBE_CHANGED_DYNAMIC` を導入する場合の必須事項

Phase 2 で `OBE_CHANGED_DYNAMIC` を導入するなら、**enum を足すだけでは不十分**。参照実装の `DispCacheRenderer::objectChanged()` は既定実装で dynamic 系イベントも受けて全 invalidate している:

```cpp
// 参照実装 src/qsys/DispCacheRenderer.cpp
// Default implementation:
//   Treat changed and changed_dynamic events as the same
if (ev.getType()==ObjectEvent::OBE_CHANGED ||
    ev.getType()==ObjectEvent::OBE_CHANGED_DYNAMIC ||
    ev.getType()==ObjectEvent::OBE_CHANGED_FIXDYN) {
  invalidateDisplayCache();
}
```

これが**未変換レンダラの段階的移行を成立させている機構**。develop の同メソッド (`src/qsys/DispCacheRenderer.cpp:71-86`) は `OBE_CHANGED` しか見ていないので、`OBE_CHANGED_DYNAMIC = 4` を足して基底のこの分岐を直さないと、**未変換レンダラはイベントを黙って無視して古い座標を表示し続ける**。

### 9.6 段階的移行について

`DispCacheRenderer` の既定動作が全 invalidate である限り、**未変換レンダラは「遅いが正しい」まま共存できる**。同じオブジェクトに CPK2 (direct) と BallStick (full rebuild) が同時に付いていても両方正しく描ける。

**実務上の注意**: 混在時は遅い方が律速する。CPK2 だけ direct 化しても、同じシーンに BallStick が居れば毎フレーム全再構築が走るので体感は速くならない。性能検証は CPK 単独のシーンで行うこと。

---

## 10. 既知の制限

Phase 1 完了時点で残る制限。ドキュメントに残し、必要になった段階で対処する。

1. **トポロジ変化の検知**: `updateCoordTex()` は `m_aidcache` の AID で原子を引き直すので、原子が削除されていれば `getAtom()` が null を返して全再構築にフォールバックする。しかし**原子数が同じで中身が入れ替わった**ケースは検知できない。`descr=="atomsMoved"` は座標のみの変化を意味するので、実用上は問題にならないはず。参照実装は `MolCoord::appendAtom` / `removeAtom` から `invalidateCrdArray()` を呼んで index map を捨てていた (`MolCoord.cpp:266, 327`) が、Phase 1 ではこのフックを入れない
2. **色の動的更新は非対応**: 色が変わる場合は `OBE_PROPCHG` 経由で全再構築される (従来どおり)。座標テクスチャ方式では色は VBO の不変データなので、色だけ更新したい場合は別途対応が要る
3. **`gl.RGB32F` の実装差**: 問題が出たら `RGBA32F` + 4 コンポーネント (16 バイト/原子) に切り替える。上限や設計の議論は変わらない
4. **`MAX_TEXTURE_SIZE` を照会していない**: tritium は `getParameter` を 1 件も呼んでおらず、`ElecViewCap` (`tritium/core/cxx_src/ElecViewCap.hpp:22-33`) も GL を触らない静的スタブ。幅 1024 固定なら実用上安全だが、`natoms > 1024 * MAX_TEXTURE_SIZE` のガードは無い。必要なら `getParameter(gl.MAX_TEXTURE_SIZE)` の plumbing を追加する
5. **大きな確保のリスク**: `docs/architecture/umbreon-process-isolation.md` が renderer worker 内の大確保が Chromium の PartitionAlloc で OOM crash する件を扱っている。座標テクスチャは 10 万原子で 1.2MB (RGB32F) なので問題にならない規模だが、Phase 2 でトラジェクトリ全体を worker 内に置く場合は要検討

---

## 11. 参照

### 本リポジトリ (develop)

- `tritium/docs/architecture/buffer-alloc-routing.md` — V8 cage へのゼロコピー routing。frame 0 の実測内訳 (ジオメトリ生成が 82%)
- `docs/architecture/gtao-screen-space-ao.md` — `gfx::DataTexture` / `OcDataTexture` 新設の経緯。WebGL2 の制約 (`sampler2DMS` 非対応等) の記述あり
- `docs/architecture/umbreon-process-isolation.md` — renderer worker 内の大確保と PartitionAlloc OOM
- `tritium/CLAUDE.md` — worker ディレクトリ構成、IPC パターン、OffscreenCanvas / WebGL ライフサイクル制約
- `docs/plans/gro_reader_planning_brief.md` — `.xtc` / `.trr` は将来課題で vendored xdrfile か chemfiles を想定 (`:80-81`)

### 参照実装 (`/Users/user1/proj64/cuemol2_png`, dev201608)

- `src/modules/molstr/AnimMol.{hpp,cpp,qif}` — CrdArray 抽象基底
- `src/modules/molstr/lib_atoms.glsl` — 座標テクスチャのフェッチヘルパ。非 WIN32 では `sampler2D` 経路が既定として動作していた (§2.2)
- `src/modules/molvis/GLSLCPK3Renderer.{hpp,cpp}` — 座標テクスチャ版 CPK。`updateDynamicGLSL()` (`:296-336`) が本方式の原型
- `src/modules/molvis/sphere_vertex.glsl` — `gl_VertexID%4` からインポスタ角を導出する版 (§8.1)
- `src/modules/mdtools/` — Trajectory / TrajBlock / DCDTrajReader / FortBinStream
- `src/qsys/DispCacheRenderer.cpp` — dynamic イベントの既定フォールバック (§9.5)
- `src/qsys/ObjectEvent.hpp:25-36` — 4 種のイベント型定義

参照実装のブランチ確認: `cd /Users/user1/proj64/cuemol2_png && git branch --show-current` → `dev201608`
