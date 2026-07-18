# 実装計画: libcuemol2 コンパイラ警告の整理・削減

libcuemol2 の CI ビルドは clang/gcc/MSVC の 3 コンパイラで多数の警告を出しているが、
ローカルの `task build_libcuemol2` は**差分ビルド**のため既コンパイル済み .o が再コンパイル
されず警告が見えない (CI は全 TU をコンパイル + sccache が cache hit 時に stderr を replay
するため全警告が出る)。本計画はこの警告群を **vendored は抑制 / 自前コードは実修正** の
方針で、**1 ブランチ (`chore/compiler-warnings-cleanup`) ・1 PR** の中でカテゴリ順に
コミットを分けて段階的に削減する。

**マイルストーン (同一ブランチ内のコミット順): Phase 1 (vendored 抑制) → Phase 2 (format 文字列修正) → Phase 3 (override 付与) → Phase 4 (GL deprecation + 残り高シグナル)**

---

## 0. 前提・規約

- 本 plan 本文は日本語。**ソースコード・コメント・文字列・コミットメッセージは英語**。コメントに `─` 等の非 ASCII を含めない。
- ビルド/テストは `build_scripts/Taskfile.yml` の task を用いる (`build_libcuemol2` / `rebuild_libcuemol2` / `run_gtest`)。
- 全カテゴリを本ブランチ `chore/compiler-warnings-cleanup` に実装し、**1 PR** で提出する。カテゴリごとに**コミットを分け**、レビュー時に phase 単位で追えるようにする。
- **警告修正はロジックを変えない**のが大前提。output 文字列やメッセージ内容も変えない。
- **検証は CI ログを真実とする**。ローカルは clang15/arm64/Debug のため MSVC/gcc 固有警告は再現しない。

---

## 1. 目的とマイルストーン

3 コンパイラの警告総数 (同一コミット実測):

| Platform | Compiler | 総数 | 最多カテゴリ |
|---|---|---|---|
| macOS x64/arm64 | Apple clang 16 | ~2,700 | `-Winconsistent-missing-override` 2306 |
| Linux Ubuntu 22 | gcc 11 | 290 | `-Wformat=` ~220 |
| Windows | MSVC | 1,541 | C5286 enum変換 790 |

削減の狙い:
1. **本物のバグを潰す**: format 文字列 (3 コンパイラ一致)、ポインタ切り詰め、演算子優先順位、UB 指摘。
2. **ノイズを消す**: vendored (上流ライブラリ)、スタイル的警告 (enum変換・narrowing) を抑制し、実シグナルを見えやすくする。
3. **将来の gate**: (任意) override 用の clang-tidy と C++ lint task を整備。

---

## 2. 背景 — 調査で判明した事実

### 2.1 vendored (第三者コード) の CMake 構造
- **独立 STATIC ターゲット** (`src/CMakeLists.txt:185-188` で add_subdirectory):
  - `qmzlib` (`src/zlib/CMakeLists.txt:13`), `qmexpat` (`src/expat/CMakeLists.txt:27`),
    `qmpcre` (`src/pcre/CMakeLists.txt:15`), `qmpng` (`src/libpng/CMakeLists.txt:12`)
  - 各ターゲットには既に `if(WIN32)/else()` の `target_compile_options(<tgt> ... -fPIC)` ブロックがある (例 `src/zlib/CMakeLists.txt:27-31`) → ここが `-w`/`/w` 追加の自然な箇所。
- **ターゲット非独立** (自前コードと同一ライブラリに混在):
  - **mmdb + ssmlib** → `molanl` ターゲット。ソース列挙 `src/modules/molanl/CMakeLists.txt:17-55` (mmdb 17-49 / ssmlib 51-55), `add_library` は `:83`。
  - **BALL** → `surface` ターゲット。ソース列挙 `src/modules/surface/CMakeLists.txt:34-54`, `add_library` は `:82`。
  - → target 全体に `-w` すると自前 (molanl.cpp, MolSurfObj.cpp 等) まで黙るので、抑制するなら **source 単位**にする。
