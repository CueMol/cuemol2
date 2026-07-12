# CueMol3 (tritium) packaging / 配布手順

electron-vite + electron-builder による配布物のビルド手順と、**未署名配布時の注意**をまとめる。
設計判断・スコープの詳細は [ADR-0030](../../docs/migration/adr/ADR-0030-tritium-packaging-renovation.md) を参照。

## 前提

- libcuemol2 (`src/`) と tritium/core の native addon (`cuemol_internal.node`) を事前にビルドし、
  `LIBCUEMOL2_ROOT`（既定: `<repo>/.build_out/cuemol2`）に install しておくこと。
- （macOS / Windows, 任意）外部 bundle ソフト（POV-Ray / ffmpeg / apbs-pdb2pqr）を
  配布物に同梱するには、`cd build_scripts && task download_extpkgs` を先に実行して
  `BUNDLE_APPS`（既定: `$HOME/tmp/proj64_deplibs`）に配置しておくこと。未配置でも
  パッケージングは通るが、警告が出て当該バイナリは同梱されない（POV-Ray レンダリングは
  Settings でパスを手入力すれば動く）。CI（`build2.yml`）は macOS/Windows とも package
  前に `download_extpkgs` を実行し `BUNDLE_APPS` を渡すので自動で同梱される。
- パッケージングは各スクリプトが staging（`collect-cuemol2-runtime.sh`）→ `electron-vite build`
  → `electron-builder` を順に実行する。バージョンは `src/_version.h` の `QM_VERSION` から導出される。

## ビルドコマンド（OS 別）

| OS | コマンド | 成果物 (`tritium/react-gui/release/`) |
|----|----------|----------------------------------------|
| macOS (arm64) | `cd tritium/react-gui && pnpm run package:mac` | `CueMol3-<version>-arm64.dmg` |
| Windows (x64) | `cd tritium/react-gui && pnpm run package:win` | `CueMol3-<version>-x64.exe`（NSIS インストーラー） |
| Linux (x64) | `bash tritium/packaging/package.sh --linux --x64` | `CueMol3-<version>-x64.AppImage` / `.deb` |

CI（`.github/workflows/build2.yml`）も同じ経路で macOS DMG と Windows NSIS `.exe` を生成・upload する。

### Windows インストーラーの形式

Windows は **ウィザード型 NSIS インストーラー**（assisted installer）。実行すると:

- ようこそ → インストール先の選択 → インストール → 完了 のウィザードが表示される
- 全ユーザー向けに `C:\Program Files\CueMol3\` へインストール（UAC 昇格が入る）
- スタートメニュー / デスクトップにショートカットを作成
- 「アプリと機能 / プログラムの追加と削除」に登録され、アンインストーラで削除可能

設定は `tritium/react-gui/electron-builder.yml` の `nsis:` ブロック。

## 未署名配布に関する注意（重要）

現状の配布物は **未署名**（コード署名 / notarization は ADR-0030 **Phase 4** の後続作業）。
このため一般エンドユーザー向けではなく **dev / internal 配布専用**。初回起動時に OS の警告が出るので、
以下の手順で回避する。

### macOS（Gatekeeper quarantine）

Web からダウンロードした `.dmg` は quarantine 属性が付き、そのままでは「開発元を確認できないため開けません」
となる。次のいずれかで回避:

- Finder で `CueMol3.app` を右クリック → 「開く」→ ダイアログで「開く」
- または quarantine 属性を除去:

  ```sh
  xattr -dr com.apple.quarantine /Applications/CueMol3.app
  ```

（ローカルでビルドした DMG は quarantine が付かないため警告は出ない。）

### Windows（SmartScreen）

未署名 `.exe` を実行すると「Windows によって PC が保護されました」（発行元不明）と表示される。

1. ダイアログの **「詳細情報」** をクリック
2. 表示される **「実行」** ボタンをクリック

署名（EV/OV 証明書または Azure Trusted Signing）を導入すればこの警告は解消される。導入方針は
ADR-0030 Phase 4 を参照（`electron-builder.yml` の `win.certificateFile` / `win.azureSignOptions`
を差し込み、`CSC_*` を CI secret 化する設計になっている）。
