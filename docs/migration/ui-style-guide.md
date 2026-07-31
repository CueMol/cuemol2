# React-GUI UI Style Guide (UI/UX 規約の単一ソース)

このガイドが **tritium/react-gui の UI/UX・CSS・コンポーネント規約の単一ソース**。`CLAUDE.md` 等は要点とこのファイルへのリンクだけを持つ — UI/UX に関する記述を他所に分散させない (新しい規約はここに追記する)。UXP→tritium 移植や新規UI追加のたびに参照し、場当たり的なハードコード・サイズの作り直しを防ぐこと。

UIスタイルは **デザイントークン** (CSS custom properties) に一元化されている。トークンは全て `tritium/react-gui/src/renderer/styles/_variables.css` に定義され、dark がデフォルト (`:root`)、light は `:root[data-theme="light"]` で上書きされる。

**まず §0 (form-kit カタログ) を読むこと** — label+control の UI は必ずカタログで組み、サイズを選ばない。これが「コンポーネント追加のたびにサイズがおかしくなる」のを防ぐ最重要規約。

> **原則1 (生値を書かない)**: 生の値 (hex / px / pt / em) を直接書かない。必ずトークン経由で参照する。新しい値が要るときは、まず `_variables.css` にトークンを足してから参照する (1コンポーネントに直書きしない)。命名は why-based (`--text-error` 系。`--text-red` のような値ベース名を新設しない)。
>
> **原則2 (意味で選ぶ / MOST IMPORTANT)**: テキストやサイズは「目的の見た目 (11px に見せたい)」から逆算してトークンを選ばない。**UI 上の役割 (role) で選ぶ**。`--fs-base` を「11px が欲しいから」ではなく「これはフォームの label だから `.type-label`」と決める。これが本来の目的 ── 同じ役割の UI が常に同じ見た目になり統一感が出る。生値を書かないこと自体は手段にすぎない (数字を消すだけで role を無視すると、`size1..6` を px に当てはめるのと同じで無意味)。typography は §意味的 typography role、構造 (行・ヘッダ) は `.panel-header` / `.section-header` / `.h3-list-row` を使う。

---

## 0. 新規UIの組み方 — form-kit カタログ (MUST / まずこれ)

label+control の UI (フォーム行・テキスト入力・select・numeric・switch・color・compact button・ツールバーのボタン/フィルタ入力) は、**必ず `h3-kit/form/` のカタログコンポーネントで組む**。生の Blueprint `Button`/`InputGroup`/`HTMLSelect` を独自 CSS で並べない。

**実装前にカタログを探して再利用する (最優先 / まずこれ)**: UI を書き始める前に、下表と **実物カタログ `components/panes/CatalogPane1/2/3`** を一覧し、欲しい見た目 (参照画像があればそれ) に一致する既存 component を特定してから使う。既存パターンを別 component で自作し直さない。よくある取り違え:
- **ステッパー付き数値ボックス (up/down 矢印)** = `SliderField` (`SliderNumericField`)。`slider={false}` で slider 無しの「数値+ステッパー」だけになる。`NumericField` は**既定でステッパーを隠す**設計なので、ステッパーを足そうとしない。
- **drag で増減する数値** = `DragNumericField` (`NumericField` ではない)。
- **時間 (ms) の入力** = `TimeField` (`DragNumericField` を直接組まない)。
- **2 桁の裸 cell** = `NumberCell`。
真にカタログに無い時のみ、`_form-kit.css` にサイズを 1 定義して**先にカタログへ追加**する。カタログ調査を飛ばして Blueprint 直叩き/独自 CSS で作ると、既存の verified 実装とサイズ・デザインが食い違い手戻りする (このガイドが防ぎたい再発そのもの)。

