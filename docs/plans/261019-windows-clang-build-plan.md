# Windows clang-cl 化: 残り (CI 確認と性能計測)

Windows の clang-cl 化そのもの (スクリプト・CI 定義・ソース修正) は実装済みで、仕様は
[`../architecture/windows-clang-build.md`](../architecture/windows-clang-build.md)。
ここには未実施の項目だけを置く。

## 1. CI (full モード) での確認

`build2.yml` の `build_win_x64` を clang-cl に切り替えた。ローカルでは uxp_gui を含めて
確認済みだが、CI ではまだ通していない。`workflow_dispatch` で full モードを流し、次を確認する:

- LLVM 22.1.8 の choco インストールと `clang-cl --version`
- libcuemol2 / umbreon / MeshMS のビルドと ctest
- tritium/core addon (Ninja + clang-cl) のビルドと Jest
- cuetty のビルドと実行チェック
- tritium NSIS インストーラー
- uxp_gui (cl) のビルドとインストーラー。生成物を Windows 機で起動して確認
  (`WglView` の件のように、ビルドは通るが起動しない問題があり得るため)
- sccache が clang-cl でヒットしているか (2 回目の実行で `sccache -s`)

## 2. 性能の計測とチューニング (Phase 3)

clang 化の目的 (実行性能・ビルド時間) の効果を `CUEMOL_WIN_CC=cl` のビルドと比べる。

- ビルド時間: CI の libcuemol2 ステップ (sccache cold / warm)。ローカルのクリーンビルドは
  clang-cl で約 95 秒 (sccache なし、32 スレッド)
- 実行時間: umbreon レンダリング、MeshMS の表面生成、代表的な描画処理 (ベンチの手段は
  着手時に決める)
- 効果を見て任意で: `cuemol2.dll` の ThinLTO (`-flto=thin` + lld-link)。umbreon/MeshMS の
  LTO は、それらを libcuemol2 (clang-cl) だけが消費することを確認してから