- **vendored は 2 層に分かれる** (git 履歴で判定):
  - **(A) upstream 追従 (pristine)**: `zlib` / `expat` / `pcre` / `libpng`。ライブラリ更新コミットのみ (例 `libpng` は 1.6.50 へ更新)。再同期があるので **編集せず抑制**。
  - **(B) プロジェクト改変フォーク**: `mmdb` / `ssmlib` (最終 2026-06-05「Fix leaks and latent issues」) / `BALL` (最終 2025-11-08「fix c++17 throw() depr」)。既に実バグ・C++17 対応で編集済み＝クリーンな再同期はしない。→ **本物のバグは直してよい**。ただし大量のスタイル的警告は無理に直さず抑制でよい (実質は巨大な第三者コード本体)。
- **集中警告設定は無い**: `CMAKE_CXX_FLAGS` 未設定、`add_compile_options` 皆無、`-w`/`/w`/`-Wno-*`/`SYSTEM` の前例なし。唯一の前例は Windows 用 `_CRT_SECURE_NO_WARNINGS` (`src/CMakeLists.txt:163`)。
- **compile-definition の雛形**: APPLE ガード付きの `target_compile_definitions(qmpng PUBLIC PNG_ARM_NEON_OPT=0)` (`src/libpng/CMakeLists.txt:32-34`) が GL_SILENCE_DEPRECATION 追加の直接テンプレート。OpenGL 警告が出るのは `sysdep` ターゲット (`src/sysdep/CMakeLists.txt`、既存 def は `:127`)。

### 2.2 format 文字列 (`%d` に 64bit `uid_t`)
- `qlib::uid_t` の実体は **`unsigned long`** (`src/qlib/qlib.hpp:48`)。LP64 (mac/linux) で 64bit、MSVC (LLP64) で 32bit → **サイズ違い(LP64) と符号違い(全環境) の両方**で警告。gcc/clang/MSVC 全部で出るのと整合。
- デバッグログマクロは `src/qlib/LDebug.hpp`。`LString::format`/`LOG_*printfmt` には `__attribute__((format))` が**付いていない**ため -Wformat 対象外。警告は `::printf` フォールバック分岐 (三項の死枝でも型チェックされる) 由来。
- **codebase の慣習 = `(int)` キャスト + `%d`**。唯一の既存修正例 `src/tests/qsys/test_scenemanager.cpp:85` = `LString::format("%d", int(pScene->getUID()))`。`%lu` の前例は 0 件。
- 高 leverage: **`src/qsys/View.hpp:529` の `MB_DPRINTLN("...view %d update %d", m_uid, m_bUpdateRequired)` はヘッダが多 TU に展開され gcc format 警告 135 件 (全体の約 60%) を単独で発生**。1 個目 `%d`(m_uid=unsigned long) のみが原因、2 個目 `%d`(bool) は昇格で int になるので問題なし。
- 他の format 対象 (自前): `qsys/Scene.cpp`, `GUIView.cpp`, `Object.cpp`, `Renderer.cpp`, `Camera.cpp`, `gfx/Hittest*`, `modules/xtal/MTZ2MapReader.cpp` (gcc/MSVC 両方), `pybr/wrapper_ndarray.cpp` (`%p` に Napi::Value) 等。`.size()` (size_t) を `%d` に渡す例もあり。

### 2.3 override / tooling
- `.clang-tidy` は**存在しない** (libcuemol2 対象範囲に無し)。`modernize-use-override` を使うなら新規整備が要る。
- override 付与状況は混在: molstr は virtual 325 に対し override **1** (`src/modules/molstr/MolRenderer.hpp` のみ、同一クラス内でも不統一)、gfx (override 37/virtual 345)・qsys (override 53/virtual 522) も部分的。`-Winconsistent-missing-override` (clang) 2306 の主対象は molstr。
- C++ の lint task は無い (Taskfile の lint は tritium CSS/comment のみ)。テストは gtest、ラベル=バイナリ名 (`test_gfx`/`test_qsys`/`test_molstr`/`test_molvis`/`test_surface`/`test_xtal`/`test_importers`/`test_molanl`)、`task run_gtest TEST=<label>` で絞り込み実行。

---

## 3. 設計方針 (確定事項)

- **vendored (A) upstream 追従は編集しない** → CMake で抑制 (`zlib`/`expat`/`pcre`/`libpng`)。上流再同期を壊さない。
- **vendored (B) フォーク (mmdb/ssmlib/BALL) は原則抑制**するが、フォーク済みなので **本物のバグは直してよい**。スタイル的警告の大量修正はしない。
- **自前コードは実修正**。format は `(int)` キャスト慣習に従い最小差分。
- **カテゴリ順にコミットを分割** (1 ブランチ・1 PR)。リスク低い順・シグナルを見やすくする順で並べる。
- **Phase 1 (vendored 抑制) を最初に**行い、ノイズを消してから自前の format/override を修正すると、残警告の数え上げが正確になる。

