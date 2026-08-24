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

## 最適化ポリシー (deploy ビルド)

`build_meshms_posix/run.sh` は MeshMS を **deploy 向け設定**でビルドする。
どちらも環境変数で上書き可能
(`MESHMS_FP=strict MESHMS_ARCH= task install_meshms` で bit-exact / baseline ISA)。

**`MESHMS_FP=fast`** — MeshMS が cuemol2/cuemol3 の deploy 用として文書化している
FP ポリシー。FMA 契約、math errno / trapping math / signed zeros の無効化、
reciprocal division、そして `pysq() == x*x` (GCC と MSVC で libm の `pow` 呼び出し
56 箇所が消える。AppleClang は既に畳んでいるので macOS では効果が小さい)。
bit-exact な golden gate を諦める代わりに、MeshMS 側の equivalence gate
(`tests/test_fp_gate.cpp`) で検証される。

`-ffast-math` / `-Ofast` は MeshMS がどちらのポリシーでも**拒否**する
(configure 時に FATAL_ERROR)。理由は cuemol2 にとって本質的で、記録しておく価値がある:
`-ffinite-math-only` は `isfinite()` を定数に畳んでしまい deploy gate の NaN 検出を
無効化する。`-ffast-math` / `-Ofast` / `-funsafe-math-optimizations` は GCC の
crtfastmath.o link spec に一致し、**cuemol2 プロセス全体に FTZ/DAZ を設定**して
しまう — ライブラリとしてリンクされる立場では受け入れられない。

**`MESHMS_ARCH=avx2`** — x86-64-v3 (AVX2 + FMA + BMI)。上記の contraction は
「命令が実在すること」が前提で、x86-64 の既定ベースラインには FMA が無いため、
これを指定しないと x86-64 では FMA が 1 つも出ない。非 x86 ターゲット
(Apple Silicon) では MeshMS 側が自動的に無視するので、1 つのスクリプトから
無条件に渡して安全 (`-- MeshMS: MESHMS_ARCH=avx2 ignored on arm64`)。
`avx2` 以外の値は verbatim で `-march=` に渡るので、ローカル専用なら
`MESHMS_ARCH=native` も使える (再配布物には絶対に使わないこと)。

> **注意**: これにより x86-64 リリース成果物の最低 CPU 要件が Haswell / Zen
> (2013 年以降) に上がる。それ以前の CPU では表面生成時に SIGILL でクラッシュする。
> cuemol2 本体は `-march` を一切指定していないので、この下限を持ち込むのは
> MeshMS のオブジェクトコードだけである。macOS 15 が動く Intel Mac は全て AVX2 を
> 持つため、実質的に影響するのは Windows / Linux の古いマシン。

**`MESHMS_LTO` は使わない** (MeshMS 既定の OFF のまま)。LTO でビルドした static lib は
bitcode を持ち、消費側のツールチェーン一致が要求される (MeshMS のドキュメント記載) 一方、
cuemol2 は LTO 無しでリンクする。効果も未計測なので、3 プラットフォームの CI を
不安定にする価値は無いと判断した。必要になれば個別に検証して追加する。

**`MESHMS_NATIVE` も使わない**: `-march=native` はビルドマシンの ISA を焼き込み、
他所で SIGILL する。CI は再配布物を作るので論外。

