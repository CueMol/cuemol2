# ADR-0030: tritium packaging / release-build renovation

- Status: accepted (Phase 0-3 + Electron 33->42 done on `pkg_0614`; 3-OS packaging builds in CI, release-cadence gating + tag->GitHub Release wiring + app icon in place; tag->release flow awaits the first tag to verify; per-OS runtime launch verified on mac only; Phase 4 [signing/notarization] pending)
- Date: 2026-06-14
- Mapping rows: (none -- build/packaging infrastructure; not a UXP inventory item)

## Context

tritium (Electron + React) の UXP からの機能移植が一区切りついたため、release
build / packaging の現状を 8 観点で監査し、改装方針を決定する。

**現状**: 配布物は「macOS arm64 / ad-hoc 署名 / DMG」を開発者のローカルで手動
ビルドするのみ (`pnpm run package:mac` -> `tritium/packaging/package-mac.sh`)。
CI (`.github/workflows/build2.yml`) は libcuemol2・tritium/core のビルド & テスト
は行うが、**electron-builder を一度も実行せず DMG も生成・アップロードしない**。
tag push 時のリリース成果物は旧 UXP GUI のみ。

**監査で確定した主要問題 (テーマ別、finding ID は本 ADR の Notes 参照)**:

| テーマ | 中身 | finding |
|---|---|---|
| 再現性 | core が Debug ビルドなのに staging は `build/Release/` を hardcode -> 手順通りでも失敗。`LIBCUEMOL2_ROOT` に既定値なし | staging-1, staging-5, nativepy-4 |
| staging 脆弱性 | `@cuemol/core` symlink を rm -> trap 復元する非原子的操作 (SIGKILL で dev tree 破壊)。同梱 dep が require グラフ由来でない手書き | staging-3, staging-4, bp-7 |
| バージョン分裂 | DMG は `0.1.0` (react-gui/package.json)、About は `2.3.5.482` (QM_VERSION)。bumpversion は tritium を更新しない | version-1/4/5, bp-8 |
| identity | appId が POC 名 `org.cuemol.cuemol3-poc2`、productName が `CueMol3` vs `CueMol3-tritium` で不一致 | version-2/3, drift-3 |
| クロスプラットフォーム | electron-builder は mac arm64 DMG のみ。staging は bash + `*.dylib` 決め打ちで Win/Linux 不可 | xplat-1/2/8, bp-5 |
| CI 自動化なし | tritium を packaging する CI job がゼロ。署名/リリースの自動経路なし | cicd-1/2, staging-2, nativepy-3 |
| ドキュメント腐敗 | `electron-builder.yml` ヘッダが存在しない `build/afterPack.cjs` を「SOLUTION」と記述し自己矛盾。packaging 手順の文書ゼロ | drift-1/2/5, staging-6, nativepy-2, bp-9 |
| 横断 (security) | **Electron 33 は EOL**。配布前に supported major への更新が必要 (.node の ABI 再検証含む) | bp-3 |

## Decision

以下のスコープ・原則を確定する。

1. **対象 OS** = macOS arm64 + Windows x64 + Linux x64。**Intel mac は対象外**
   (universal/lipo も当面不要)。
2. **署名方針** = 当面 **ad-hoc 署名 (`identity: "-"`) のまま**。Developer ID /
   notarization は分離した後続フェーズ (Phase 4) とし、**後から差し込める設計**に
   しておく (entitlements 雛形・inner->outer 署名順序メモを準備)。配布する場合は
   quarantine 解除手順を文書化し「dev/internal 配布専用」と明示する。
3. **embedded python** = **optional**。libcuemol2 が python に link している場合
   のみ `lib/python` を同梱し、非 embed (現状の既定) は python 無しでパッケージ
   する。staging は libcuemol2 のビルド option `ENABLE_PYTHON_EMBED` の結果に追従
   して条件分岐する。
4. **バージョン単一原点** = `src/_version.h` の `QM_VERSION` を唯一の origin と
   する (bumpversion が更新する)。tritium 配布物のバージョンはここから導出する。
   実現方式は「packaging 時にビルド時注入」を推奨、「bumpversion の対象に tritium
   の package.json を追加」を代替とする (Notes 参照)。
