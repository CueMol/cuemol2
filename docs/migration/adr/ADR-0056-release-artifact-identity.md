# ADR-0056: リリース成果物が自分の OS と役割を名乗る — 命名規約とインストーラアイコン

- Status: accepted
- Date: 2026-08-23
- Mapping rows: (なし — packaging の課題で mapping 行を持たない)
- Supersedes: [ADR-0030](ADR-0030-tritium-packaging-renovation.md) の命名に関する記述 (項目 3-3)

## Context

v2.3.8.494 で公開された CueMol3 の資産:

```
CueMol3-2.3.8-arm64.dmg      CueMol3-2.3.8-x64.exe
CueMol3-2.3.8-amd64.deb      CueMol3-2.3.8-x86_64.AppImage
```

ダウンロードした人が「どの OS 向けか」「アプリ本体かインストーラか」を判断できない。

1. **OS 名がどこにも無い** — 手がかりは拡張子だけ
2. **arch 表記が不統一** — 2 種類のマシン向けに `arm64` / `x64` / `amd64` / `x86_64` の 4 語。
   原因は単一テンプレート `${productName}-${version}-${arch}.${ext}` の `${arch}` が
   各ターゲットのネイティブ表記に展開されること
3. **役割が読めない** — `.exe` が NSIS インストーラであること、`.AppImage` が
   アプリ本体そのものであることがファイル名に出ない
4. **ビルド番号が落ちている** — `${version}` は electron-builder が要求する 3 桁 semver。
   `packaging/package.sh` が 4 桁の `QM_VERSION` を semver + `buildVersion` に分解するため、
   `.494` はファイル名に現れない。同じリリースに同居する CueMol2 側の資産は
   `cuemol2_2.3.8.494_macOS_ARM64.tar.bz2` と 4 桁で、表記が食い違っている
5. **アイコンが全部同じ** — `electron-builder.yml` に `icon:` キーも `dmg:` ブロックも無く、
   `build/icon.{icns,ico,png}` の 1 セットが buildResources の名前解決で拾われて、
   アプリ本体・DMG ボリューム・NSIS インストーラ exe・アンインストーラのすべてに使われていた

旧 CueMol2 (UXP) は `cuemol2-2.3.0.461.win64.installer.exe` という命名で **OS トークンと
`installer` の役割語**を持ち、DMG には専用の `disk.icns` ボリュームアイコンと `background.png`、
NSIS には `wiz*.bmp` のウィザード画像まで用意していた
(`uxp_gui/cuemol2/installer/Makefile.in:101-104`、`branding/unofficial/`)。
tritium は移行時にこれらを引き継がないまま来ていた。

## Decision

### 1. per-target の `artifactName` で OS・arch・役割を名乗る

```
CueMol3-2.3.9.498-macOS-arm64-Installer.dmg
CueMol3-2.3.9.498-Windows-x64-Setup.exe
CueMol3-2.3.9.498-Linux-x64.AppImage
CueMol3-2.3.9.498-Linux-x64.deb
```

- **`${arch}` は使わない。** 表記の不統一そのものの原因なので、OS と arch を literal で書く。
  各ターゲットが宣言する arch はちょうど 1 つなので literal で衝突しないが、これは
  将来 arch を増やすと壊れる前提なので `__test__/artifactNaming.test.ts` が
  「各ターゲットの arch 宣言は 1 つ」「literal がその arch と一致」を縛る
- **役割語は `dmg` と `exe` だけ。** どちらも「アプリを手に入れる前に実行する何か」を
  ユーザーに渡す。AppImage は**アプリ本体そのもの**、deb はパッケージで拡張子が役割を語るので
  付けない。Windows は `Installer` ではなく慣用の `Setup`
- **4 桁バージョンは `${env.CM_FULL_VERSION}`。** `packaging/package.sh` が既に読んでいる
  `QM_VERSION` をそのまま export する 1 行で足りる。`${version}` は semver 制約で 3 桁のまま
- **トップレベルの `artifactName` は残す。** 将来ターゲットが増えたとき、スコープ付き
  パッケージ名 (`@cuemol/react-gui`) 由来のファイル名に `/` が入って fpm が落ちる事故
  (`electron-builder.yml` の既存コメントが記録している) を防ぐフォールバックとして機能し続ける

### 2. インストーラアイコンは Phosphor の `BoxArrowDown`

`build/installer-icon.{icns,ico}` を新設し、`dmg.icon` と `nsis.installerIcon` /
`uninstallerIcon` に割り当てる。中身は **Phosphor Icons の `BoxArrowDown` (fill)** を
アプリアイコンと同じ charcoal (`#3a3a3f`) の角丸タイルに白で載せたもの。
生成は `scripts/make-installer-icon.py`。

ここに至るまでに 2 案を捨てている。**どちらも実物をレンダリングして初めて判断できた**ので、
経緯を残す。

- **アプリアイコン + インストールバッジ (青円 + 下向き矢印) — 却下。**
  48px 以上なら矢印が読めるが、ダウンロードフォルダで実際に効くサイズでは
  「アプリアイコンに小さな点が付いたもの」にしか見えない (owner 判断)
