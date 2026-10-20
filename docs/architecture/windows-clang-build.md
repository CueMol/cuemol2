# Windows ビルドの clang-cl 化

Windows の C++ ビルド (libcuemol2・umbreon・MeshMS・tritium/core addon・cuetty) は
**clang-cl + lld-link** を使う。ローカル (Git Bash) と CI (`build2.yml` の
`build_win_x64`) で同じスクリプトを通る。目的は実行性能とビルド時間。

deplibs (別リポジトリ `CueMol/build_scripts` のビルド済みバンドル) も、v0.2.0 から
TBB / Embree / OIDN / FFTW / xz を clang-cl でビルドしている (Embree は
`EMBREE_MAX_ISA=AVX2`。SSE2..AVX2 のカーネルを実行時に選ぶので CPU の下限は SSE2 の
まま)。詳細は build_scripts の `build_deplibs_windows/README.md`。

MSVC のまま残しているもの:

- **deplibs の Boost / lcms2 / GLEW**: Boost は b2 の vc143 名 (`boost_*-vc143-mt-x64-1_84`)
  を変えると利用側 (uxp_gui を含む) への影響が大きく、性能への寄与もほぼ無い。lcms2 は
  vcxproj、GLEW は配布元のビルド済みバイナリー。
- **uxp_gui**: Mozilla のビルド (`mozconfig_Windows`) は `cl.exe` で molwidget を
  コンパイルし、clang-cl でビルドした `cuemol2.dll` をリンクする。

## なぜ clang-cl (MSVC ターゲット) なのか

clang-cl は target `x86_64-pc-windows-msvc` で、MSVC と C++ ABI (クラスレイアウト・
vtable・名前マングリング・例外) が同じで、STL と CRT も vcvars 環境の MSVC のものを
使う。このため:

- MSVC でビルドされた C++ ライブラリ (deplibs の Boost など) をそのままリンクでき、
  逆に clang-cl でビルドした deplibs を cl の利用側からリンクすることもできる。
- `cuemol2.dll` を clang-cl、利用側 (uxp_gui の molwidget) を cl でビルドしても、
  dllimport したクラス・シングルトン・STL 型を DLL 境界越しに渡せる。

GNU 形式の clang / MinGW ターゲットはこれが成り立たないので使わない (C++ deplibs と
リンクできず、`if(MSVC)` の経路や `WIN32` マクロも外れる)。

成り立たせる条件:

1. clang-cl と cl が**同じ vcvars 環境** (同じ MSVC STL/CRT) を使う。CI は同一ジョブ、
   ローカルは同じ VS 2022 なので自動的に満たす。
2. CRT は `/MD` (`CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL`) にそろえる。
3. libcuemol2 の公開ヘッダーは cl でもコンパイルできる状態を保つ (uxp_gui が cl で
   include する)。clang-cl 専用の分岐は `_MSC_VER && __clang__` で書き、cl 側の
   経路は変えない。
4. uxp_gui に静的 `.lib` を渡さない (LTO を入れる場合に効く。現状は DLL のみ)。

## 切り替え口 `CUEMOL_WIN_CC`

| 値 | コンパイラ |
|---|---|
| `clang-cl` (既定) | clang-cl + lld-link、`Boost_COMPILER=vc143` |
| `cl` | MSVC cl (clang 化前のツールチェーン)。切り戻し用 |

`build_scripts/win_cc.sh` (bash) と `build_scripts/win_cc.bat` (cmd) が同じ内容を持ち、
次の 2 変数を作る (2 ファイルは同期させる):

- `WIN_CC_COMPILER_OPT`: コンパイラの選択だけ (cmake-js 用。cmake-js は CRT を自分で決める)
- `WIN_CC_OPT`: 上に `/MD` を足したもの (通常の CMake ビルド用)

`Boost_COMPILER=vc143` が要るのは、Boost の CMake config がコンパイラを `clangw22` と
判定して vc143 タグのライブラリを不採用にするため。

使う側:

| スクリプト | 用途 |
|---|---|
| `build_libcuemol2_posix/run.sh` | ローカル (Taskfile) の libcuemol2。Windows でも `BUILD_TESTS=ON` |
| `build_libcuemol2_win.bat` | CI の libcuemol2 |
| `build_umbreon_posix/run.sh`, `build_meshms_posix/run.sh` | umbreon / MeshMS |
| `build_cuetty_posix/run_win.bat` | cuetty |
| `build_tritium_core_posix/run.sh`, `run_win.bat` | tritium/core addon (下記) |

`win_cc.sh` は、vcvars 環境が LLVM を PATH に入れないため、`clang-cl` が見つからなければ
`C:\Program Files\LLVM\bin` を PATH の先頭に足す。