| コンポーネント | 用途 | canonical サイズ (source) |
|---|---|---|
| `FieldSection` | **pane 内の最上位グループ** (`title` = グループ見出し + 任意の中身) | title は `.type-group-label` role, section 間 gap は親 container の `gap: --form-section-gap` |
| `Field` | label + control の1行 (stack / `inline`) — **下位ラベル** | 行 padding `--field-row-pad`, label↔control gap `--field-label-gap`, label は `.type-label` |
| `FieldGroup` | Field の縦スタック / セクション (任意で `title` → 重い `SectionHeader` バー) | 行間 `--form-row-gap`, section 間 `--form-section-gap` |
| `SectionHeader` | サブセクション見出し**バー** (背景tint+下線, 大文字) | `.section-header` role (高 `--ctrl-h-md`) |
| `TextField` | 単一行テキスト入力 (任意 `leftIcon` = フィルタ/検索) | 高 `--field-h` (22px) |
| `SelectField` | ドロップダウン (`<option>` を children に) | 高 `--field-h` (22px) |
| `NumericField` | 数値 + 明示 slider (`slider` 既定 true)。**ネイティブ stepper は既定で非表示** (compact 用)。任意で `unit` | 入力高 `--field-h-sm` (20px) |
| `SliderField` (`SliderNumericField`) | label + slider + 数値 + **custom ステッパー (up/down)** + 任意 `unit`。**ステッパー付き数値ボックスはこれ**。`slider={false}` で slider 無しの数値+ステッパーだけにできる (count/stride 等) | `.h3-form-sliderfield*` (`_form-kit.css`) |
| `DragNumericField` | 数値 (Blender風 drag number button)。**UXP の numslider の移植先**。renderer property 等のドラッグ可能な数値はこれを使う (`NumericField` ではない)。`format`/`parse`/`resolveStep`/`stepper="stacked"` で非10進の値にも転用できる (下記 `TimeField`) | サイズは `.h3-form-drag*` (`_form-kit.css`) |
| `TimeField` | 時間 (ms) の timecode `M:SS.mmm`。**UXP の timeedit の移植先**。`DragNumericField` プリセットで drag scrub + ▲▼ spin + 打ち込み (`250ms` / `1.5s` / `+2s` の相対も可) | `.h3-form-drag` + `.h3-form-time` (`_form-kit.css`) |
| `SwitchField` | **真偽トグル** (on/off。`inline` Field 内で使う) | Blueprint Switch |
| `RadioField` | **設定としての二者択一/N択** (名前の付いた選択肢を並べて 1 つ選ぶ)。横並び + 幅が足りなければ自動で折返し (向きは選ばない) | ラベル `--fs-lg`, 間隔 `--space-5` (`.h3-form-radio-group`) |
| `ColorField` | 色 (`CueColorField` の薄いラッパ) | - |
| `ButtonRow` / `FormButton` | コンパクトボタンの行 / ボタン | 高 `--field-btn-h`, ラベル `--fs-base` |
| `SegmentField` | **view/モード切替** (`Named\|History`, pane 上部の tab strip)。**設定行には使わない** — pane 内だとタブがもう 1 段あるように読める | 高 `--field-btn-h`, ラベル `--fs-base` (= `FormButton` と同一, `.h3-form-segmented`) |

**「1 つ選ぶ」系の使い分け**: `SegmentField` = **view の切替** (`.mode-bar` に置く tab strip)、`RadioField` = **設定の N 択** (選択肢に名前があり、並べて見せたい)、`SelectField` = 選択肢が多い / 一覧を畳みたいとき、`SwitchField` = 本当に on/off の真偽値。二値だからといって `SwitchField` を選ぶと「どちらか選ぶ」ではなく「有効/無効」に読まれる。

**なぜカタログか (最重要)**: トークン (`--space-*` / `--ctrl-h-*`) は「どの値か」を統一するが、**値を選ぶ行為自体がサイズ選び**になり強制力にならない (typography の `.type-*` role がテキストで解決したのと同じ問題が、コントロール高・行・余白の軸に残っていた)。カタログコンポーネントは **size props を公開しない** ので、**同じコンポーネントを使えば必ず同じサイズ**になる。これが「コンポーネント追加のたびにサイズがおかしくなる」再発を仕組みで防ぐ唯一の方法。