5. **app identity** = appId `org.cuemol.cuemol3` / productName `CueMol3` に統一
   する (electron-builder.yml / package.json / `app.setName` / menu / About を
   単一の共有定数に集約し `tritium` コードネームを user-facing から除去)。appId は
   公開配布開始前に確定する (userData/keychain パスの永続キーのため、後変更は痛い)。

実装はフェーズ分割し、**署名を最後 (Phase 4)** に置く。Phase 0〜3 で「未署名でも
正しく・再現可能・3 OS 対応の配布物が CI から出る」状態まで到達することを目標に
する。

### Roadmap

#### Phase 0 -- 基盤整備 (低リスク・署名不要)

| # | 内容 | finding |
|---|---|---|
| 0-1 | バージョン単一原点化: QM_VERSION を packaging へ伝播 (Notes の方式参照)。CFBundleVersion は 4 桁目を `buildVersion` に分離 | version-1/4/5, bp-8 |
| 0-2 | app identity 確定: appId `org.cuemol.cuemol3` / productName `CueMol3` を全箇所統一、共有定数化 | version-2/3, drift-3, bp-10 |
| 0-3 | core ビルド config 整合: packaging は staging 前に Release で core を明示ビルド (または build/{Release,Debug} 検出 + アサート)。「packaging = Release core」を保証 | staging-1, nativepy-4 |
| 0-4 | `LIBCUEMOL2_ROOT` 既定値 (= Taskfile の `OUTDIR/cuemol2`) + install 検証 (sysconfig.xml 存在 / dylib arch) | staging-5 |
| 0-5 | ドキュメント腐敗一掃: `electron-builder.yml` ヘッダから幻の afterPack.cjs 記述削除 (実態は cmake `@loader_path/../lib`)、isPackaged ロジック参照先を index.ts -> ipcHandlers.ts 訂正、非 ASCII コメント修正 | drift-1/2/8, staging-6, nativepy-2, bp-9, xplat-6 |
| 0-6 | gitignore 確認 (※ `tritium/.gitignore` に既存エントリあり -> 対応済みの可能性大、verify のみ) | staging-9 |

#### Phase 1 -- staging 堅牢化 (symlink dance 廃止)

| # | 内容 | finding |
|---|---|---|
| 1-1 | symlink rm/trap 廃止: `pnpm deploy --filter` または build 用 `.npmrc` の `node-linker=hoisted` で自己完結 node_modules を生成し、ライブの workspace symlink を一切触らない | staging-3, bp-7 |
| 1-2 | 同梱 dep を導出 + smoke 検証: 手書き cp リストをやめ production deps を実 install から収集、staging 後に `node -e require(index.cjs)` と必須ファイルアサート | staging-4, staging-10 |
| 1-3 | embedded python = 条件付き staging (optional 方針)。embed 構成を検出し python 未同梱なら即 fail (silent flash-crash 防止)、embed 配布時のみ `lib/python` 同梱。実地で nativepy-1 再現済み (Notes 参照) | nativepy-1 |
| 1-4 | (任意) asar 再有効化検討: staging を node_modules 正規配置に直せたら `asar:true` + `asarUnpack` へ。効果測定の上で判断 (必須でない) | bp-6, staging-7, staging-8 |

#### Phase 2 -- クロスプラットフォーム packaging (Windows + Linux)

| # | 内容 | finding |
|---|---|---|
| 2-1 | electron-builder に `win:` (nsis x64) / `linux:` (AppImage + deb x64) ブロック追加。**Windows は `nsis:` ブロックでウィザード型 assisted installer を採用** (`oneClick:false` / `perMachine:true` (Program Files) / `allowToChangeInstallationDirectory:true` / desktop+start-menu shortcut)。既定のワンクリック per-user サイレント install ではなく、一般的な Windows インストーラー UX にする | xplat-1, bp-5 |
| 2-2 | staging の cross-platform 化 (bash -> Node)。Win: DLL は `.node` と同じ build/Release/ へ (CMake は配置済み、staging 先と FileSet の OS 分岐のみ)。Linux: `*.so*` を `cp -P` で SONAME 保持 | xplat-2, xplat-8 |
| 2-3 | arch 一致ガード: staged lib の arch を検証し electron-builder の `--arch` 不一致なら fail (crash-on-load 防止) | xplat-4 |
| 2-4 | アプリアイコン追加 (icns/ico/png) | drift-9 |

