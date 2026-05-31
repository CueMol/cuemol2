# React-GUI UI Style Guide (UI/UX 規約の単一ソース)

このガイドが **tritium/react-gui の UI/UX・CSS・コンポーネント規約の単一ソース**。`CLAUDE.md` 等は要点とこのファイルへのリンクだけを持つ — UI/UX に関する記述を他所に分散させない (新しい規約はここに追記する)。UXP→tritium 移植や新規UI追加のたびに参照し、場当たり的なハードコード・サイズの作り直しを防ぐこと。

UIスタイルは **デザイントークン** (CSS custom properties) に一元化されている。トークンは全て `tritium/react-gui/src/renderer/styles/_variables.css` に定義され、dark がデフォルト (`:root`)、light は `:root[data-theme="light"]` で上書きされる。

**まず §0 (form-kit カタログ) を読むこと** — label+control の UI は必ずカタログで組み、サイズを選ばない。これが「コンポーネント追加のたびにサイズがおかしくなる」のを防ぐ最重要規約。

> **原則1 (生値を書かない)**: 生の値 (hex / px / pt / em) を直接書かない。必ずトークン経由で参照する。新しい値が要るときは、まず `_variables.css` にトークンを足してから参照する (1コンポーネントに直書きしない)。命名は why-based (`--text-error` 系。`--text-red` のような値ベース名を新設しない)。
>
> **原則2 (意味で選ぶ / MOST IMPORTANT)**: テキストやサイズは「目的の見た目 (11px に見せたい)」から逆算してトークンを選ばない。**UI 上の役割 (role) で選ぶ**。`--fs-base` を「11px が欲しいから」ではなく「これはフォームの label だから `.type-label`」と決める。これが本来の目的 ── 同じ役割の UI が常に同じ見た目になり統一感が出る。生値を書かないこと自体は手段にすぎない (数字を消すだけで role を無視すると、`size1..6` を px に当てはめるのと同じで無意味)。typography は §意味的 typography role、構造 (行・ヘッダ) は `.panel-header` / `.section-header` / `.list-row` を使う。

---

## 0. 新規UIの組み方 — form-kit カタログ (MUST / まずこれ)

label+control の UI (フォーム行・テキスト入力・select・numeric・switch・color・compact button・ツールバーのボタン/フィルタ入力) は、**必ず `components/widgets/form/` のカタログコンポーネントで組む**。生の Blueprint `Button`/`InputGroup`/`HTMLSelect` を独自 CSS で並べない。

| コンポーネント | 用途 | canonical サイズ (source) |
|---|---|---|
| `Field` | label + control の1行 (stack / `inline`) | 行 padding `--field-row-pad`, label↔control gap `--field-label-gap`, label は `.type-label` |
| `FieldGroup` | Field の縦スタック / セクション (任意で `title`) | 行間 `--form-row-gap`, section 間 `--form-section-gap` |
| `SectionHeader` | サブセクション見出し | `.section-header` role (高 `--ctrl-h-md`) |
| `TextField` | 単一行テキスト入力 (任意 `leftIcon` = フィルタ/検索) | 高 `--field-h` (22px) |
| `SelectField` | ドロップダウン (`<option>` を children に) | 高 `--field-h` (22px) |
| `NumericField` | 数値 (任意で slider・`unit`) | 入力高 `--field-h-sm` (20px) |
| `SwitchField` | 真偽トグル (`inline` Field 内で使う) | Blueprint Switch |
| `ColorField` | 色 (`CueColorField` の薄いラッパ) | - |
| `ButtonRow` / `FormButton` | コンパクトボタンの行 / ボタン | 高 `--field-btn-h`, ラベル `--fs-base` |

**なぜカタログか (最重要)**: トークン (`--space-*` / `--ctrl-h-*`) は「どの値か」を統一するが、**値を選ぶ行為自体がサイズ選び**になり強制力にならない (typography の `.type-*` role がテキストで解決したのと同じ問題が、コントロール高・行・余白の軸に残っていた)。カタログコンポーネントは **size props を公開しない** ので、**同じコンポーネントを使えば必ず同じサイズ**になる。これが「コンポーネント追加のたびにサイズがおかしくなる」再発を仕組みで防ぐ唯一の方法。

**ルール**:
- コントロール高・行高・label gap・section spacing を **consumer の CSS や inline `style` で指定しない**。サイズの単一ソースは `styles/_form-kit.css` ＋ `_variables.css` の `--field-*` / `--form-*` トークンのみ。
- 必要なコントロールがカタログに無ければ、**先にカタログへ 1 つ追加** (`_form-kit.css` にサイズを 1 定義) してから使う。consumer 側でサイズを決めない。
- サイズを変えたい時は **トークンか `_form-kit.css`** を 1 箇所編集する。consumer の CSS は触らない。
- フォーカスリング等の見た目もカタログ (`.fk-*`) が所有する。生 Blueprint コントロールを使うと大きいフォーカス枠や caret ズレが出る — `.fk-select`/`.fk-input` を付けて単一ソースを再利用する。
- dense な専用 widget (例: `SelectionBuilder`) で component 化が難しい箇所のみ、**スコープした CSS から `--field-*` トークンと `.fk-*` クラスを参照** する (生 px 禁止)。
- `_form-kit.css` は lint の `ignoreFiles` (`_variables.css` と同じく primitive 置き場)。サイズ一貫性は lint ではなくカタログ component が担保する。