**ラベルの階層 (これも component で強制 / 微調整しない)**: pane 内のラベルは2階層。**最上位グループ** (例: `Molecule` / `Selection` / `Term` / `Modify`) は **`FieldSection` の `title`** で出す → `.type-group-label` role (頭文字のみ大文字・semibold・`--ls-wide`)。**下位ラベル** (section 内の行ラベル, 例: `Dist` / `Apply`) は `Field` の label か `.type-label`。section 間の余白は **親 container に `gap: var(--form-section-gap)` を 1 回指定**するだけ (FieldSection 自身は margin を持たない) → 全グループが同一リズムになり、weight/大文字/letter-spacing/spacing を **consumer 側で個別調整しない**。「最上位かそうでないか」は `FieldSection` か `Field` かの**選択だけ**で決まる。

**ルール**:
- コントロール高・行高・label gap・section spacing を **consumer の CSS や inline `style` で指定しない**。サイズの単一ソースは `styles/_form-kit.css` ＋ `_variables.css` の `--field-*` / `--form-*` トークンのみ。
- 必要なコントロールがカタログに無ければ、**先にカタログへ 1 つ追加** (`_form-kit.css` にサイズを 1 定義) してから使う。consumer 側でサイズを決めない。
- サイズを変えたい時は **トークンか `_form-kit.css`** を 1 箇所編集する。consumer の CSS は触らない。
- フォーカスリング等の見た目もカタログ (`.h3-form-*`) が所有する。生 Blueprint コントロールを使うと大きいフォーカス枠や caret ズレが出る — `.h3-form-select`/`.h3-form-input` を付けて単一ソースを再利用する。
- dense な専用 widget (例: `SelectionBuilder`) で component 化が難しい箇所のみ、**スコープした CSS から `--field-*` トークンと `.h3-form-*` クラスを参照** する (生 px 禁止)。
- `_form-kit.css` は lint の `ignoreFiles` (`_variables.css` と同じく primitive 置き場)。サイズ一貫性は lint ではなくカタログ component が担保する。

### 既存UIの対応 (インベントリ → canonical)

| 論理コンポーネント | 旧・分裂実装 | canonical |
|---|---|---|
| labeled 行 | `.insp-prop-row` / `.selection-row` / `.h3-slider-row` / `.config-setting` | `Field` |
| text input | `.insp-input`(22) / dialog `.bp5-input`(26) | `TextField` (22) |
| select | `.insp-select`(22) / `.selection-mol-select`(28) | `SelectField` (22) |
| numeric (stepper / discrete) | `.insp-numeric-input`(20) | `NumericField` (20) |
| numeric (UXP numslider / ドラッグ可能) | `.h3-slider-number`(20) | `DragNumericField` |
| switch | `.insp-switch` | `SwitchField` |
| compact button | 20/22/24/26px がファイル毎 | `FormButton` (`--field-btn-h`) |
| segmented control | `.inspector-mode-bar` の直書き override / 各所の生 `SegmentedControl` | `SegmentField` (`--field-btn-h`, `.h3-form-segmented`) |

**済**: form-kit、Inspector `PropEditors`/モード切替 (`SegmentField`)、`ObjectSelect`、`SelectionPane`/`SelectionBuilder` (最上位グループは `FieldSection`, 下位は `Field`)、`MolSelList` (Named/History 切替も `SegmentField`)、`LogPanel`/`RenderPanel` ツールバー、catalog gallery (`DummyPane3` = activity bar の Component Catalog)。**残 (新規変更時にカタログへ寄せる)**: `RenderSettingsEditor` の直接 `.insp-*`、`SettingRow`(`.config-setting`)、`SliderNumericField`(`.h3-slider-*`)、`_dialog.css` の 26px 入力 (高さは `--field-*` トークンに揃え済み)。

---

## 0.5. listbox (list / tree 行) — list-kit (MUST)

選択可能なリスト・ツリー行 (scene tree, mol struct tree, inspector generic tab, named-color list 等) は、**行高・水平 padding・icon gap・hover/selected を `styles/_list-kit.css` の単一ソースに統一**する。行高は `--row-h`(22px)、padding は `--list-row-pad-x`、hover=`--bg-hover`、selected=`--bg-active`+`--accent` (font は `.type-row` role)。**行高や hover/selected を consumer 側で直書きしない**。

listbox はフォームと違い**描画基盤が3種**あり単一コンポーネントに統一できないので、基盤ごとに同じトークンを読む role クラスで揃える:

