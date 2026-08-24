# MeshMS SES Surface Backend (日本語)

libcuemol2 の SES (solvent-excluded surface) 生成バックエンドとして、外部
static library **MeshMS** (`CueMol/MeshMS`, MolSurfComp アルゴリズムの忠実実装)
を統合した設計記録。従来の vendored BALL fork
(`src/modules/surface/BALL/`) は併存し、フォールバックとして温存する。
migration ではない (UXP に対応 surface のない内部アーキテクチャ変更)。

## ビルド配線 (umbreon 1:1 パターン)

umbreon と同じ「sibling checkout を別ビルド → deplibs prefix に install →
`find_package(CONFIG)` で消費」パターン。deplibs バンドル (CueMol/build_scripts
の release) 自体は無変更 — MeshMS はソースからビルドされ、必要な外部依存
oneTBB は既にバンドルに含まれる。

| umbreon 側 | MeshMS 側 |
|---|---|
| `option(ENABLE_UMBREON)` (トップ CMakeLists) | `option(ENABLE_MESHMS)` (default OFF) |
| `src/cmake/umbreon.cmake` | `src/cmake/meshms.cmake` (`find_package(MeshMS CONFIG REQUIRED)`) |
| `SET(HAVE_UMBREON "1")` → `config_cmake.h.in` | `SET(HAVE_MESHMS "1")` → `#cmakedefine HAVE_MESHMS` |
| `render` に `umbreon::umbreon` リンク | `surface` に `MeshMS::MeshMS` リンク |
| `build_umbreon_posix/{run.sh,action.yml}` | `build_meshms_posix/{run.sh,action.yml}` |
| `task install_umbreon` (`../../umbreon`) | `task install_meshms` (`../../MeshMS`) |
| `UMBREON_GIT_REF` (deplibs.env) | `MESHMS_GIT_REF` |
| `-Dumbreon_DIR=...` 無条件渡し | `-DMeshMS_DIR=$BASEDIR/meshms/lib/cmake/MeshMS` 無条件渡し |

要点:

- MeshMS build には `-DCMAKE_POSITION_INDEPENDENT_CODE=ON` が必須 (static lib
  を SHARED な libcuemol2 にリンクするため。MeshMS 自身は PIC を設定しない)。
- `MESHMS_BUILD_TESTS/CLI/TOOLS=OFF` でライブラリターゲットのみ configure。
- oneTBB は単一実体: `MeshMSConfig.cmake` の `find_dependency(TBB)` が、
  libcuemol2 configure に渡る同じ `-DTBB_DIR` (deplibs の static oneTBB) で
  解決される。別の TBB を持ち込まないこと。
- 消費側が include するのは `<meshms/capi.hpp>` のみ (C++17-clean facade。
  MeshMS 本体は C++20 ビルドだが `cxx_std_20` は PRIVATE)。
- `ENABLE_MESHMS=ON` はキャッシュ変数: ON/OFF 切替は `task rebuild_libcuemol2`
  (再 configure) が必要。default OFF なのは umbreon と同じ理由 —
  `find_package(... REQUIRED)` なので、`task install_meshms` 未実行の checkout
  で default ON だと configure が壊れる。CI は workflow env で ON を注入する。

## createSESFromArray のバックエンド分岐

`MolSurfObj::createSESFromArray()` (`src/modules/surface/MolSurfBuilder.cpp`)
が唯一の分岐点。qif / GUI / `createSESFromMol` / `regenerateSES` /
`PSEFileReader` は全てこの関数経由なので、シグネチャ・スクリプト API は不変。

```
createSESFromArray(pr_ary, density, probe_r)
  ├─ 共通バリデーション (空配列 / density<=0 → qlib::RuntimeException)
  ├─ HAVE_MESHMS: buildSESWithMeshMS() を try
  │    └─ 失敗 (std::exception) → ログ出力して BALL にフォールバック
  └─ buildSESWithBALL()  (従来コード無改変移動; probe ±0.01 x10 リトライも温存)
```

- **フォールバック設計**: MeshMS は例外でエラーを伝える (入力バリデーション
  なし)。想定外の入力・数値縮退では従来実績のある BALL 経路に落ちる。
  発火は `LOG_DPRINTLN` で必ず可視化する (黙って遅い BALL に落ち続けるのを
  検知するため)。BALL を将来削除する際は、フォールバックを再 throw に置換する。
- **density → mesh_size 変換**: BALL の density は点密度 (点/Å²)、MeshMS の
  mesh_size は目標三角形辺長 (Å)。`mesh_size = 1/sqrt(density)` で変換する
  (GUI の整数スライダー 1–10 → 1.0–0.32 Å。MeshMS CLI 既定 0.5 = density 4 相当)。
- **メッシュ後処理**: `build_mesh(fuse=true)` → `remove_flaps()` (MeshMS CLI の
  標準シーケンス)。`close_cusps` は atom_id / face_type を失い重いので不使用。
