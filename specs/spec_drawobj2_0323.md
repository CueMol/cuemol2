# DrawObj2の実装
BaseDrawObj2は、
- ShaderObject
- AbstDrawElem (OpenGL Buffer Objectの抽象化)
を保持し、描画するクラスのinterfaceを規定。
src/gfx/DrawObj2.hpp
に部分の実装がある。
このインタフェイスを持つ,
- Lines (class: LineDrawObj2)
- Triangles (class: TrigDrawObj2)
- Triangle Mesh (class: TrigMeshDrawObj2)
- Spheres (class: SphereDrawObj2)
- Cylinders (class: CylinderDrawObj2)
を実装する。

それぞれのDrawObj2 subclassesの実装は、以下を参考に実装する
- Lines
  - 今の実装はsrc/sysdep/ogl_core/GLSLLineHelper2.hpp/cpp
- Triangles
  - 今の実装はsrc/sysdep/ogl_core/GLSLTrigHelper.hpp
  - あるいは、src/sysdep/ogl_core/OcDisplayList.{hpp,cpp}の、TrigVertArray *m_pTrigArrayに関連した部分
  - Edge/silhouette描画機能あり
  - src/sysdep/ogl_core/trig_{vert,frag}.glsl
  - src/sysdep/ogl_core/trigedge_{vert,frag}.glsl
- Triangle Mesh
  - src/sysdep/ogl_core/OcDisplayList.{hpp,cpp}の、TrigMesh *m_pTrigMeshに関連した部分
  - Edge/silhouette描画機能あり
  - src/sysdep/ogl_core/trig_{vert,frag}.glsl
  - src/sysdep/ogl_core/trigedge_{vert,frag}.glsl
- Spheres
  - src/modules/molvis/GLSLSphereHelper.hpp
  - src/modules/molvis/sphere_{vertex,frag}.glsl
- Cylinders
  - src/modules/molvis/GLSLCylinderHelper.hpp
  - src/modules/molvis/cylinder_{vertex,frag}.glsl
  
ただし、いずれも、OpenGLには依存しない形で、gfx以下に実装する。
OpenGL依存部分は、
- ShaderObjectのsubclass (OglProgramObject)
- AbstDrawElemのsubclassが有するVBORep subclasses (OcBufferRep)
などにすでに実装してあるのでそれを使用すれば、バックエンド非依存なコードとして実装可能なはず。
もし足りないインタフェイスがある場合は、ShaderObjectやAbstDrawElemのインタフェイスの拡充を検討する。

現在の実装のうち、shader objectを生成する部分は、sysdep以下にある
ShaderSetupHelper (src/sysdep/ShaderSetupHelper.{hpp,cpp})に依存しているが、
このコードは部分的にqsysやgfxのレイヤーに巻き上げることが可能
DisplayContextにloadShaderObject methodを新設し、そこで処理を行う。
qsysのレイヤーに巻き上げる場合は、GUIDisplayContextのレベルで実装する。
例えば、ShaderObjMgr関連の操作は、ShaderObjMgrがqsys layerにあるのでGUIDisplayContextで実装
gfxのレイヤーに巻き上げる場合は、DisplayContextのレベルで実装する。
geometry shaderは使用していないので、移植する必要なし。

他にも、DisplayContextとそのsubclassにバックエンド依存実装が必要な部分は、
methodを拡充を検討

---

# 実装プラン（2026-03-23）

## 設計方針

### ShaderObject 取得方法

`ShaderSetupHelper` は `sysdep/` レイヤーにあり、`gfx/` から直接使えない。
また `ShaderObjMgr` は `qsys/` レイヤーにある。
→ 責任を以下のように分割した：

| レイヤー | クラス | 役割 |
|---------|--------|------|
| `gfx` | `DisplayContext` | `loadShaderObject()` / `createShaderObject()` 仮想宣言（デフォルト: nullptr） |
| `qsys` | `GUIDisplayContext` | `loadShaderObject()` をオーバーライド。`ShaderObjMgr` でキャッシュ確認し、なければ `createShaderObject()` を呼んで登録 |
| `sysdep` | `OcDisplayContext` | `createShaderObject()` をオーバーライド。実際の GLSL コンパイル（`OglProgramObject` 生成） |