| 基盤 | 使うもの | 備考 |
|---|---|---|
| flex (自前 React リスト) | `<Listbox>` + `<ListRow selected>` (`h3-kit/list/`) | size props 無し。`.h3-list-row .type-row` を出す |
| HTML `<table>` | `.h3-list-table` + `<tr class="h3-list-table-row">`、選択は `.is-selected` | 行高/hover/selected を list-kit が供給。zebra・セル境界等は consumer 固有 (例: `.insp-gt-row`) |
| Blueprint `<Tree>` | Tree の `className` に **`h3-listbox-tree`** を足す | Blueprint 注入要素 (`.bp5-tree-node-content`) に list-kit がトークンを当てる。indent は Blueprint の depth padding に委ねる (`.bp5-tree-node-content` の `padding-left` を直接上書きしない) |

**例外**: color swatch テーブル (`_color-panel.css`) は、色見本セル上で背景ハイライトが読めないため hover/selected を **outline 方式**で残す (SoT 公認の例外)。

`_list-kit.css` は lint `ignoreFiles` (トークン/role primitive の置き場)。行の見栄え統一は list-kit が担保する。

---

## 0.6. メニュー — menu-kit / MenuPanel (MUST)

アプリの**全メニュー面**(Windows/Linux のメニューバー drop-down、3D view の右クリック、scene tree の右クリック、テキスト欄の clipboard メニュー)は、**単一の描画部品 `components/menu/MenuPanel.tsx` + `styles/_menu-kit.css`** で描く。メニューごとに独自の row/CSS を書かない。VS Code 風の見た目(チェック gutter → ラベル → 右寄せ accelerator/chevron、行高 `--ctrl-h-md`)で、色は全てテーマトークン(`--bg-elevated`/`--bg-active`/`--border`/`--text-*`)、行テキストは `.type-row` role。

**データは platform 中立の `MenuNode<T>` に統一** (`shared/menuNodes.ts`)。1 つのテンプレートビルダーが両経路を賄う:

| 経路 | 描画 | 実装 |
|---|---|---|
| Windows / Linux | React `MenuPanel`(menu-kit) | drop-down は `MenuBar` + `resolveAppMenu`、右クリックは `ContextMenuProvider` の `useShowContextMenu()` |
| macOS | ネイティブ Electron menu | main の `menuNodeAdapter.ts` (`toElectronTemplate`) が同じ `MenuNode` を変換。**macOS の外見は従来のネイティブのまま**変えない |

- **`MenuNode<T>` は action を値で持つ** (`action?: T`)。Electron の `click` closure をテンプレートに埋めない → 同じ node を React 描画にもネイティブ変換にも使える。leaf の action は `MenuPanel` の `onPick` / native の `click` で解決。
- 右クリックメニューの追加は **`shared/**CtxMenu.ts` に純粋ビルダーを 1 つ**書き、renderer 側フックで `window.electronAPI.platform === 'darwin'` 分岐(darwin=既存 IPC のネイティブ popup、それ以外=`useShowContextMenu(nodes, {x,y})`)。main 側は `toElectronTemplate` で受ける。
- メニューの見た目を変えたいときは **`_menu-kit.css` か `MenuPanel`** を 1 箇所編集する(consumer 側の CSS を足さない)。`_menubar.css` はバー本体と drop-down のアンカー位置だけを持つ。
- チェック gutter は**全行に常時**描く(checkable でない行も空 gutter)→ ラベルの x 位置が native menu 同様に揃う。

---

## 0.7. アイコン — AppIcon (MUST)

アイコンは **`components/AppIcon.tsx` の `<AppIcon name="..." size="sm|md|lg" />` 経由で描く**。consumer 側で
`@blueprintjs/core` の `<Icon>` や Phosphor コンポーネントを直接 import したり、`size={18}` のような px を直書き
したりしない。

- **どのライブラリを使うかは `data/appIcons.ts` の1箇所で決める**。Blueprint(`@blueprintjs/icons`)と Phosphor
  (`@phosphor-icons/react`)が共存し、各意味キー(例 `tool.lasso`)を Phosphor か Blueprint のどちらで描くかを
  レジストリ `APP_ICONS` が集中管理する。新しいアイコンは **まずキーをレジストリに足してから** `<AppIcon>` で使う。
  分子ツール等の domain 固有アイコンは Phosphor を優先、既存で十分なものは Blueprint エントリのまま。