- **NSIS 同梱アイコンの vendor — 却下。** そもそも「`installerIcon` を未設定にして NSIS の
  default に任せる」ができない: electron-builder のフォールバックは NSIS 組み込みではなく
  **アプリアイコン**である (`app-builder-lib/out/targets/nsis/NsisTarget.js:176` —
  `getResource(options.installerIcon, "installerIcon.ico") || packager.getIconPath()`)。
  では配布物を取り込もうと `nsis-3.0.5.0.7z` を展開して実物を見たところ、`modern-install`
  系はいずれも**アイコン内に "NSIS" のロゴが描かれており**、かつ最大 48px。CueMol の
  インストーラがインストーラ作成ツールのブランドを表示することになり、アプリアイコンより悪い

Phosphor を選んだ理由は 3 つ。**既にアプリ UI が使っている icon set** なので見た目の系統が
揃う (`src/renderer/data/appIcons.ts`)、**MIT ライセンス**で追加の検討が要らない、そして
**グリフが絵の主体**になるのでバッジと違い 16px でもアプリと取り違えない。weight は `fill` —
outline 系は 16px で線が潰れるが、このアイコンは小さいサイズでこそ効く必要がある。

**生成物をリポジトリにコミットする** (パッケージング時に生成しない)。SVG のラスタライズには
cairo が要り、これはアプリのビルドにもパッケージングにも本来不要な native 依存だから。
アートワークを変える人だけが cairo を入れればよい。

## Consequences

- ダウンロードしたファイル名だけで OS・arch・役割が分かる。同じリリース内で CueMol2 側の
  4 桁表記とも揃う
- **リネームは CI を壊さない。** CueMol3 の成果物を消費しているのはすべて拡張子 glob
  (`*.dmg` / `*.exe` / `*.AppImage` / `*.deb`、リリース添付は `files: artifacts/*`) で、
  ファイル名を literal 参照している箇所はリポジトリ内に存在しない。auto-update も無い
  (`electron-updater` 不使用、`publish:` 未設定なので `latest*.yml` も生成されない) ので、
  更新機構が壊れる経路も無い。全 upload に `if-no-files-found: error` が付いているため、
  名前が想定外になれば CI が赤くなって気付ける
- **`dmg.title` は既定のままにした。** 4 桁バージョンを入れようとしたが、`dmg.title` は
  `${env.*}` を展開せず、実ビルドで `CueMol3 ${env.CM_FULL_VERSION}` という名前の
  ボリュームがマウントされた (実機確認済み)。`${version}` は 3 桁なのでファイル名と揃える
  手段が無い。ボリューム名は一時的で、ユーザーの手元に残るのはファイル名なので既定に戻した
- ファイル名でもアイコンでも役割が分かるようになった。macOS は DMG のボリューム、
  Windows は `Setup.exe` とアンインストーラの両方に適用される
- **`installer-icon.*` は `make-icons.py` (アプリアイコン) とは別スクリプト・別ソース**。
  前者は Phosphor + cairo、後者はリポジトリ外の master PNG。混同しないよう docstring で
  相互に参照させてある
- **リポジトリの master PNG とトラック済みアプリアイコンが一致していない**ことが作業中に
  判明した。`~/proj64/cuemol3-app-icon-master.png` から `make-icons.py` を回すとアプリ
  アイコンが実際に変わる (512px で最大チャンネル差 255)。今回アイコンは触っていないので
  影響しないが、**次に `task make_tritium_icons` を回す人はアプリアイコンごと変わることを
  承知しておく必要がある**
- DMG ウィンドウの住み分け (`dmg.contents` によるアイコン配置・背景画像) は今回やっていない。
  electron-builder の既定で Applications シンボリックリンクと背景は既に入っており
  (実ビルドで確認)、旧 CueMol2 相当の作り込みは別作業

## Notes

- 実装: `tritium/react-gui/electron-builder.yml` (per-target `artifactName` ×3、`dmg:` 新設、
  `nsis:` に installerIcon / uninstallerIcon)、`tritium/packaging/package.sh`
  (`export CM_FULL_VERSION`)、`tritium/react-gui/scripts/make-installer-icon.py` (新規)、
  `build/installer-icon.{icns,ico}` (生成物)、`build/ICON-ATTRIBUTION.md` (Phosphor の
  MIT 表示。派生ラスタを配布物に埋め込むため)
- テスト: `__test__/artifactNaming.test.ts` 18 件。`fileAssociationSync.test.ts` と同じ
  regex 方式で `electron-builder.yml` を読む
- 実機確認 (macOS arm64): `task package_tritium` →
  `CueMol3-2.3.9.499-macOS-arm64-Installer.dmg` が出力され、マウントしたボリュームの
  `.VolumeIcon.icns` が `build/installer-icon.icns` と**バイト一致**、
  `Applications` シンボリックリンクも既定で同梱されることを確認。
  Windows / Linux は CI 依存 (ローカル環境なし)