> **バージョン依存**: これらのオプションは MeshMS の FP ポリシー導入
> (CueMol/MeshMS#8) 以降にのみ存在する。それ以前の MeshMS に渡しても CMake は
> **警告を出すだけで configure は成功する** (未使用キャッシュ変数)。つまり
> 「ビルドは通るのに最適化が黙って効かない」状態になり得るので、`MESHMS_GIT_REF`
> がこのオプションを持つ ref を指していることを前提とする。

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

### density → mesh_size の校正

**BALL には density の単一の定義が無い**。同じ値を 2 通りに使い分けている:

1. **弧の分割** (`triangulatedSES.cpp`): `round(arc_length * sqrt(density))`
   → 実効的な辺長は `1/sqrt(density)`
2. **凸球面パッチ** (`SESTriangulator::numberOfRefinements`):
   `4^n ~ (4*density*PI*r^2 - 12)/30` で icosphere の細分レベルを選ぶ
   → 頂点数はおよそ `density * area / 3` で、1 よりかなり粗い

MeshMS は 1 つの辺長を全パッチ種別に均一に適用するので、素朴に
`1/sqrt(density)` とすると BALL の弧分割には一致するが、球面パッチの分だけ
全体として細かくなる。実測 (1crn / 1YJO / barstar × density 1, 2, 4) で
**平均 1.39 倍 (density=1 では 1.54 倍)** の頂点数だった。

そこで `SES_MESH_SIZE_COEFF = 1.18` (= sqrt(1.39)) を掛けて MeshMS 側だけを
校正した。**BALL の経路は従来の挙動のまま**にしてある (既存シーンの
`orig_den` と GUI スライダーの意味を変えないため、合わせに行くのは新実装側)。

校正後の同条件での頂点数比 (MeshMS / BALL):

| 分子 | density=1 | density=2 | density=4 |
|---|---|---|---|
| 1crn | 1.14 | 0.93 | 1.05 |
| 1YJO | 1.19 | 1.03 | 0.91 |
| barstar | 1.22 | 1.01 | 1.07 |

平均 1.06 (範囲 0.91–1.22)。**完全一致はしない**: 両者とも density に対して
頂点数が線形に増えない (BALL は `round()` の量子化と icosphere の 4 倍刻み、
MeshMS は advancing front の離散化) ため、どんな単一係数でも ±20% 程度の
ばらつきは残る。これはこの変換の原理的な限界で、係数の調整不足ではない。

### バックエンドの切り替えと所要時間ログ

**同じ構造に対して新旧を A/B できる**ように、バックエンドは GUI から選べる。
移行期のための機能で、BALL を削除する際に一緒に落とす。

**選択の経路**: `MolSurfObj` の `sesbackend` enum プロパティ
(`auto` / `meshms` / `ball`、既定 `auto`) を、生成の直前に worker service が設定する。
qif の enum property なので C++ 側では文字列 ID で受け渡しされる。

```
MakeMolSurfDialog / RegenMolSurfDialog  (SegmentField "Algorithm")
  -> makeMolSurf / regenMolSurf service  (args.backend)
    -> surf.sesbackend = 'ball'          (auto のときは設定しない)
      -> createSESFromMol / regenerateSES1
```

`createSESFromMol` / `regenerateSES1` のシグネチャは変えずに済んでいる点が重要
(プロパティを先に設定する方式にしたため、qif メソッドの引数追加が不要)。

`SESBK_AUTO` の解決先はプロセスごとに一度だけ決まる。通常は
「`HAVE_MESHMS` があれば MeshMS、無ければ BALL」だが、環境変数
`CUEMOL_SES_BACKEND` (`ball` / `meshms`) がそれを上書きする —
GUI を持たない headless 実行や CI で BALL 経路を回すため
(`qlib::parallel.hpp` の `CUEMOL_TBB_THREADS` と同じ流儀)。優先順位は
**プロパティ (GUI) > 環境変数 > ビルド既定**。

`createSESFromArray` は生成全体を `std::chrono::steady_clock` で計測し、
どちらの経路を通ったかと一緒に 1 行で出力する (同モジュールの
`DirectSurfRenderer2` の計測ログと同じ形式):

```
MolSurfBuilder> SES built by MeshMS in 2.6 ms: atoms=2, verts=430, faces=856 (density=4.00, probe=1.40)
MolSurfBuilder> SES built by BALL in 3.1 ms: atoms=2, verts=316, faces=628 (density=4.00, probe=1.40)
```

フォールバックが発動した場合は `BALL (MeshMS fallback)` と表示されるので、
「MeshMS のつもりが実は BALL だった」を取り違えない。頂点数も出るため、
同じ density 指定に対する両バックエンドの解像度の違いも同時に読める。

CI (Linux) は MeshMS 既定での全 ctest に加えて、`CUEMOL_SES_BACKEND=ball` で
`-L test_surface` を再実行する。フォールバック先として残す BALL 経路が
腐らないようにするため。
- **density → mesh_size 変換**: `mesh_size = 1.18 / sqrt(density)`。
  **BALL 側は一切変更せず、MeshMS 側だけをこの係数で合わせている**。詳細は下記。
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