- **サイズはトークン**: `sm=12 / md=14 / lg=18`(`AppIcon` の `SIZE_PX`、CSS の `--icon-sm/md/lg` と一致)。
  consumer は `size="sm|md|lg"` を渡す(px 直書き禁止、必要時のみ明示 px)。
- **色は currentColor 継承**(dark/light 自動)。アイコンに固定色を当てない。Phosphor の既定 weight は
  `regular`(一般ボタン)。activity bar など目立たせる領域は consumer 側で `weight="bold"` を渡す。個別の太さは
  `<AppIcon weight=...>` か `appIcons.ts` の spec の `weight` で上書き可。色は root の `IconContext`(`App.tsx`)で
  `currentColor`。
- **データ駆動アイコンはキー(`AppIconKey`)を持たせる**: tree node / tab / settings カテゴリ / animation track
  などデータ構造に icon を持たせる箇所は、Blueprint の `IconName` 文字列ではなく `AppIconKey`(`data/appIcons.ts`
  の `node.*` / `file.*` / `settings.*` / `track.*` 等)を格納する。描画は `<AppIcon name={node.icon} />`。
  Blueprint の `Tree` の `TreeNodeInfo.icon` や `MenuItem` の `icon` は JSX 要素(MaybeElement)を受けるので、
  `icon: <AppIcon name="..." aria-hidden />` をそのまま渡せる。アイコン列の空きスペーサが要る箇所(placeholder
  行・未チェックの radio)は 16px の空 `<span>` を使う。
- Blueprint コンポーネント内蔵アイコン(input clear 等、CSS フォント由来)はそのまま。段階移行のため、まだ
  `AppIcon` 化していない箇所で `<Icon>` 直書きが残るのは許容(移行時にキーを足して寄せる)。

---

## トークン一覧

### 色 (theme-dependent — dark/light 両方で定義)

| 用途 | トークン |
|---|---|
| 背景 | `--bg-base` `--bg-surface` `--bg-elevated` `--bg-panel-header` `--bg-input` `--bg-hover` `--bg-active` `--bg-tab-active` `--bg-tab-inactive` |
| 境界線 | `--border` `--border-subtle` |
| 文字 | `--text-primary` `--text-secondary` `--text-muted` `--text-strong` |
| アクセント | `--accent` `--accent-hover` `--accent-green` `--accent-red` `--accent-yellow` `--accent-glow` `--accent-selected` `--accent-selected-glow` |
| クローム | `--toolbar-bg` `--statusbar-bg` `--statusbar-text` `--scrollbar-thumb` `--scrollbar-thumb-hover` |
| オーバーレイ | `--overlay-hover` `--overlay-subtle` `--overlay-focus` `--overlay-border-top` |
| スライダー | `--slider-handle` `--slider-handle-hover` `--slider-handle-shadow` |
| ログ | `--log-warn` `--log-error` |

### 色 (theme-independent — 固定値)

| 用途 | トークン | 備考 |
|---|---|---|
| 色スウォッチ上の文字 | `--swatch-text` | 任意の色セル背景上で読めるよう固定ダーク。テーマ非依存 |

### タイポグラフィ (raw primitive ── 直接は使わない)

下の `--fs-*` / `--lh-*` / `--fw-*` は **role の裏方 (raw primitive)**。component CSS から直接参照せず、意味的 role (次節) 経由で使う。新しいテキストを書くときに「何 px が欲しいか」でこの表から選ぶのは原則2 違反。

| 種別 | トークン |
|---|---|
| font-family | `--font-ui` `--font-mono` |
| font-size | `--fs-xs`(9) `--fs-sm`(10) `--fs-sm2`(10.5) `--fs-base`(11) `--fs-md`(11.5) `--fs-lg`(12) `--fs-xl`(13) `--fs-2xl`(14) `--fs-icon`(18) `--fs-hero`(20) `--fs-display`(48) |
| font-weight | `--fw-normal`(400) `--fw-medium`(500) `--fw-semibold`(600) |
| line-height | `--lh-tight`(1) `--lh-snug`(1.3) `--lh-normal`(1.4) `--lh-relaxed`(1.5) |
| letter-spacing | `--ls-tight` `--ls-normal` `--ls-wide` `--ls-wider` `--ls-widest` `--ls-spaced` |