**vcvars (x64) は clang-cl でも必須**。MSVC の STL・CRT・Windows SDK を使うことに加え、
ラッパー生成 (`src/mcwgen.cmake` → `src/perl/mcwrapgen3.pl`) と GLSL の前処理
(`src/glsl.cmake`) が `cl /E`・`cl /EP` をプリプロセッサとして直接呼ぶ。clang-cl でも
`MSVC` は真なので、この経路はそのまま動く。

## tritium/core addon (cmake-js)

cmake-js は Windows で既定の Visual Studio ジェネレーター + cl を選ぶ。clang-cl のときは
`--generator Ninja` と `WIN_CC_COMPILER_OPT` (`-D` を `--CD` に置換) を渡す。VS の
ClangCL ツールセットはローカルの VS に入っていないため使わない。Ninja にしたことで
次の 3 点を `tritium/core/CMakeLists.txt` とスクリプトで補っている:

- **出力先**: cmake-js は `CMAKE_RUNTIME_OUTPUT_DIRECTORY=build/` を渡し、構成名の
  サブディレクトリを足すのは VS ジェネレーターだけ。WIN32 では target の
  `RUNTIME_OUTPUT_DIRECTORY` を `build/$<CONFIG>` に固定し、Ninja でも `.node` が
  `build/Release` に出るようにした (`bindings` とパッケージングがこのパスを前提にする)。
- **`delayimp`**: cmake-js は `/DELAYLOAD:NODE.EXE` を付ける。VS ジェネレーターは
  遅延読み込みのヘルパーを暗黙にリンクするが、Ninja + lld-link はしないので、
  `if (MSVC)` で `delayimp` をリンクに足す。
- **古いキャッシュ**: `pnpm install` は core の install hook (素の `cmake-js build`) を
  走らせ、VS ジェネレーターの `build/CMakeCache.txt` を残す。cmake-js はキャッシュが
  あると configure を飛ばすので、`run.sh` はキャッシュのジェネレーターが Ninja で
  なければ `build/` を消してから呼ぶ。

cmake-js が注入する CRT (`/MT`) はそのまま (clang 化前と同じ)。

## CI

`build_win_x64` ("Windows intel clang-cl"):

- `ilammy/msvc-dev-cmd` (vcvars x64) の後に `choco install llvm --version=22.1.8` で
  LLVM を固定して入れ、`C:\Program Files\LLVM\bin` を `GITHUB_PATH` に足す。runner
  イメージ同梱の LLVM はイメージ更新で版が変わるため使わない。
- ジョブ env に `CUEMOL_WIN_CC: clang-cl`。sccache は clang-cl に対応しているので
  `CMAKE_*_COMPILER_LAUNCHER` はそのまま。
- uxp_gui のステップ (`make_mozconfig.sh` の `CC=... cl.exe`) は変更していない。

## clang-cl 化で直したソース

どれも cl の経路を変えない形で入れてある。

- **`src/qlib/SingletonBase.hpp`**: `class QLIB_API Foo : public SingletonBase<Foo>` の
  ように dllexport したクラスの基底テンプレートを、clang-cl はクラス定義の時点で
  メンバーごと実体化する。このため `.cpp` の `SINGLETON_BASE_IMPL` (明示的特殊化) が
  「実体化の後の特殊化」でエラーになる (cl は黙認する)。clang-cl のときだけ `s_pInst` を
  C++17 の inline static メンバーにし、IMPL/DECL を空にした。MSVC ABI のマングル名は
  変わらないので、cl でビルドした利用側の import (`__imp_?s_pInst@...`) はそのまま解決する。
- **BALL (`src/modules/surface/BALL/`)**: `vector3.h`・`circle3.h`・`surface.h`・
  `CONCEPT/processor.h` にある MSVC DLL 向けの明示的インスタンス化
  (`template class BALL_EXPORT ...`) は、`std` 外での `std::vector` の明示的
  インスタンス化などが clang で不正になる。`BALL_EXPORT` は空なので意味を持たず、
  clang-cl では外した。
- **`src/sysdep/WglView.cpp` `tryMSAAPixelFormat()`**: 候補配列 `{16, 8, 4, 2, 0}` を
  `sampleCounts[i] >= 0` で回しており、全候補で失敗すると配列の範囲外を読む未定義動作
  だった (起動時のステレオ用ピクセルフォーマット探索で、クアッドバッファーの無い GPU
  では必ず全候補が失敗する)。cl ではたまたま範囲外の負値で抜けていたが、clang は
  条件を常に真とみなして無限ループにし、uxp_gui のウィンドウが表示されなくなった。
  範囲 for に直した (cl でも潜在バグだった)。tritium はこのコードを通らない。

