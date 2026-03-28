# 目的

DisplayListの実装をバックエンド非依存にする
specs/spec_drawobj2_0323.md
で実装した、BaseDrawObj2とそのsubclassesを利用して、
src/sysdep/ogl_core/OcDisplayList.{hpp,cpp}
の、バックエンド非依存版を実装する。

# Background

src/sysdep/ogl_core/OcDisplayList.{hpp,cpp}
は、OpenGL immediate modeのラッパー的な機能を実装している.
- Triangles (vertex only)
- Triangle meshes
- Lines
を使って、vertex()やcolor()などOpenGL immediate mode likeな呼び出しから、buffer objectを構築し、shaderによる描画を行っている。

# 実装

この実装を、
src/gfx/DrawObj2.{hpp,cpp}に実装した、
gfx::LineDrawObj2, gfx::TrigDrawObj2, gfx::TrigMeshDrawObj2
を用いた実装に移行する。
移行先は、
src/gfx/DisplayList.{hpp,cpp}
に、gfx::DisplayListとして実装する。

さらに、
src/sysdep/ogl_core/OcDisplayContext.cpp
のcreateDisplayListで生成されるDisplayList objectを、OcDisplayListから、
実装したgfx::DisplayListに切り替える

# プラン

## 新規作成ファイル

- `src/gfx/DisplayList.hpp` — `gfx::DisplayList` クラス宣言。`gfx::DisplayContext` を継承
- `src/gfx/DisplayList.cpp` — 実装本体

## 変更ファイル

- `src/gfx/CMakeLists.txt` — `DisplayList.cpp` / `DisplayList.hpp` を追加
- `src/sysdep/ogl_core/OcDisplayContext.cpp` — `createDisplayList()` / `callDisplayList()` / `isCompatibleDL()` を `gfx::DisplayList` 使用に変更

## 設計上の重要事項

### DrawObj2の遅延初期化

`LineDrawObj2::alloc()` / `TrigDrawObj2::alloc()` / `TrigMeshDrawObj2::alloc()` は、
いずれも内部で `MB_ASSERT(m_pPO != nullptr)` を持ち、`init(pdc)` (OpenGLコンテキストが
必要) を先に呼ぶ必要がある。

`recordEnd()` 時点ではOpenGLコンテキストが存在しない可能性があるため、DrawObj2 の
生成・初期化・データ充填は `callDisplayListImpl(pdc)` での**遅延初期化**で行う。
`recordEnd()` は `m_fValid = true` のセットと `convertToMesh()` (sphere/cylinder→mesh
変換) のみを実行する。

### 中間バッファの設計

| バッファ | 用途 | 変換先 |
|---|---|---|
| `std::deque<LineDrawAttr> m_lineBuf` | Lines蓄積 | `LineDrawObj2` |
| `std::deque<TrigVertBuf> m_trigBuf` | startTriangles()の三角形蓄積 | `TrigDrawObj2` |
| `GrowMesh<quint32> m_mesh` | strip/fan/sphere/cone のindexed mesh | `TrigMeshDrawObj2` |

`TrigVertBuf` は色を `quint32 cc` (devcode) で直接保持する設計にした。
`OcDisplayList` の `TrigVertAttr` が `qbyte r,g,b,a` で保持していたのに対し、
devcode → r/g/b/a → devcode の往復変換を不要にするための改善。

### drawMesh() の扱い

`drawMesh(const gfx::Mesh &mesh)` は、meshデータを `m_mesh` (GrowMesh) に
マージする方式を採用。OcDisplayList が `m_pTrigMesh` (DrawAttrElems) へ直接
構築していたのとは異なるが、`callDisplayListImpl()` での統一的な遅延初期化を
実現するために変更した。

# 実装結果

## 実装日

2026-03-25

## 実装したファイル

### 新規作成

- `src/gfx/DisplayList.hpp`
- `src/gfx/DisplayList.cpp`

### 変更

- `src/gfx/CMakeLists.txt` — GFX_SRCS に `DisplayList.cpp`、GFX_HDRS に `DisplayList.hpp` を追加
- `src/sysdep/ogl_core/OcDisplayContext.cpp`:
  - `#include <gfx/DisplayList.hpp>` を追加
  - `createDisplayList()`: `OcDisplayList` → `gfx::DisplayList` に変更
  - `callDisplayList()`: `dynamic_cast<OcDisplayList *>` → `dynamic_cast<gfx::DisplayList *>` に変更
  - `isCompatibleDL()`: 同上

## 動作確認

- ビルド成功 (エラーなし、warning のみ)
- gtest 960テスト全パス (`test_gfx`, `test_qlib`, `test_qsys`, `test_molstr` 等)