`--fs-*` は `calc(<base>px * var(--ui-scale))` で定義。`--ui-scale` (default 1) は将来の「文字大きめ」設定用フックで、現状どのUIにも未接続。**全フォントサイズを `--fs-*` 経由 (= role 経由) にしておくことで、将来 `--ui-scale` を設定するだけで一括スケールできる** (代替として Electron `webFrame.setZoomLevel` でUI全体ズームも可能 — VSCode 方式)。

### 意味的 typography role (これを使う)

各 role は font-size / line-height / font-weight (+一部 transform / letter-spacing) の束を、**1つの UI コンテキスト**に対して定義したもの。値は `_variables.css` の `--type-<role>-fs|-lh|-fw` に、適用用クラスは `_typography.css` の `.type-<role>` にある。**テキストには必ずいずれかの role を当てる。**

| role (class) | 用途 | 実値 (現状) |
|---|---|---|
| `.type-title` | dialog タイトル / 主見出し | 14 / 1.3 / semibold |
| `.type-subtitle` | 二次見出し | 13 / 1.3 / semibold |
| `.type-panel-title` | `.panel-header` に出るパネル名 / 検査対象名 (Inspector, Render Settings)。**大文字化しない** (見出しではなく内容) | 12 / 1.3 / semibold |
| `.type-eyebrow` | 大文字セクション見出し (panel/section header, selection-label 等)。uppercase + `--ls-wide` 込み | 11 / 1 / semibold |
| `.type-label` | フォーム/コントロールの label | 11 / 1 / medium |
| `.type-row` | リスト・ツリー行のテキスト (tree node, named-color row, menu item) | 12 / 1.3 / normal |
| `.type-body` | 説明文・注記・ヒント・空状態・inline エラー | 12 / 1.4 / normal |
| `.type-caption` | 控えめな meta / 補足 | 10.5 / 1 / normal |
| `.type-mono` | コード / コンソール / selection 式。`--font-mono` 込み | 12 / 1.4 / normal |
| `.type-hero` | 空状態 / スプラッシュの大見出し | 20 / 1 / normal |

**どの role を当てるか (決定木)**:
1. それは **見出し**か? → dialog/主見出し=`title`、二次=`subtitle`、パネル/セクションの大文字バー=`eyebrow`、`.panel-header` に出すパネル名/対象名=`panel-title`。
2. **コントロールの名札** (1〜数語、操作対象を指す)か? → `label`。
3. **リストやツリーの並んだ項目**のテキストか? → `row`。
4. **文章・説明・メッセージ** (空状態やエラーを含む)か? → `body`。
5. **等幅** (式・コード・コンソール)か? → `mono`。
6. 上のどれかの脇に出る**控えめな補足**か? → `caption`。

**使い方**:
```tsx
// 自前で描画する要素 → クラスを貼る (component CSS に font-size を書かない)
<span className="cp-named-name type-row">{name}</span>
```
```css
/* Blueprint が描画する要素 → role トークンを参照 (クラスを貼れないため) */
.scene-tree .bp5-tree-node-content { font-size: var(--type-row-fs); line-height: var(--type-row-lh); }
```

新しい役割が本当に必要なら (既存 role に収まらない)、まず `_variables.css` に `--type-<role>-*` を、`_typography.css` に `.type-<role>` を足してから使う。コンポーネントに `font-size: var(--fs-…)` を直書きしない。

### 構造 role (パネルの外枠)

typography と同じ考え方で、**パネルの箱も role で決める**。高さ・chrome・border は下表のクラスが持ち、consumer 側の CSS は padding など「その pane 固有の分」だけを足す。箱の宣言を各 pane に書き写すと、片方だけ直したときに必ず drift する (Rendering window の設定 pane が main window の Inspector とズレていたのがこの例)。