#### Phase 3 -- CI 自動化とリリース連携

| # | 内容 | finding |
|---|---|---|
| 3-1 | packaging matrix job 追加 (macos-15 / windows-2022 / ubuntu-22.04)。core ビルド後に per-platform package を実行し成果物を upload-artifact | cicd-1/2, staging-2, nativepy-3, drift-6 |
| 3-2 | Taskfile に `package_tritium` task 追加 (ローカルと CI が同一経路を共有、env 契約一元化) | staging-2 |
| 3-3 | VERSION 注入と命名整合: `build2.yml` 既存 VERSION を electron-builder へ注入、`artifactName` を明示し CI artifact 命名 (`cuemol2_${VERSION}_${os}_${arch}`) と整合 | cicd-6, version-4/5 |
| 3-4 | リリース連携: packaging job を `release_build` の `needs` に追加、tag push 時のみ実行 (ad-hoc dev DMG 漏れ防止)、添付前に bundle smoke 検証 (.node / sysconfig.xml 存在) | cicd-7 |
| 3-5 | PR 向け軽量 smoke: `package:dir` (高速) で staging/asar/rpath regression 検出。`package:dir` を staging 経由に修正 or 削除 | drift-6/7 |

#### Phase 4 -- 署名・notarization (Developer ID 取得後・分離可能)

| # | 内容 | finding |
|---|---|---|
| 4-1 | 当面 (未署名継続): README に **macOS の quarantine 解除手順**と **Windows 未署名インストーラーの SmartScreen 「詳細情報 -> 実行」回避手順**を明記し、dev/internal 配布専用と注記 | drift-5, sign-1 |
| 4-2 | 準備 (雛形のみ可): `build/entitlements.mac.plist` (allow-jit / allow-unsigned-executable-memory / disable-library-validation) を用意。loose dylib + .node の inner->outer 署名順序メモ (署名後の rpath 書換禁止) | bp-2, sign-2/6 |
| 4-3 | Developer ID 取得後: identity を Developer ID、`hardenedRuntime:true`、`mac.notarize`(notarytool)+staple、`CSC_*`/`APPLE_*` を CI secret に。dylib/.node を inner-first 署名。Windows は Authenticode (後続) | sign-1/3, xplat-5 |
| 4-4 | (任意) auto-update: 署名後に `zip` ターゲット + `publish`(GitHub) + electron-updater | sign-5, bp-4 |

#### 横断トラック -- Electron EOL 対応 (配布前必須)

Electron 33 は EOL (Chromium/V8/Node の security patch なし)。公開配布前に supported
major (40〜42) へ更新する。`cuemol_internal.node` は Electron の Node ABI に link する
ため **ABI 再検証** (cmake-js リビルド + Jest/Vitest 通し) を伴う。packaging とは独立だが
**Phase 0〜1 のうちに着手**を推奨。Renovate/Dependabot で bump cadence も整備 (bp-3)。

## Consequences

- **得られるもの**: 未署名でも (a) バージョン/名称が一貫し、(b) クラッシュしても dev
  tree が壊れず、(c) macOS arm64 / Windows x64 / Linux x64 の versioned 配布物が CI から
  再現可能に出る状態。これにより Developer ID 取得時の Phase 4 は「署名を差し込むだけ」に
  縮小される。
- **コスト/先送り**: notarization・auto-update・Intel mac・universal build は当面対象外。
  ad-hoc 配布は Gatekeeper quarantine 解除が必要で一般エンドユーザ向けではない。asar 再
  有効化は効果測定次第で見送りうる。
- **依存**: Phase 2 以降は Phase 1 の staging 再構成が前提。Phase 4 の auto-update は署名
  完了が前提 (未署名の自動更新は無意味)。Electron 更新は ABI 再検証を伴うため packaging
  と並行スケジューリングが必要。