Geometry shader は使用しないので、2シェーダー版（`vert` + `frag`）の overload のみ追加した。

### エッジ描画での生 GL コール問題

`GLSLTrigHelper::drawEdges()` の `glFrontFace(GL_CW)` は非抽象化されていた。
→ `DisplayContext` に `setFrontFace(bool bCCW)` 仮想メソッドを追加し、`OcDisplayContext` でオーバーライドした。

---

## 実装ステップ

### Phase 1: インフラ整備

**1-1. `DisplayContext` にメソッド追加** (`src/gfx/DisplayContext.hpp/.cpp`)
```cpp
virtual ShaderObject *loadShaderObject(
    const LString &name,
    const LString &vert_path,
    const LString &frag_path);   // default: nullptr

virtual ShaderObject *createShaderObject(
    const LString &name,
    const LString &vert_path,
    const LString &frag_path);   // default: nullptr

virtual void setFrontFace(bool bCCW = true) {}  // default no-op
```

**1-2. `GUIDisplayContext` でオーバーライド** (`src/qsys/GUIDisplayContext.hpp/.cpp`)
- `loadShaderObject()` をオーバーライド:
  1. `ShaderObjMgr::getShaderObject(name, sceneID)` でキャッシュ確認
  2. キャッシュになければ `createShaderObject()` を呼び出し
  3. 結果を `ShaderObjMgr::registerShaderObject()` で登録して返す

**1-3. `OcDisplayContext` でオーバーライド** (`src/sysdep/ogl_core/OcDisplayContext.hpp/.cpp`)
- `createShaderObject()` → `OglProgramObject` を生成してGLSLをコンパイル・リンク
- `setFrontFace()` → `glFrontFace(bCCW ? GL_CCW : GL_CW)`

### Phase 2: `BaseDrawObj2` インタフェース拡充

`src/gfx/DrawObj2.hpp` の `BaseDrawObj2` に純粋仮想メソッドを追加:
```cpp
virtual bool init(DisplayContext *pDC) = 0;
virtual void draw(DisplayContext *pDC) = 0;
virtual void invalidate() = 0;
virtual bool isValid() const = 0;
```

### Phase 3: 各サブクラスの実装

実装ファイル: `src/gfx/DrawObj2.hpp`（ヘッダ）+ `src/gfx/DrawObj2.cpp`（実装）

#### 3-1. `SphereDrawObj2`（参考: `modules/molvis/GLSLSphereHelper`）
```
頂点構造体 SphElem:
  float cenx,ceny,cenz; float dspx,dspy; float rad; uint8 r,g,b,a;
DrawAttrElems<quint32, SphElem>: 4頂点×N球, 6インデックス×N球
インスタンシング (divisor=1) + DRAW_TRIANGLES
GLSL: sphere_vertex.glsl / sphere_frag.glsl
```
追加メソッド: `alloc(int nsph)`, `setData(int, Vector4D, float, quint32)`, `draw()`

#### 3-2. `CylinderDrawObj2`（参考: `modules/molvis/GLSLCylinderHelper`）
```
頂点構造体 CylElem:
  float cenx,ceny,cenz; float dirx,diry,dirz; float dspx,dspy; float rad; uint8 r,g,b,a;
DrawAttrElems<quint32, CylElem>: 4頂点×N, 6インデックス×N
インスタンシング (divisor=1) + DRAW_TRIANGLES
GLSL: cylinder_vertex.glsl / cylinder_frag.glsl
```
追加メソッド: `alloc(int ncyl)`, `setData(int, Vector4D, Vector4D, float, quint32)`, `draw()`

#### 3-3. `TrigDrawObj2`（参考: `sysdep/ogl_core/GLSLTrigHelper`）
```
頂点構造体 TrigVertAttr:
  float x,y,z; float nx,ny,nz; uint8 r,g,b,a;
DrawAttrElems<quint32, TrigVertAttr>: DRAW_TRIANGLES
GLSL: trig_vert.glsl / trig_frag.glsl
エッジ描画: trigedge_vert.glsl / trigedge_frag.glsl（別 ShaderObject）
```
追加メソッド: `alloc(int nverts, int nfaces)`, `setVertex/Normal/Color/Face(...)`, `setEdgeLineType()`, `draw()`

