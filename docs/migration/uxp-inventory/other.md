# UXP Inventory — Other

> ⚠️ このファイルは Claude Code による自動生成です。手修正しないでください。
> 再生成する場合は `_spec.md` に従ってください。

- Generated: 2026-04-20
- Source: `uxp_gui/cuemol2/`
- Spec: [_spec.md](./_spec.md)
- Entries: 4

## Index

- [`other.cuemol2`](#othercuemol2)
- [`other.hidden-window`](#otherhidden-window)
- [`other.mybrowser`](#othermybrowser)
- [`other.config-dialog`](#otherconfig-dialog)

---

## Entries

### `other.cuemol2`

- **File**: `uxp_gui/cuemol2/base/content/cuemol2.xul`
- **Root element**: `<window>`
- **Title**: "CueMol2" (`&cuemol2.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/cuemol2.xul`
- **Associated JS**: `cuemol2-utils.js`, `cuemol2-panels.js`, `shortcut-manager.js`, `cuemol2.js`, `tabmolview.js`, `sidepanelholder.js`, `colpicker.js`
- **Overlays applied**: `cuemol2-scripts.xul`, `cuemol2-menus.xul`, `cuemol2-macos-menus.xul` (macOS only via `#ifdef`), `topbar/cuemol2-ribbon.xul`, `anim/anim-ribbon.xul`, `workspace_panel.xul`, `molstruct-panel.xul`, `selection-panel.xul`, `coloring-panel.xul`, `symmetry-panel.xul`, `densitymap-panel.xul`, `fakedial-panel.xul`, `anim/anim-panel.xul`, `bottom-panels/btmpanel-holder.xul`

#### User-visible features
- 左サイドパネルホルダー (`<sidepanelholder id="left_side_panel">`)
- サイドバースプリッター (collapse before)
- タブ付きメインモレキュールビュー (`<tabmolview id="main_view">`)
- ボトムパネルエリア (スプリッター付き、高さ persist)
- ステータスバー (ステータスパネル `status`、アラートポップアップアンカー `alert-popup-anchor`)
- メニュー・リボン・パネル・スクリプト用オーバーレイターゲット (`overlaytarget`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| `onclose` | `gQm2Main.onCloseEvent(event)` | ウィンドウクローズ確認処理 |

#### i18n keys used
- `&cuemol2.title;` (dtd: `cuemol2.dtd`)
- `mainView.properties` (stringbundle id: `strings`)

#### Notes
- プリプロセッサ `#ifdef XP_MACOSX` を含むため、単純なXMLパーサでは解析不可
- ルートの `<window>` 要素はDOCTYPE宣言・複数のオーバーレイPI・スタイルシートの後に位置する
- `tabmolview` および `sidepanelholder` はXBLバインディング (`mainViewBindings.xml`, `sidepanelholder-bindings.xml`) として実装されている

---

### `other.hidden-window`

- **File**: `uxp_gui/cuemol2/base/content/hiddenWindow.xul`
- **Root element**: `<window>`
- **Title**: "CueMol2" (`&cuemol2.title;` in `cuemol2.dtd`)
- **Chrome URL**: `chrome://cuemol2/content/hiddenWindow.xul`
- **Associated JS**: `globalOverlay.js` (chrome://global/content/), `cuemol2-utils.js`
- **Overlays applied**: `cuemol2-macos-menus.xul`

#### User-visible features
- Help メニュー (`&menu_help.label;`)
- About CueMol2 メニューアイテム (macOS/非macOSでラベル切替)
- メニュー用オーバーレイターゲット (`menus-overlay-target`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| About menuitem `oncommand` | `getQm2MainObj().openAboutDialog()` | About ダイアログを開く |

#### i18n keys used
- `&cuemol2.title;` (dtd: `cuemol2.dtd`)
- `&menu_help.label;`, `&menu_help.accesskey;` (dtd: `cuemol2.dtd`)
- `&help_about.label;`, `&help_about.accesskey;` (dtd: `cuemol2.dtd`)
- `&help_aboutCmdMac.label;` (dtd: `cuemol2.dtd`, macOS only via `#ifdef`)

#### Notes
- macOS で "アプリケーションメニュー" の About 項目を提供するための非表示バックグラウンドウィンドウ (1×1px)
- `windowtype="cuemol2-hiddenwnd"` で識別される
- `#ifdef XP_MACOSX` を含むためプリプロセッサが必要

---

### `other.mybrowser`

- **File**: `uxp_gui/cuemol2/base/content/tools/mybrowser.xul`
- **Root element**: `<window>`
- **Title**: "CueMol2 Web Browser" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/tools/mybrowser.xul`
- **Associated JS**: `mybrowser.js`
- **Overlays applied**: none

#### User-visible features
- Back / Forward / Reload / Stop ナビゲーションボタン
- URLバー (`<textbox id="urlbar">`)
- Go ボタン
- ブラウザコンポーネント (`<browser id="browser" type="content-primary">`)
- ステータスバー (status ラベル、プログレスメーター、security パネル)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| Back button `oncommand` | `back()` | ブラウザ履歴を戻る |
| Forward button `oncommand` | `forward()` | ブラウザ履歴を進む |
| Reload button `oncommand` | `reload()` | ページをリロード |
| Stop button `oncommand` | `stop()` | 読み込みを中止 |
| URL bar `onchange` | `go()` | 入力URLへナビゲート |
| Go button `oncommand` | `go()` | 入力URLへナビゲート |

#### i18n keys used
- (none — すべてのラベルは英語でハードコード)

#### Notes
- `windowtype="CueMol2:WebBrowser"` で識別される組み込みブラウザウィンドウ
- `back()`, `forward()`, `reload()`, `stop()`, `go()` の実装は `mybrowser.js` に存在する

---

### `other.config-dialog`

- **File**: `uxp_gui/cuemol2/base/content/config-dialog.xul`
- **Root element**: `<prefwindow>`
- **Title**: "Options" (hardcoded)
- **Chrome URL**: `chrome://cuemol2/content/config-dialog.xul`
- **Associated JS**: `cuemol2-utils.js`
- **Overlays applied**: none

#### User-visible features
- Misc 設定ペイン (`pane-misc`)
- Key (キーバインド) 設定ペイン (`pane-keybinding`)
- Mouse (マウス設定) ペイン (`pane-mouseconf`)
- Accept / Cancel ボタン
- 各ペインのラジオアイコン (PNG: `config_tabimg_misc.png`)

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| (none in this file) | — | — |

#### i18n keys used
- (none — タイトル "Options" はハードコード; 各子ペインのi18nはそれぞれのオーバーレイXUL内)

#### Notes
- 各ペインは `<prefpane src="...">` で `config-misc.xul`, `config-keybind.xul`, `config-mouse.xul` をロードする
- DOCTYPEで `config-dialog.dtd` を参照するが、このファイル内では直接使用していない
- `windowtype="CueMol2:Config"` で識別される

---

## Unresolved

(なし)

## Statistics

- Total entries: 4
- With JS handler: 3
- With i18n keys: 2
- Unresolved: 0