| role (class) | 用途 | 持っているもの |
|---|---|---|
| `.panel-header` | トップレベル pane のタイトルバー (Explorer / Inspector / Render Settings / Log) | 高 `--panel-header-h` (30px), `--toolbar-bg`, 下 border |
| `.panel-header-icon` | 上記の先頭 icon | accent 色, `flex-shrink: 0` |
| `.panel-header-name` | 上記のタイトル文字 (`.type-panel-title` と組で使う) | `--text-primary`, ellipsis |
| `.mode-bar` | `.panel-header` 直下のモード/タブ切替ストリップ (Inspector の Properties/Generic, Rendering window の Image/Render) | strip の chrome + padding。中身は form-kit `SegmentField` |
| `.section-header` | pane 内のサブセクション見出しバー | 高 `--ctrl-h-md` (24px), `--bg-panel-header`, 下 border |
| `.h3-list-row` | リスト/ツリー行 | 高 `--row-h` (22px) — `_list-kit.css` |

### 余白・サイズ・角丸 (theme-independent)

| 種別 | トークン | 値 |
|---|---|---|
| spacing (padding/margin/gap) | `--space-0`..`--space-6` | 0 / 2 / 4 / 6 / 8 / 12 / 16 px |
| control 高さ | `--ctrl-h-sm` `--ctrl-h-md` `--ctrl-h-lg` | 20 / 24 / 30 px |
| パネルヘッダー高さ | `--panel-header-h` | 30px (トップレベルのみ) |
| リスト/ツリー行高さ | `--row-h` | 22px (`.h3-list-row` / tree 行) |
| icon | `--icon-sm` `--icon-md` `--icon-lg` | 12 / 14 / 18 px |
| 角丸 | `--radius-sm` `--radius-md` `--radius-lg` | 2 / 3 / 4 px |
| form-kit (§0 カタログ専用) | `--field-h` `--field-h-sm` `--field-label-gap` `--field-row-pad` `--form-row-gap` `--form-section-gap` `--field-btn-h` | 22 / 20px ほか。**`_form-kit.css` だけが参照**。consumer は直接使わずカタログ component を使う |

既定値: panel header (Explorer / Inspector / Settings / Log のタイトルバー) = `--panel-header-h` (30px)。パネル内の sub-section header は意図的に小さく `--ctrl-h-md` (24px)。icon の既定は `--icon-md` (14px)。

---

## do / don't

```css
/* DON'T */                          /* DO */
color: #c9cdd6;                       color: var(--text-primary);
color: var(--pt-text-color-muted);    color: var(--text-secondary);
background: black; /* UIクローム */   background: var(--bg-base);
padding: 8px 10px;                    padding: var(--space-4) var(--space-4);
gap: 6px;                             gap: var(--space-3);
min-height: 22px;                     min-height: var(--ctrl-h-sm);
border-radius: 3px;                   border-radius: var(--radius-md);
font-size: var(--fs-lg); /* px逆算 */ <span className="type-row">  /* role を貼る */
line-height: var(--lh-snug);          /* (.type-row が fs/lh/fw を供給) */
```

「リスト行に見せたいから 12px の `--fs-lg`」と選ぶのが DON'T。「これはリスト行 = `type-row`」と役割で選ぶのが DO。結果同じ 12px でも、後者は全リスト行が常に一致する。

```tsx
// DON'T
import { Colors } from '@blueprintjs/core'
color: isDark ? Colors.BLUE5 : Colors.BLUE3
// DO  (--accent は data-theme で自動追従するので分岐不要)
color: 'var(--accent)'
```

許容される例外 (新規で増やさないこと):
- `crash/CrashOverlay.tsx` `crash/mountFallbackDom.ts` — React/テーマ崩壊時のフォールバックでトークンにアクセスできない。
- `ColorPane` / `DensityMapPane` の `NAMED_COLORS`、worker services の分子色 (`setupDensityMapRenderers` 等)、`data/rendererProperties.ts` の color 値 — UIスタイルではなく分子レンダリングの色データ。
- `--swatch-text` のようなテーマ非依存の固定コントラスト色 (定義は `_variables.css`)。
- 1px (ヘアライン)・50% (円形 radius) は `_variables.css` 外でも許容 (stylelint の ignoreValues)。

---

## 移植UIチェックリスト

