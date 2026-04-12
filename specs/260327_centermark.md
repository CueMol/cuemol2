# 目的
- CenterMarkDrawObjの実装をqsysに移す
- DistPickDrawObj, RectSelDrawObjの実装をGpuPrim subclassesを使ったものにupdateする。

# 実装
CenterMarkDrawObjの実装は、sysdepとは関係ない（バックエンド依存性がない）ので
qsysかgfxに移せるはずだが、qsys::Cameraには依存しているので、qsysに移すのが妥当

一方で、gfx::DrawObjSet (src/gfx/DrawObjSet.{hpp,cpp})に依存しているが、
DrawObjSetは機能的にgfx::GpuPrimと似通っているため、廃止して、
gfx::GpuPrimを用いた実装に書き換える。

gfx::DrawObjSet は、DistPickDrawObj, RectSelDrawObjでも使用されている。
GpuPrim subclassesを使ったものにupdateすることで、DrawObjSetを削除できるようにする。
削除前に他でも使用されていなかは調べた方が良い。

gfx::DrawObj subclassesの描画、特に2Dのbillboard描画は、ピクセル単位での表示を制御しているので、
それが、PrimGpu系に移行しても正しく動作するかを考慮に入れる。
必要なら、LinePrimGpuの実装を追加拡充する。

DisplayContextのAPIはなるべく追加しないようにしたいが、必要なら追加拡充する。

# 実装計画

## 調査結果

- `gfx::DrawObjSet` のユーザは3クラスのみ（CenterMarkDrawObj, DistPickDrawObj, RectSelDrawObj）
- `TrigGpuPrim` は `setNoDepth` を持たない → 追加が必要
- `GUIView::drawScene()` はすでに `showDrawObj()` / `showDrawObj2D()` を呼んでいる
- `GUIView` コンストラクタは空のため、DrawObj 追加に適した場所
- センターマーク関連コードを `OcView` から `qsys::GUIView` に巻き上げ可能
  - `LineGpuPrim` は lazy init のため、OpenGL コンテキストなしで構築できる
- `GUIView` サブクラスは `OcView` と `TestGUIView`（テスト用）のみ

## フェーズ1: 実装

### Step 1: `gfx::DisplayContext` に `setInvertColorBlend(bool)` を追加

CenterMarkDrawObj の invert color 効果のために最小限追加。
- `src/gfx/DisplayContext.hpp` (setCullFace の後): `virtual void setInvertColorBlend(bool bInv) {}` (no-op デフォルト)
- `src/sysdep/ogl_core/OcDisplayContext.hpp/cpp`: OpenGL 実装
  - `glBlendFunc(GL_ONE_MINUS_DST_COLOR, GL_ZERO)` / 復元 `glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)`

### Step 2: `TrigGpuPrim` に `setNoDepth(bool)` を追加

RectSelDrawObj の塗りつぶし矩形に必要。
- `src/gfx/GpuPrim.hpp`: `m_bNoDepth` メンバ + `setNoDepth/isNoDepth`
- `src/gfx/GpuPrim.cpp`: `TrigGpuPrim::draw()` 内に `u_nodepth` uniform 設定
- シェーダー側に `u_nodepth` がなければ追加（LineGpuPrim と同様のパターン）

### Steps 3-4: `qsys::CenterMarkDrawObj` 新規作成

- `src/qsys/CenterMarkDrawObj.{hpp,cpp}` を新規作成
- namespace: `qsys`、基底: `qsys::DrawObj`
- `gfx::DrawObjSet *m_pdata` → `gfx::LineGpuPrim m_linePrim`（値メンバ、lazy init）
- `display()`: CCM_AXIS 時、カスタム正投影 + `setInvertColorBlend` でラップ
- `display2D()`: CCM_CROSS 時、スクリーン中央にオフセット + 同様にラップ
- 形状は旧実装と同じ（CCM_AXIS: 3本20単位、CCM_CROSS: 2本10単位、白色・noDepth）

### Step 5: `qsys::GUIView` にセンターマーク管理を巻き上げ

- `src/qsys/GUIView.cpp`: コンストラクタで `CenterMarkDrawObj` を生成・`addDrawObj` 登録
- `src/qsys/GUIView.hpp/cpp`: `setCenterMark()` オーバーライドを追加（DrawObj を更新）

### Step 6: `OcView` からセンターマーク関連コードを削除

- `src/sysdep/ogl_core/OcView.cpp`: include 削除、setup() の作成コード削除、setCenterMark() 削除
- `src/sysdep/ogl_core/OcView.hpp`: setCenterMark() 宣言削除

### Step 7: `DistPickDrawObj` を `LineGpuPrim` に移行

- `src/modules/molvis/DistPickDrawObj.{hpp,cpp}`（移動なし、内部変更のみ）
- `gfx::DrawObjSet *m_pdata` → `gfx::LineGpuPrim m_linePrim`（値メンバ）

### Step 8: `RectSelDrawObj` を `LineGpuPrim + TrigGpuPrim` に移行

- `src/modules/molstr/RectSelDrawObj.{hpp,cpp}`（移動なし、内部変更のみ）
- `gfx::DrawObjSet *m_pdata` → `gfx::LineGpuPrim m_linePrim; gfx::TrigGpuPrim m_trigPrim;`
- Lines: 4本の矩形枠線、TrigMesh: 2個のトライアングル（半透明塗りつぶし、setNoDepth(true)）