### 既存UIの対応 (インベントリ → canonical)

| 論理コンポーネント | 旧・分裂実装 | canonical |
|---|---|---|
| labeled 行 | `.insp-prop-row` / `.selection-row` / `.snf-row` / `.config-setting` | `Field` |
| text input | `.insp-input`(22) / dialog `.bp5-input`(26) | `TextField` (22) |
| select | `.insp-select`(22) / `.selection-mol-select`(28) | `SelectField` (22) |
| numeric | `.insp-numeric-input`(20) / `.snf-number`(20) | `NumericField` (20) |
| switch | `.insp-switch` | `SwitchField` |
| compact button | 20/22/24/26px がファイル毎 | `FormButton` (`--field-btn-h`) |

**済**: form-kit、Inspector `PropEditors`、`ObjectSelect`、`SelectionPane`/`SelectionBuilder`、`MolSelList`、`LogPanel`/`RenderPanel` ツールバー、catalog gallery (`DummyPane3` = activity bar の Component Catalog)。**残 (新規変更時にカタログへ寄せる)**: `GenericTab`/`RenderSettingsEditor` の直接 `.insp-*`、`SettingRow`(`.config-setting`)、`SliderNumericField`(`.snf-*`)、`_dialog.css` の 26px 入力 (高さは `--field-*` トークンに揃え済み)。

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
| `.type-eyebrow` | 大文字セクション見出し (panel/section header, selection-label 等)。uppercase + `--ls-wide` 込み | 11 / 1 / semibold |
| `.type-label` | フォーム/コントロールの label | 11 / 1 / medium |
| `.type-row` | リスト・ツリー行のテキスト (tree node, named-color row, menu item) | 12 / 1.3 / normal |
| `.type-body` | 説明文・注記・ヒント・空状態・inline エラー | 12 / 1.4 / normal |
| `.type-caption` | 控えめな meta / 補足 | 10.5 / 1 / normal |
| `.type-mono` | コード / コンソール / selection 式。`--font-mono` 込み | 12 / 1.4 / normal |
| `.type-hero` | 空状態 / スプラッシュの大見出し | 20 / 1 / normal |

**どの role を当てるか (決定木)**:
1. それは **見出し**か? → dialog/主見出し=`title`、二次=`subtitle`、パネル/セクションの大文字バー=`eyebrow`。
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

### 余白・サイズ・角丸 (theme-independent)

| 種別 | トークン | 値 |
|---|---|---|
| spacing (padding/margin/gap) | `--space-0`..`--space-6` | 0 / 2 / 4 / 6 / 8 / 12 / 16 px |
| control 高さ | `--ctrl-h-sm` `--ctrl-h-md` `--ctrl-h-lg` | 20 / 24 / 30 px |
| パネルヘッダー高さ | `--panel-header-h` | 30px (トップレベルのみ) |
| リスト/ツリー行高さ | `--row-h` | 22px (`.list-row` / tree 行) |
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
- [ ] 色はすべて `var(--bg-*|--text-*|--accent*|--border*)` 経由か (生 hex / `Colors.*` / `--pt-*` を使っていないか)
- [ ] 余白・gap は `var(--space-*)` か
- [ ] 高さは `var(--ctrl-h-*)` / `--panel-header-h` / `--row-h` か (新しい高さを直書きしていないか)
- [ ] 角丸は `var(--radius-*)` か
- [ ] **各テキスト要素に意味的 role を当てたか** (`.type-*` クラス。Blueprint 注入要素は `--type-<role>-*` 変数)。生 `--fs-*`/`--lh-*` を直書き・px 逆算で選んでいないか。同じ役割の隣接 UI と同じ role か
- [ ] panel/section header・リスト行は `.panel-header` / `.section-header` / `.list-row` を使い、box を重複定義していないか
- [ ] 既存 role に収まらない場合のみ、コンポーネントに直書きせず `_variables.css` + `_typography.css` に新 role を足したか
- [ ] **dark / light 両テーマで確認したか** (`task run_tritium` 後にテーマ切替)
- [ ] `npm run lint:style` を通したか (ベースライン件数を増やしていないか)
- [ ] 新しく `div` + CSS を書く前に、既存パターン (CLAUDE.md「新規ダイアログの追加パターン」、`SettingsPane`/`SettingRow` の宣言的UI、`components/` の既存コンポーネント) を探したか

---

## 回帰防止 (lint)

`cd tritium/react-gui && npm run lint:style` (または `cd build_scripts && task lint_tritium_style`)。

- 設定: `tritium/react-gui/.stylelintrc.json`。`color-no-hex` + `declaration-strict-value` (color 系 / padding / margin / gap / font-size / border-radius は `var()` 必須)。
- `_variables.css` と `_form-kit.css` を除外 (トークン/カタログ primitive の置き場)。
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