UXP機能を tritium に起こす / 新規コンポーネントを追加するときに確認:

- [ ] **label+control の UI は §0 の form-kit カタログ (`Field`/`TextField`/`SelectField`/…) で組んだか** (生 Blueprint コントロール＋独自サイズ CSS を書いていないか)。コントロール高・行高・label gap・section spacing を consumer 側で指定していないか。無い部品は先にカタログへ追加したか
- [ ] **list / tree 行は §0.5 の list-kit で揃えたか** (flex=`<ListRow>`、table=`.h3-list-table-row`+`.is-selected`、Blueprint Tree=`h3-listbox-tree` クラス)。行高・hover/selected を直書きしていないか
- [ ] 色はすべて `var(--bg-*|--text-*|--accent*|--border*)` 経由か (生 hex / `Colors.*` / `--pt-*` を使っていないか)
- [ ] 余白・gap は `var(--space-*)` か
- [ ] 高さは `var(--ctrl-h-*)` / `--panel-header-h` / `--row-h` か (新しい高さを直書きしていないか)
- [ ] 角丸は `var(--radius-*)` か
- [ ] **各テキスト要素に意味的 role を当てたか** (`.type-*` クラス。Blueprint 注入要素は `--type-<role>-*` 変数)。生 `--fs-*`/`--lh-*` を直書き・px 逆算で選んでいないか。同じ役割の隣接 UI と同じ role か
- [ ] panel/section header・タブ strip・リスト行は `.panel-header` (+`-icon`/`-name`) / `.mode-bar` / `.section-header` / `.h3-list-row` を使い、box を重複定義していないか (§構造 role)
- [ ] 既存 role に収まらない場合のみ、コンポーネントに直書きせず `_variables.css` + `_typography.css` に新 role を足したか
- [ ] **dark / light 両テーマで確認したか** (`task run_tritium` 後にテーマ切替)
- [ ] `npm run lint:style` を通したか (ベースライン件数を増やしていないか)
- [ ] 新しく `div` + CSS を書く前に、既存パターン (CLAUDE.md「新規ダイアログの追加パターン」、`SettingsPane`/`SettingRow` の宣言的UI、`components/` の既存コンポーネント) を探したか

---

## 回帰防止 (lint)

`cd tritium/react-gui && npm run lint:style` (または `cd build_scripts && task lint_tritium_style`)。

- 設定: `tritium/react-gui/.stylelintrc.json`。`color-no-hex` + `declaration-strict-value` (color 系 / padding / margin / gap / font-size / border-radius は `var()` 必須)。
- `_variables.css` / `_form-kit.css` / `_list-kit.css` を除外 (トークン/カタログ primitive の置き場)。
- **warn-only** (build はブロックしない)。意図的な例外は `/* stylelint-disable-next-line scale-unlimited/declaration-strict-value -- <理由> */` で明示。

> **lint の限界 (現状) と今後**: `declaration-strict-value` は「`var()` を使っているか」しか見ず、**「role を選んだか / 生 `--fs-*` を px 逆算で使ったか」「`line-height` が生値か」は検出できない** (= 原則2 は lint で守れない。レビューと本ガイドで担保する)。`line-height` を検査対象に追加し、component CSS での生 `--fs-*` 直参照を warn する強化は、未移行ファイル (現状 `font-size: var(--fs-*)` が約 118 箇所、生 `line-height` が数箇所) を role へ一掃した後にまとめて入れる予定 (今入れると警告が殺到しベースライン方針と矛盾するため保留)。

### 既知の残存ベースライン (約21件)

スケールに押し込むのが過剰な**正当な単発/文脈値**。新規追加でこの件数を増やさないこと:
- スライダー stepper の意図的オーバーラップ `margin: -7px`
- macOS traffic-light 確保幅 `padding-right: 140px`
- 空状態パディング `48px` / `24px`、設定コンテンツ `20px`、タブ `7px`
- ステータスバー項目ギャップ `14px`、メニューバーギャップ `32px`
- pill/badge の `border-radius: 8px`、HTMLSelect の chevron clearance `22px`

これらは将来スクリーンショット目視レビュー付きの別パスで、必要なら大型 spacing トークン追加とともに再検討する。
