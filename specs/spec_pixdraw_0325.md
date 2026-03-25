# Pixel buffer/drawing
今のPixel buffer drawの実装は、
src/sysdep/ogl_core/OcPixDraw.{hpp,cpp}
src/sysdep/ogl_core/pixdraw_{vert,frag}.glsl
にあるが、
既存のsrc/gfx/DrawObj2.hppにあるDrawObj2のインタフェイスに
組み込むことができるか考える。

特に、OcPixDrawのうち、OcTexRepは、OpenGL dependentな、textureの実装を押し込めているので、これはsysdep/ogl_coreに残すが、
それ以外の部分、textureのimposter geometryなどは、OpenGL依存を排しDrawObj2 subclassとしてgfxに巻き上げられるか検討

## 実装結果 (2026-03-25)

### 設計方針

`PixRep` に `bind()/unbind()` 仮想メソッドを追加し、VBORep と同様のインタフェースを整備した上で、
以下の分離を実現した：

| 部分 | 配置 |
|------|------|
| Quad ジオメトリ・シェーダーロード・Uniform 設定・drawElem 呼び出し | `gfx::PixDrawObj2`（新規） |
| GL テクスチャ bind/unbind | `OcTexRep::bind()/unbind()`（sysdep/ogl_core） |
| OcTexRep 生成（glGenTextures + glTexImage2D） | `OcDisplayContext::drawPixels()`（sysdep/ogl_core） |

### 変更ファイル

- `src/gfx/PixelBuffer.hpp`: `PixRep` に `bind(int texUnit)/unbind()` 純粋仮想を追加
- `src/gfx/PixDrawObj2.hpp` (新規): `BaseDrawObj2` を継承した quad 描画クラスの定義
- `src/gfx/PixDrawObj2.cpp` (新規): `init()` でシェーダーロード・quad 確保、`draw()` で `pRep->bind()/unbind()` を呼び出し
- `src/gfx/CMakeLists.txt`: `PixDrawObj2.cpp` を `GFX_SRCS` に追加
- `src/sysdep/ogl_core/OcPixDraw.hpp`: `OcPixDraw` クラスを削除、`OcTexRep` に `bind()/unbind()` を追加
- `src/sysdep/ogl_core/OcPixDraw.cpp`: `OcTexRep::bind()/unbind()` 実装（GL_TEXTURE_2D）、`OcPixDraw` メソッドを削除
- `src/sysdep/ogl_core/OcDisplayContext.hpp`: `m_pOcPixDraw` → `m_pPixDrawObj (gfx::PixDrawObj2*)`
- `src/sysdep/ogl_core/OcDisplayContext.cpp`: `drawPixels()` を `PixDrawObj2` + `OcTexRep` を使う実装に更新

シェーダーファイル（`pixdraw_vert.glsl`, `pixdraw_frag.glsl`）は変更なし。

### 将来の拡張性

`PixRep::bind()/unbind()` は抽象インタフェースなので、将来 `GLSLMapMeshRenderer` 等の
3D texture (GL_TEXTURE_BUFFER) ケースも `OcBufTexRep` を実装することで同じインタフェースに統一できる：

| | OcTexRep (2D) | OcBufTexRep (buffer texture、未実装) |
|--|---------------|--------------------------------------|
| bind | glBindTexture(GL_TEXTURE_2D, id) | glBindTexture(GL_TEXTURE_BUFFER, id) |
| unbind | glBindTexture(GL_TEXTURE_2D, 0) | glBindTexture(GL_TEXTURE_BUFFER, 0) |