#### 3-4. `TrigMeshDrawObj2`
`TrigDrawObj2` と同じ頂点構造体・シェーダー。`DrawObjSet::allocTrigMesh()` に対応するインタフェースを持つ独立クラス。

#### 3-5. `LineDrawObj2`（参考: `sysdep/ogl_core/GLSLLineHelper2`）
```
頂点構造体 LineElem:
  float x1,y1,z1; float x2,y2,z2; uint8 r1,g1,b1,a1; uint8 r2,g2,b2,a2;
DrawAttrElems<quint32, LineElem>: 固定インデックス{0,1,2,2,1,3}
インスタンシング (divisor=1) + DRAW_TRIANGLES
GLSL: linew2_vert.glsl / linew_frag.glsl
```
追加メソッド: `alloc(int nlines)`, `setLine(int, Vector4D, quint32, Vector4D, quint32)`,
`setLineWidth(float)`, `setStipple(bool)`, `setNoDepth(bool)`, `draw()`

### Phase 4: CMakeLists.txt 更新

`src/gfx/CMakeLists.txt` に `DrawObj2.cpp` を追加。

### Phase 5: gtest 作成

`src/tests/gfx/test_drawobj2.cpp` を新規作成、`test_gfx` バイナリに追加。

- `MockShaderObject`: `getAttribLocation()` が 0 を返すスタブ
- `MockDisplayContext`: `loadShaderObject()` が `MockShaderObject` を返す。`drawElem()` は no-op。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/gfx/DisplayContext.hpp/.cpp` | `loadShaderObject()`, `createShaderObject()`, `setFrontFace()` 追加 |
| `src/qsys/GUIDisplayContext.hpp/.cpp` | `loadShaderObject()` オーバーライド（ShaderObjMgr キャッシュ管理） |
| `src/sysdep/ogl_core/OcDisplayContext.hpp/.cpp` | `createShaderObject()`, `setFrontFace()` オーバーライド |
| `src/gfx/DrawObj2.hpp` | `BaseDrawObj2` 拡充、全サブクラスのヘッダ追加 |
| `src/gfx/DrawObj2.cpp` | 新規作成（全実装） |
| `src/gfx/CMakeLists.txt` | `DrawObj2.cpp` 追加 |
| `src/tests/gfx/test_drawobj2.cpp` | 新規作成 |
| `src/tests/CMakeLists.txt` | `test_drawobj2.cpp` を `test_gfx` に追加 |

---

# 実装結果（2026-03-23）

## 実装済み内容

上記プランをすべて実装完了。

### 実装上の注意点

- `type_consts` は `qlib/type_consts.hpp` ではなく `qlib/LTypes.hpp` に定義されている（`qlib::type_consts::QTC_FLOAT32` 等）。
- `gfx::getRCode()` / `getGCode()` / `getBCode()` / `getACode()` は `gfx/AbstractColor.hpp` で定義済みのため、`DrawObj2.cpp` ではこれをインクルードして使用。
- `LineDrawObj2::draw()` でのスクリーンサイズ取得は、`qsys::View` への直接依存を避けるため `DisplayContext::getViewport()` を使用（`Vector4D(x,y,w,h)` の z,w 成分）。
- `TrigDrawObj2` / `TrigMeshDrawObj2` のエッジ描画で `glFrontFace(GL_CW)` に相当する操作は `pDC->setFrontFace(false)` / `pDC->setCullFace()` を使用し、OpenGL 非依存化を達成。

## テスト結果

```
100% tests passed, 0 tests failed out of 956

Label Time Summary:
test_gfx  = 52 tests (DrawObj2 関連 25 tests を含む)
```

`test_gfx` の DrawObj2 テスト一覧:
- `SphereDrawObj2Test`: 7テスト
- `CylinderDrawObj2Test`: 4テスト
- `TrigDrawObj2Test`: 5テスト
- `TrigMeshDrawObj2Test`: 3テスト
- `LineDrawObj2Test`: 6テスト