## 検証済みの組み合わせ

clang 化の時点で次を確認した (2026-10):

- libcuemol2 (clang-cl): ctest 1700 件 pass (直列実行。`ctest -j` は一時ファイル名が
  テスト間で衝突して落ちるので使わない)
- addon (clang-cl) + `cuemol2.dll` (clang-cl): tritium/core の Jest 764 件 pass、
  tritium アプリの起動と描画
- addon (**cl**) + `cuemol2.dll` (clang-cl): Jest 764 件 pass (uxp_gui と同じ組み合わせ)
- `cuemol2.dll` のエクスポート表を MSVC ビルドと比較: MSVC にだけあるのは
  `std::pair<int,char>` のコピー/ムーブコンストラクター 2 個 (`ResidIndex` の基底を MSVC が
  暗黙に書き出すもの)。自明なコピーなので利用側からの import は起きない
- uxp_gui (cl) + `cuemol2.dll` (clang-cl): ローカルで `mach build/package/installer` が通り、
  起動・分子表示・表面・レンダリングを目視確認

## 性能 (2026-10 計測)

cuetty の画面なしレンダリング (`--render`、umbreon) で、次の 3 構成を比べた。
i9-14900KF (BIOS 1840 / microcode 0x133、Intel Default Settings)、32 スレッド。

| 構成 | deplibs | umbreon / MeshMS / libcuemol2 |
|---|---|---|
| ① | MSVC (v0.1.0 相当) | cl |
| ② | MSVC (v0.1.0 相当) | clang-cl |
| ③ | clang-cl、Embree AVX2 (v0.2.0 相当) | clang-cl |

umbreon のテストシーン (`umbreon/data/1ab0_scene3..6.qsc`、約 1000 原子、各 3 回の
中央値、起動と読み込みを含む全体時間):

| シーン | ① | ② | ③ |
|---|---|---|---|
| scene3 (密度メッシュ) | 5.61 s | 5.25 s (−6.5%) | 5.21 s (−7.1%) |
| scene4 (マテリアル) | 3.97 s | 3.68 s (−7.4%) | 3.65 s (−8.2%) |
| scene5 (半透明) | 4.18 s | 3.93 s (−6.0%) | 3.81 s (−8.8%) |
| scene6 (密度等値面) | 4.81 s | 4.41 s (−8.4%) | 4.42 s (−8.2%) |

MeshMS の表面 (4v6x、237,685 原子、`dsurface` + umbreon、各 5 回の最小値):
全体 49.8 s → 48.5 s (②) / 48.8 s (③)。うち MeshMS の表面生成は 3 構成とも約 38 秒で、
差は無い。大きな分子では表面生成の大半が並列化されていない段階で、ほぼ 1 コアで動く
(コンパイラに依らないアルゴリズム上の性質)。その 1 スレッドが E コアに載ると 48〜61 秒に
伸びるので、比較は最小値で行った。表面生成以外 (umbreon など) は約 11.0 s → 10.3 s。

出力: ② は ① と画像がビット一致した (umbreon の 4 シーン)。③ は Embree の AVX2 カーネル
による浮動小数点差で、差が 8 を超える画素が 0.01% 未満。MeshMS は `MESHMS_FP=fast`
(FMA の縮約) のため cl と clang-cl でメッシュがわずかに異なる (4,897,298 vs 4,897,827
頂点、各コンパイラ内では決定的)。

まとめると、効果の大半は cuemol2 側 (libcuemol2 / umbreon / MeshMS) の clang 化による
約 6〜8% で、deplibs の clang 化と Embree AVX2 の上乗せは 0〜3% だった。

## 既知の注意点

- clang-cl と cl の並列ビルドで、まれにコンパイラが落ちることがあった (clang のアクセス
  違反、cl の C1001)。単独でやり直すと通る。開発機では CPU (i9-14900KF) の訂正済み
  ハードウェアエラー (WHEA ID 19) が多発しており、BIOS 更新 (マイクロコード 0x133) 後は
  再発していない。コンパイラ由来ではないと判断している。
- cmake-js は `tritium/core/build/CMakeCache.txt` があると configure を飛ばすので、
  `LIBCUEMOL2_ROOT` (出力先) を切り替えたときは `tritium/core/build` を消してから
  ビルドする。消さないと前の出力先の `cuemol2.dll` がコピーされたままになる。
- 今後の候補: `cuemol2.dll` の ThinLTO (`-flto=thin` + lld-link)。umbreon / MeshMS の
  静的ライブラリを LTO にするのは、それらを clang-cl の libcuemol2 だけが消費することを
  確かめてから (uxp_gui の cl には渡らないこと)。
