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

### 2. インストーラ専用アイコン

`scripts/make-icons.py` を拡張し、master から `build/installer-icon.icns` /
`installer-icon.ico` を追加生成する。アプリアイコンの右下に **青い円 + 白い下向き矢印**の
インストールバッジを Pillow で描いて重ねたもので、外部アセットを足さず master 1 枚から
再生成できる既存スクリプトの設計に合わせている。

`dmg.icon` と `nsis.installerIcon` / `uninstallerIcon` にこれを指定する。
**アプリ本体のアイコンは変更しない** (`build/icon.*` の名前解決は従来どおり)。

バッジ径は canvas の **0.38**。16 / 24 / 32 / 200px でレンダリングして比較して決めた:
0.46 では大きい側でアプリアイコンの識別性を損なう割に、16px では結局どちらも「青い点」で
差が出ない。0.38 なら 24px で矢印が読め、16px でも青い点として区別がつき、大きいサイズで
元の絵を潰さない。

AppImage / deb は本体アイコン (`icon.png`) のままで正しい — Linux パッケージのアイコンとは
デスクトップエントリのアイコン、すなわちアプリ本体のアイコンだから。

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
- **`.dmg` ファイル自体のアイコンは変わらない。** `dmg.icon` が設定するのはマウント後の
  ボリュームアイコンで、Finder 上の `.dmg` ファイルは汎用のディスクイメージアイコンのまま。
  これはアプリアイコンとは別物なので識別性の目的は満たすが、完全なカスタムアイコンを
  `.dmg` ファイルに付けるには electron-builder の外で `Rez`/`SetFile` を回す必要がある
- **リポジトリの master PNG とトラック済みアプリアイコンが一致していない**ことが作業中に
  判明した。`/Users/user1/proj64/cuemol3-app-icon-master.png` から `make-icons.py` を回すと
  アプリアイコンが実際に変わる (512px で最大チャンネル差 255)。今回の
  `installer-icon.*` はトラック済み `icon.icns` の 1024px スライスから生成しており
  アプリと同じ絵柄になっているが、**次に `task make_tritium_icons` を回す人は
  アプリアイコンごと変わることを承知しておく必要がある**
- DMG ウィンドウの住み分け (`dmg.contents` によるアイコン配置・背景画像) は今回やっていない。
  electron-builder の既定で Applications シンボリックリンクと背景は既に入っており
  (実ビルドで確認)、旧 CueMol2 相当の作り込みは別作業

## Notes

- 実装: `tritium/react-gui/electron-builder.yml` (per-target `artifactName` ×3、`dmg:` 新設、
  `nsis:` に installerIcon / uninstallerIcon)、`tritium/packaging/package.sh`
  (`export CM_FULL_VERSION`)、`tritium/react-gui/scripts/make-icons.py`
  (`_badge()` / `badged()` + 2 出力、`make_icns`/`make_ico` の出力名パラメータ化)、
  `build/installer-icon.{icns,ico}` (生成物)
- テスト: `__test__/artifactNaming.test.ts` 18 件。`fileAssociationSync.test.ts` と同じ
  regex 方式で `electron-builder.yml` を読む
- 実機確認 (macOS arm64): `task package_tritium` →
  `CueMol3-2.3.9.498-macOS-arm64-Installer.dmg` が出力され、マウントしたボリュームの
  `.VolumeIcon.icns` が `build/installer-icon.icns` と**バイト一致**、
  `Applications` シンボリックリンクも既定で同梱されることを確認。
  Windows / Linux は CI 依存 (ローカル環境なし)