---

## 4. 事前確認ステップ

1. develop 最新化を確認 (本計画着手時点で PR #439 反映済み `6857eacb`)。
2. CI ログから各カテゴリの正確な file:line を取得できることを確認:
   - clang/gcc: `gh run view --job <job-id> --log`
   - **MSVC は `gh run view --log` では取れない** → `gh api /repos/CueMol/cuemol2/actions/jobs/<job-id>/logs` で full ログ取得 (実証済み、1541 件取得)。
3. Phase 1 着手前に、mmdb/ssmlib/BALL の source list が CMake でどう列挙されているか (2.1 の行) を再確認。

---

## 5. Phase 別 成果物サマリ (1 ブランチ・1 PR、コミット順)

| Phase | 種別 | 対象 | 主効果 | リスク |
|---|---|---|---|---|
| **Phase 1** | build 設定 (+ 一部実修正) | (A) 抑制: zlib/expat/pcre/libpng ・ (B) 抑制+実バグ修正: mmdb/ssmlib/BALL | 3 コンパイラで vendored 警告消滅、ノイズ大幅減 | 低 (主にフラグ) |
| **Phase 2** | 実コード修正 | 自前の format 文字列 (`uid_t %d` 他) | 3 者一致の本物バグ解消、gcc 220→数十 | 中 (出力不変を要検証) |
| **Phase 3** | 機械的一括 | 自前の override 欠落 (molstr 中心) | clang 2306 消滅 | 中 (誤付与はビルドエラーで検出) |
| **Phase 4** | build 設定 + 実修正 | GL deprecation, MSVC ポインタ切詰め/非virtual dtor/優先順位, gcc UB | 残り高シグナル | 中 |

---

## 6. 各 Phase の実装手順 (すべて同一ブランチ `chore/compiler-warnings-cleanup`、コミットは Phase 単位)

### Phase 1 — vendored 警告抑制 (+ フォークの実バグ修正)
1. **(A) upstream 追従** 4 ターゲット (`qmzlib`/`qmexpat`/`qmpcre`/`qmpng`) の既存 compile-options ブロックに抑制を追加:
   ```cmake
   target_compile_options(<tgt> PRIVATE $<IF:$<C_COMPILER_ID:MSVC>,/w,-w>)
   ```
   編集箇所: `src/zlib/CMakeLists.txt:27-31`, `src/expat/CMakeLists.txt:36-60`, `src/pcre/CMakeLists.txt:32-36`, `src/libpng/CMakeLists.txt:27-30`。
2. **(B) フォーク** mmdb/ssmlib/BALL は **source 単位**で抑制 (自前コードを黙らせない):
   - `src/modules/molanl/CMakeLists.txt` の mmdb+ssmlib source (17-55 行) を変数化し、直後に
     `set_source_files_properties(${MMDB_SSMLIB_SRCS} PROPERTIES COMPILE_OPTIONS "$<IF:$<CXX_COMPILER_ID:MSVC>,/w,-w>")`。
   - `src/modules/surface/CMakeLists.txt` の BALL source (34-54 行) を同様に。
   - ただし CI ログで **本物のバグ**を示す警告 (format-security, 実 UB, ポインタ切詰め等) があれば、抑制する前にその箇所だけソースを直す (フォークなので可)。
3. 検証: `task rebuild_libcuemol2` (ローカル) でビルド成功を確認 → コミット → CI で zlib/mmdb/BALL 等の警告が消えていることを 3 コンパイラログで確認。自前ファイルの警告数が減っていない (＝過剰抑制していない) ことも確認。

### Phase 2 — format 文字列修正
1. **View.hpp:529 を最優先** (135 件): 1 個目を `(int)m_uid` に。2 個目 bool はそのまま。
2. uid 系 `%d` (~33+ 箇所) を `(int)` キャストに統一 (`test_scenemanager.cpp:85` と同形)。対象: `qsys/Object.cpp`, `Scene.cpp`, `View.cpp`, `Renderer.cpp`, `PropEditInfo.cpp`, `modules/molstr/MolRenderer.cpp` 等 (2.2)。
3. 非 uid の型不一致は個別に: `.size()`/size_t → `(int)` または `%zu`、`%p` に非 `void*` → `(void*)` キャスト、MSVC `%ld` に `qlib::time_value` → 型に合わせる。対象特定は CI ログの `-Wformat`/C4477 行 (file:line) から。
4. **文字列内容は変えない** (書式指定子と引数キャストのみ)。
5. 検証: `task build_libcuemol2` → 影響ラベルの gtest (`task run_gtest TEST=test_qsys` 等、+ 下流 molvis/surface/xtal/importers/molanl) → コミット → CI で `-Wformat`/C4477 が消えたことを確認。

### Phase 3 — override 付与
1. `.clang-tidy` を新規作成し `modernize-use-override` を有効化 (最小構成)。任意で `build_scripts/Taskfile.yml` に `lint_cpp` task を追加。
2. `clang-tidy --fix` を gfx/qsys/molstr (+ 他 module) に適用、または対象ヘッダに手で `override` を付与。molstr が最大対象。
3. `.clang-format` は override を弄らないので、適用後 `clang-format` で整形。
4. 検証: 全ターゲット `task rebuild_libcuemol2` (誤付与は即コンパイルエラー) → 全 gtest (`task run_gtest`) → CI で clang の `-Winconsistent-missing-override` が消滅。
5. 注意: 2306 件と最大 volume。**独立コミット**に閉じ、他カテゴリと混ぜない (レビュー時に phase 単位で分離できるように)。

### Phase 4 — GL deprecation + 残り高シグナル
1. OpenGL deprecation (macOS): `src/sysdep/CMakeLists.txt:127` 付近に APPLE ガードで
   `target_compile_definitions(sysdep PUBLIC $<$<PLATFORM_ID:Darwin>:GL_SILENCE_DEPRECATION>)` (libpng の APPLE 例が雛形)。必要なら `gfx` にも。
2. **MSVC 固有の高シグナルを個別調査・修正** (潜在バグ): ポインタ切り詰め C4311/C4312/C4302 (~37)、非 virtual デストラクタ C5204 (16)、演算子優先順位 C4554 (11)。
3. **gcc 固有**: `-Waggressive-loop-optimizations` (UB 指摘 16)、`-Wnonnull` (`this` が null 3) を個別確認。
4. enum 暗黙変換 (MSVC C5286/C5287 899) と narrowing (C4244 等 ~312) は大半がスタイル的ノイズ → プロジェクト方針として「明示キャストして直す」か「該当警告を `/wd` で抑制」かを別途判断 (この PR では判断のみ、実施は分離可)。
5. 検証: 該当 module の gtest + CI ログ確認。

---

## 7. 受け入れ条件と検証

- **最終的に 1 PR で** develop の必須 CI 4 種 (MacOS x64/arm64 clang, Ubuntu 22, Windows MSVC) が pass すること。各 Phase のコミット後にローカルビルド/テストで段階検証する。
- Phase 1: 対象 vendored ファイルの警告が 3 コンパイラログから消滅、かつ自前ファイルの警告数が変わらない (過剰抑制なし)。
- Phase 2: `-Wformat`(clang/gcc)・C4477(MSVC) が対象ファイルで消滅。gtest 全 pass (出力文字列不変)。
- Phase 3: `-Winconsistent-missing-override`(clang) 消滅。全ターゲットビルド + 全 gtest pass。
- Phase 4: 対象警告の消滅と、指摘された潜在バグ (ポインタ切詰め等) の妥当な修正。
- 共通: **CI ログの警告 file:line を before/after で比較**して数え上げる。MSVC は `gh api /repos/CueMol/cuemol2/actions/jobs/<job-id>/logs` で取得。

---

## 補足: 数え上げ用コマンド (参考)

```sh
# clang / gcc (job-id は build2 / build_linux の該当ジョブ)
gh run view --job <job-id> --log | grep -oE '\[-W[a-z0-9-]+\]' | sort | uniq -c | sort -rn

# MSVC (--log では取れないので API から full ログ)
gh api /repos/CueMol/cuemol2/actions/jobs/<job-id>/logs > win.log
grep -aoE 'warning C[0-9]{4}' win.log | sort | uniq -c | sort -rn
```