### Step 9: CMakeLists 更新（旧ファイルをビルドから外す）

- `src/gfx/CMakeLists.txt`: `DrawObjSet.cpp` をコメントアウト
- `src/sysdep/CMakeLists.txt`: `OcDrawObjSet.cpp`, `CenterMarkDrawObj.cpp` をコメントアウト
- `src/qsys/CMakeLists.txt`: `CenterMarkDrawObj.{cpp,hpp}` を追加

## フェーズ2: 動作確認後に削除

- `src/gfx/DisplayContext.hpp/cpp`: `createDrawObjSet()`, `drawObjSet()` 削除
- `src/sysdep/ogl_core/OcDisplayContext.hpp/cpp`: 同上
- 削除ファイル:
  - `src/gfx/DrawObjSet.{hpp,cpp}`
  - `src/sysdep/ogl_core/OcDrawObjSet.{hpp,cpp}`
  - `src/sysdep/ogl_core/CenterMarkDrawObj.{hpp,cpp}`

---

# 実装結果

## コミット

`a32edfe7` — Migrate DrawObj rendering from DrawObjSet to GpuPrim, move CenterMarkDrawObj to qsys

## 実装上の問題と対処

### 1. `TrigGpuPrim::draw()` が `u_nodepth` をハードコード

`TrigGpuPrim::draw()` 内で `u_nodepth` が `0` にハードコードされていた。
`m_bNoDepth` メンバを追加し、`m_bNoDepth ? 1 : 0` に変更して対応。

### 2. `GUIDisplayContext` の `createDrawObjSet()`/`drawObjSet()` が純粋仮想

`OcDrawObjSet.cpp` をビルドから除外した後、`OcDisplayContext` が pure abstract になり
`CglDisplayContext` が instantiate できなくなった。
`GUIDisplayContext.hpp` で純粋仮想を空実装（non-pure）に変更することで対応。
フェーズ2ではこれらの API ごと削除した。

### 3. 終了時クラッシュ（pure virtual call in `OcBufferRep::~OcBufferRep()`）

**原因**：`CglView::~CglView()` で `delete m_pCtxt`（GL コンテキスト削除）後、
`View::~View()` で `m_drawObjTab.clear()` が実行される。この時
`CenterMarkDrawObj::~CenterMarkDrawObj()` → `LineGpuPrim::~LineGpuPrim()` →
`OcBufferRep::~OcBufferRep()` が呼ばれ、`rvw->getDisplayContext()` を試みるが
vtable が `View` レベルに落ちているため `View::getDisplayContext() = 0` の
pure virtual 呼び出しになる。

**なぜ旧実装はクラッシュしなかったか**：
旧 `sysdep::CenterMarkDrawObj` のデストラクタは `{}` で空だったため、
`m_pdata`（`gfx::DrawObjSet*`）が `delete` されなかった。
つまり `OcBufferRep::~OcBufferRep()` が呼ばれることがなく、
メモリリークによってクラッシュを回避していた。

**対処**：
- `View::clearDrawObjs()` メソッドを追加（`m_drawObjTab.clear()` を公開）
- `CglView::unloading()` / `WglView::unloading()` / `XglView::unloading()` で
  `super_t::unloading()` を呼ぶように修正
  （`GUIView::unloading()` → `View::unloading()` で DrawObj をクリアし、
  GL コンテキスト削除前に GPU リソースを安全に解放する）

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/gfx/DisplayContext.hpp/cpp` | `setInvertColorBlend` 追加; `createDrawObjSet/drawObjSet` 削除 |
| `src/gfx/GpuPrim.hpp/cpp` | `TrigGpuPrim::setNoDepth` 追加 |
| `src/gfx/DrawObjSet.{hpp,cpp}` | **削除** |
| `src/qsys/CenterMarkDrawObj.{hpp,cpp}` | **新規作成**（`qsys` namespace、`LineGpuPrim` 使用） |
| `src/qsys/GUIView.hpp/cpp` | コンストラクタで CenterMarkDrawObj 登録; `setCenterMark()` 追加 |
| `src/qsys/GUIDisplayContext.hpp` | `createDrawObjSet/drawObjSet` 削除 |
| `src/qsys/View.hpp/cpp` | `clearDrawObjs()` 追加 |
| `src/qsys/CMakeLists.txt` | `CenterMarkDrawObj.{cpp,hpp}` 追加 |
| `src/sysdep/ogl_core/OcDisplayContext.hpp/cpp` | `setInvertColorBlend` 追加; `createDrawObjSet/drawObjSet` 削除 |
| `src/sysdep/ogl_core/OcView.hpp/cpp` | センターマーク関連コード削除 |
| `src/sysdep/ogl_core/CenterMarkDrawObj.{hpp,cpp}` | **削除** |
| `src/sysdep/ogl_core/OcDrawObjSet.{hpp,cpp}` | **削除** |
| `src/sysdep/CMakeLists.txt` | 旧ファイルのエントリ削除 |
| `src/sysdep/CglView.cpp` | `unloading()` で `super_t::unloading()` 呼び出し |
| `src/sysdep/WglView.cpp` | 同上 |
| `src/sysdep/XglView.cpp` | 同上 |
| `src/modules/molvis/DistPickDrawObj.{hpp,cpp}` | `DrawObjSet` → `LineGpuPrim` |
| `src/modules/molstr/RectSelDrawObj.{hpp,cpp}` | `DrawObjSet` → `LineGpuPrim + TrigGpuPrim` |