## Notes

### バージョン単一原点の実現方式 (Decision 4 詳細)

origin は `src/_version.h` の `QM_VERSION "2.3.5.482"` (bumpversion が更新、
`.bumpversion.cfg` の `serialize = {major}.{minor}.{patch}.{build}`)。electron-builder の
`version` は semver 必須 (4 パートは不可) のため、いずれかで橋渡しする:

- **推奨 (ビルド時注入)**: packaging スクリプト/Taskfile/CI が `QM_VERSION` を grep
  (CI は `build2.yml` で既に算出) し、`electron-builder --config.extraMetadata.version=2.3.5`
  + `--config.buildVersion=482` を渡す。単一 parse 点で完結し、package.json に不正な 4 パート
  semver を持ち込まない。
- **代替 (bumpversion 拡張)**: `.bumpversion.cfg` に
  `[bumpversion:file:tritium/react-gui/package.json]` を追加し、per-file `serialize` で
  `{major}.{minor}.{patch}` (semver) にマップ。ただし 4 桁目 (build) の CFBundleVersion への
  反映は別途注入が要る。ユーザは本方式も許容。

About ダイアログの表示バージョンは C++ 側 (`getAppInfo` -> `SceneManager` -> QM_VERSION)
が真実であり、これを変更しない。package.json/DMG/Info.plist を C++ 側に一致させる。

### embedded python 条件分岐 (Decision 3 / 1-3 詳細)

- 現状確認: `.build_out`/dev build は非 embed (`lib/python` 無し、libcuemol2.dylib に
  libpython の hard load 依存無し)。embed build は CI の `_py312` variant のみ。libcuemol2.dylib
  には `@loader_path/../lib/python/lib` 等の LC_RPATH が常時 baked されるが、これは検索パス
  であり libpython を hard link しない限り無害。
- 方針: embed build を配布する場合のみ `$LIBCUEMOL2_ROOT/lib/python` を staging する。
  `pybr.cpp` の `findPythonHome` (`<sysconfig_dir>/../lib/python`, `<sysconfig_dir>/python`)
  と dylib rpath の解決先が**異なるアンカー**を期待する点に注意し、同梱時は両者を整合させる。
- **実地確認 (2026-06-14)**: nativepy-1 が実機で再現。embed-python 版 libcuemol2 を
  同梱した DMG はインストール起動時に window が一瞬出て即終了 (worker が libpython 依存の
  libcuemol2 ロードに失敗)。非 embed 版でリビルドすると正常起動 (非 embed DMG は別マシンで
  ターミナル直接起動でも全 init 完走を確認済み)。当初 Gatekeeper/quarantine を疑ったが誤りで、
  ローカルビルド DMG は quarantine 無しのため Gatekeeper は無関係 (notarization は配布時の
  Phase 4 課題)。
- **Phase 1 で入れるガード (task 1-3, 本 ADR 合意済み)**: collect-cuemol2-runtime.sh が
  embed-python 構成を検出し、python 未同梱なら**明確なエラーで即 fail** する (silent な
  flash-crash を防ぐ)。判定は **libcuemol2 共有ライブラリの実 load 依存**
  (`otool -L` / `readelf -d` / `objdump -p` で libpython への load command を検査) で行う。
  `$LIBCUEMOL2_ROOT/lib/python` ディレクトリの有無や `@loader_path/../lib/python` rpath は
  **非 embed でも常に baked/残存し得る**ため signal として使わない (embed ON→OFF 再ビルドで
  dir が残る false positive を回避 ; 2026-07-12 に dir 判定から link 依存判定へ変更)。addon は
  libpython を dlopen せず load 依存でリンクするので (`pybr` STATIC が `Python3::Python` を
  取り込み `cuemol2` SHARED に伝播) この検査は確定的。inspection ツールも共有 lib も無い場合のみ
  dir 有無へ conservative fallback。将来的に python staging を実装して同梱対応。

### 外部 bundle apps の同梱 (POV-Ray / ffmpeg / apbs-pdb2pqr, macOS + Windows)

