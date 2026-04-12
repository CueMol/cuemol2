# 目的
src/modules/xtal/GLSLMapMeshRenderer.cpp
のOpenGL直書き実装をなんとかする。

# 実装
specs/spec_pixdraw_0325.md
を参考に、src/gfx/PixDrawObj2.{hpp,cpp}を実装したケースと同様に、
shader/vbo関連はDrawObj2 subclassとしてgfxに巻き上げ
3D Texture関連は、gfx::PixRepとsysdep::OcTexRepのケースを参考に、実装する。

---

# 実装プランと結果 (2026-03-25)

## 方針

- 既存の `GLSLMapMeshRenderer` は**変更せず残す**（デバッグ比較用）
- 新実装を `GLSLMapMeshRenderer2`（renderer type名: `gpu_mapmesh2`）として別クラスで作成
- sysdep依存をxtalモジュールから排除し、gfx抽象レイヤー経由のみに

## レイヤー構造

```
gfx layer (abstraction):
  - gfx::BufTexRep            (新規 abstract class, PixRep対称)
  - gfx::DisplayContext       createBufTexRep() 追加

sysdep layer (OpenGL implementation):
  - sysdep::OcBufTexRep       (新規, OcTexRepを手本)
  - sysdep::OcDisplayContext  createBufTexRep() override 追加

xtal layer (xtal-specific):
  - xtal::MapBufTex           (新規, CPU Array3D + GPU BufTexRep ペア管理)
  - xtal::MapMeshDrawObj2     (新規, shader + instanced draw)
  - xtal::GLSLMapMeshRenderer2 (新規, sysdep非依存の新Renderer)
  - xtal::GLSLMapMeshRenderer  (変更なし)
```

## 設計上の判断・トレードオフ

### `drawArraysInstanced` をDisplayContextに追加しない

当初 `DisplayContext::drawArraysInstanced(int mode, int first, int count, int instanceCount)` を追加する案を実装したが、引数にOpenGL固有値（`0x0001` = GL_LINES等）を渡すことになり抽象化の意味がなくなるため破棄。

代替策として `OcBufferRep::draw()` の既存パスを流用:
- `DrawAttrArray<quint8>` に `setAttrSize(0)`, `alloc(2)`, `setDrawMode(DRAW_LINES)` でダミー要素作成
- `setNumInstances(ncol*nrow*nsec*3)` でインスタンス数をセット
- `pDC->drawElem(*m_pDrawElem)` で `OcBufferRep::draw()` → `glDrawArraysInstanced` へ

### MapBufTex のコピーコンストラクタ

`GLSLMapMeshRenderer2` が `MC_CLONEABLE` マクロを持つため、コピーコンストラクタが生成される。
`MapBufTex` はvalue memberとして保持されるため、CPUデータのみコピーしGPU repはリセットするコピーコンストラクタが必要:
```cpp
MapBufTex(const MapBufTex &src) : m_data(src.m_data), m_pRep(nullptr) {}
```

## 変更・追加ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/gfx/PixelBuffer.hpp` | 変更 | `gfx::BufTexRep` abstract class 追加 |
| `src/gfx/DisplayContext.hpp` | 変更 | `createBufTexRep()` virtual method 追加 |
| `src/gfx/DisplayContext.cpp` | 変更 | `createBufTexRep()` デフォルト実装 (return nullptr) |
| `src/sysdep/ogl_core/OcBufTexRep.hpp` | **新規** | GL_TEXTURE_BUFFER実装 |
| `src/sysdep/ogl_core/OcBufTexRep.cpp` | **新規** | glGenBuffers/glTexBuffer等 |
| `src/sysdep/ogl_core/OcDisplayContext.hpp` | 変更 | `createBufTexRep()` override宣言 |
| `src/sysdep/ogl_core/OcDisplayContext.cpp` | 変更 | `createBufTexRep()` 実装追加 |
| `src/sysdep/CMakeLists.txt` | 変更 | `OcBufTexRep.cpp` 追加 |
| `src/modules/xtal/MapBufTex.hpp` | **新規** | CPU/GPUペア管理クラス |
| `src/modules/xtal/MapBufTex.cpp` | **新規** | create()/update() 実装 |
| `src/modules/xtal/MapMeshDrawObj2.hpp` | **新規** | xtal固有DrawObj2サブクラス |
| `src/modules/xtal/MapMeshDrawObj2.cpp` | **新規** | shader load + instanced draw |
| `src/modules/xtal/GLSLMapMeshRenderer2.hpp` | **新規** | 新Rendererヘッダ |
| `src/modules/xtal/GLSLMapMeshRenderer2.cpp` | **新規** | sysdep非依存の実装 |
| `src/modules/xtal/GLSLMapMeshRenderer2.qif` | **新規** | QIF登録 (gpu_mapmesh2) |
| `src/modules/xtal/xtal.moddef` | 変更 | GLSLMapMeshRenderer2 登録 |
| `src/modules/xtal/CMakeLists.txt` | 変更 | 新規4ファイル追加 |
| `src/modules/xtal/GLSLMapMeshRenderer.hpp` | **変更なし** | 旧実装保持 |
| `src/modules/xtal/GLSLMapMeshRenderer.cpp` | **変更なし** | 旧実装保持 |

## ビルド・テスト結果

- `task build_libcuemol2`: **成功**
- `task run_gtest`: **957テスト全て通過**

## 残タスク

- GUI動作確認: CCP4/DensityMapを読み込み、renderer type `gpu_mapmesh2` でmesh描画が正常に表示されることを確認（旧 `gpu_mapmesh` と比較）