- **winding**: MeshMS の faces は MSMS 規約 (外向き CCW)。cuemol2 の
  `MSMSFileReader` が MSMS faces を無変換格納して GL_CULL_FACE 描画してきた
  実績と整合する。gtest の符号付き体積 > 0 が回帰ガード。
- **atom_id → MSVert::info は見送り**: MolSurfObj 経路の全消費者
  (MolSurfRenderer = AtomPosMap 近傍検索着色 / QdfSurfWriter / CutByPlane) は
  info を読まない。また MeshMS の atom_id は「入力配列 index+1」であり CueMol の
  aid ではないため、aid 規約 (DirectSurfRenderer 系) と混同する誤用リスクの方が
  大きい。将来 MolSurfRenderer の近傍検索着色を atom_id 直参照へ置換する際に、
  `createSESFromArray` へ aid 配列を渡す拡張とセットで行うこと。

## RSCache による再生成高速化

MeshMS は density 非依存の計算 (SAS arrangement = RS 成分) と density 依存の
メッシュ化を分離した API を持つ:
`compute_rs_from_array()` → `shared_ptr<RSCache>` → `build_mesh_from_cache()`。

`MolSurfObj` はこの cache を非永続メンバで保持する
(`m_pMeshMSCache` + 検証用の `m_meshMSCachedAry` / `m_dMeshMSCachedProbeR`):

- ヘッダは `namespace meshms { struct RSCache; }` の**前方宣言のみ**
  (`shared_ptr` は不完全型メンバ可)。ENABLE_MESHMS=OFF ビルドでも null メンバ
  として無害で、MolSurfObj.hpp は MeshMS ヘッダに依存しない。
- **再利用条件**: probe_r が一致し、かつ入力球配列が **bit-exact** に一致
  (自前比較。`Vector4D::operator==` は F_EPS8 許容誤差付きなので使わない)。
  座標・選択・vdW 半径のどんな変更も配列比較で検出され、stale cache を防ぐ。
- ヒットするのは「density だけ変えた regenerateSES」(RegenMolSurfDialog の
  典型操作)。メッシュ化のみ再実行され大幅に速い。
- cache はシリアライズしない。qdf 読み込み後の初回再生成はフル計算。

## MeshMS 側の多成分対応 (前提条件)

統合に先立ち MeshMS 側 (facade = capi.cpp) に実装した
(CueMol/MeshMS の feature/multi-component):

- 入力を SAS 交差グラフ (interstructure と同一述語) の連結成分に分割し、
  忠実パイプラインを成分ごとに実行してメッシュを結合する。
- 孤立原子 (SAS 近傍なし) は SES = vdW 球なので icosphere (mesh_size 以下の
  辺長まで細分) として直接メッシュ化する。faithful な exterior 抽出は孤立球を
  表現できない ("isolated SAS-ball" throw / 到達不能成分の silent drop) ため。
- 単一成分入力は既存経路をビット単位で素通し → golden gate 不変。

これにより「タンパク質 + 結晶水/イオン」「非結合の複数チェーン」でも BALL と
同等に全成分が出力され、cuemol2 側フォールバックの発火は例外的になる。

## HoleSurfBuilder の経緯

`HoleSurfBuilder::doit()` にあった `// pore[i].w() = rad_ary[isl];` は削除済みの
ローカル変数を指す stale コメントで、実際には `findPath()` が
`Vector4D(x, y, z, res_rad)` と **w に pore 半径を格納済み**。全成分コピーで
半径は `createSESFromArray` に渡っている (半径 0 球の問題は元々存在しない)。

## 既知の非互換 (リリースノート記載事項)

- 同じ density / probe でも頂点配置・頂点数は BALL と異なる (品質は向上想定。
  法線は fuse 後の面積重み再計算で、BALL の解析法線と微差がある)。
- `.qdf` シリアライズ形式 (座標 + 法線 + face) は不変なので既存シーンの
  読み込みは無影響。`regenerateSES` を実行した時点で形状が MeshMS 版に変わる。

## テスト

- MeshMS 側: `tests/test_components.cpp` (孤立原子 = vdW 球、成分ごとの
  bit-for-bit 一致、cache = one-shot、空入力) + 既存 golden 19 本。
- cuemol2 側: `src/tests/modules/surface/test_ses_from_array.cpp` —
  **バックエンド非依存の仕様テスト** (シェル包含 / face 妥当性 / 外向き
  winding / 単一原子 = vdW 球 / 空入力 reject / density 方向 / w = 半径 /
  再生成の決定性 = MeshMS ビルドでは cache 経路の検証)。ENABLE_MESHMS の
  ON / OFF 両ビルドで同一テストが green であることが、両バックエンドが同じ
  観測契約を満たすことの継続的な証明になる。