2026-07-12 に uxp_gui (`src/osxbuild/add_povray.pl.in`) と同じ範囲の外部ソフトを
tritium の macOS DMG / Windows NSIS へ同梱する経路を実装。配置は uxp の
`Resources/{povray,ffmpeg,apbs-pdb2pqr}` ではなく、`getRenderBinaries()` が既に期待する
Electron 流レイアウトに合わせる (Windows は `povray/bin/povray.exe`, `blendpng.exe` 等):

- `Resources/bundle_apps/povray/{bin/povray, include}` -- `BUNDLE_APPS` (task download_extpkgs) 由来
- `Resources/bundle_apps/apbs/{apbs, pdb2pqr, dat}`, `Resources/bundle_apps/ffmpeg/bin/ffmpeg` -- 先置きのみ (tritium 側の実行時 resolver/UI は未配線)
- `Resources/cuemol2/bin/blendpng` -- libcuemol2 install (`<prefix>/bin`) 由来

実装点: `collect-cuemol2-runtime.sh` の section (1b) が blendpng (必須) と extpkgs
(best-effort ; 未取得は警告 skip) を `packaging/cuemol2-runtime/{bin,bundle_apps}` へ
staging し、`electron-builder.yml` の extraResources 2 エントリが `cuemol2/bin` /
`bundle_apps` へマップ。ローカルは `Taskfile.yml` の `package_tritium:darwin` が
`BUNDLE_APPS` を渡す。CI は `build2.yml` の macOS / Windows 両 job で `download_extpkgs` を
tritium package の前へ移動し、package step に `BUNDLE_APPS=<workspace>/target` を export
(同 download は後続の UXP build も兼ねる) して配布物に同梱する。extpkgs のコピーは package
ディレクトリ単位 (`cp -R`) なので OS ごとの実行ファイル名差 (povray vs povray.exe 等) を
自動で吸収する。macOS は ad-hoc `codesign --deep` が同梱バイナリも自動署名する。**Phase 4
(Developer ID + notarization + hardenedRuntime) では各バイナリの個別署名と、spawn 用の
`com.apple.security.cs.disable-library-validation` entitlement が必要**になる点に注意。
Windows の `blendpng.exe` は依存 DLL (lcms2 等) の同ディレクトリ配置が別途必要になり得る
(現状は contract どおりのパスへ配置のみ)。Linux packaging への extpkgs 展開は follow-up。

### 主な実装ポインタ (現状)

- `tritium/react-gui/electron-builder.yml` -- mac arm64 dmg (`identity:"-"`) / win x64 nsis (`nsis:` wizard, unsigned) / linux x64 AppImage+deb / `asar:false`
- `tritium/packaging/package-mac.sh` -- symlink rm/trap + build orchestration
- `tritium/packaging/collect-cuemol2-runtime.sh` -- share/ + dylib + 手書き dep staging
- `tritium/react-gui/src/main/ipcHandlers.ts` -- `getSysConfigPath()` (isPackaged/resourcesPath)
- `.github/workflows/build2.yml` -- core build/test + UXP 成果物のみ (tritium packaging 無し)
- `.bumpversion.cfg` / `src/_version.h` -- version origin
- `tritium/core/CMakeLists.txt` -- per-OS native lib 配置 (`@loader_path/../lib` / Win は .node 隣)

### 未解決の論点

- バージョン方式は「ビルド時注入」「bumpversion 拡張」のどちらを採用するか (推奨は注入)。
- Electron 更新の着手時期 (packaging と並行 / 先行)。
- asar 再有効化を実施するか (効果測定後に判断)。

### 監査トレーサビリティ

本 ADR の finding ID (例 `staging-1`, `cicd-2`, `xplat-1`, `version-1`, `bp-3`,
`nativepy-1`, `drift-1` ...) は 8 観点の dynamic-workflow packaging 監査 (2026-06-14)
に対応する。各 ID は当該観点 (signing / cross-platform / staging / native+python /
version / ci / best-practices / stale) の 1 指摘を指す。

### 関連 ADR

- [ADR-0011](ADR-0011-new-tab-canvas-lifecycle.md) -- packaged 環境の挙動制約 (OffscreenCanvas)
