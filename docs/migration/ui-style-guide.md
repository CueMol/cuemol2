# React-GUI UI Style Guide (design tokens)

tritium/react-gui のUIスタイルは **デザイントークン** (CSS custom properties) に一元化されている。トークンは全て `tritium/react-gui/src/renderer/styles/_variables.css` に定義され、dark がデフォルト (`:root`)、light は `:root[data-theme="light"]` で上書きされる。

このガイドは [`../../CLAUDE.md`](../../CLAUDE.md) の「スタイル・デザイントークン (MUST)」の詳細版。UXP→tritium 移植や新規UI追加のたびに参照し、場当たり的なハードコードを防ぐこと。

> **原則1 (生値を書かない)**: 生の値 (hex / px / pt / em) を直接書かない。必ずトークン経由で参照する。新しい値が要るときは、まず `_variables.css` にトークンを足してから参照する (1コンポーネントに直書きしない)。命名は why-based (`--text-error` 系。`--text-red` のような値ベース名を新設しない)。
>
> **原則2 (意味で選ぶ / MOST IMPORTANT)**: テキストやサイズは「目的の見た目 (11px に見せたい)」から逆算してトークンを選ばない。**UI 上の役割 (role) で選ぶ**。`--fs-base` を「11px が欲しいから」ではなく「これはフォームの label だから `.type-label`」と決める。これが本来の目的 ── 同じ役割の UI が常に同じ見た目になり統一感が出る。生値を書かないこと自体は手段にすぎない (数字を消すだけで role を無視すると、`size1..6` を px に当てはめるのと同じで無意味)。typography は §意味的 typography role、構造 (行・ヘッダ) は `.panel-header` / `.section-header` / `.list-row` を使う。

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
- `_variables.css` のみ除外 (生値の唯一の置き場)。
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
