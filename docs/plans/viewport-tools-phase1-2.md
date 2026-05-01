# Viewport Tool System 実装計画 — Phase 1 & 2

> **Target repository:** `CueMol/cuemol2` — branch `tritium_260412`, subdirectory `tritium/`
> **実行者:** Claude Code
> **前提:** 本ドキュメントを repo ルート（`tritium/`）からコンテキストとして与え、段階ごとに指示する。

---

## 1. このPlanの目的

現行 CueMol2 の Word ribbon 風 toolbar を、modern React app にふさわしい
「**Action と Tool (mode) を分離した 4層構成**」に段階的に置き換えるうちの
**Phase 1 と Phase 2** を実装する。

- **Phase 1:** ツールモードの状態基盤 (`useActiveTool`) と Status Bar の mode indicator
- **Phase 2:** Viewport 上に floating する **Tool Palette** (縦型アイコンパレット) と
  キーボードショートカット

Phase 3 (Tool Options Strip)、Phase 4 (Command Palette)、Phase 5 (Ribbon撤廃・menu整理)
は**本planの対象外**。将来計画としてのみ言及する。

---

## 2. 設計方針 (Why this design)

- **Actions と Tools の物理的分離**: stateless な command (Open/Save/Undo…) は Top Toolbar、
  stateful な mode (Navigate/Select/Measure…) は Viewport 隣接の Palette に置く。
  Blender / Figma / Unity / ChimeraX と揃えた"pro-app convergent pattern"。
- **単一の Source of Truth**: アクティブツールは `useActiveTool` hook が唯一持つ。
  viewport側・palette側・status bar側は全て同じ state を読むだけにする。
- **Keyboard-first**: 単一アルファベットキー (N=Navigate, B=Box select, D=Distance…) で即切替。
  input/textarea にフォーカスがある時は発火しない。
- **現状破壊しない**: 既存 Toolbar / ActivityBar / Allotment / 永続化は**そのまま**。
  新規機能を**加算**するだけで、既存機能に回帰が出ないこと。

---

## 3. 前提条件 (事前確認ステップ)

実装開始前に以下を確認する。想定と異なる場合は作業を中断し、plan を更新してから再開。

### 3.1 リポジトリ状態確認

```bash
# Claude Code first step — run these and verify output
cd tritium
git status                          # clean working tree
git log -1 --oneline                # branch: tritium_260412
cat package.json | grep '"name"'    # expected: cuemol-app (or similar)
pnpm install                        # or npm / yarn — use whatever lockfile is committed
pnpm run dev                        # confirm dev server starts cleanly
pnpm test                           # confirm existing tests pass
```

### 3.2 想定ファイルの存在確認

以下が存在することを `ls` で確認：

| 期待パス | 役割 |
|---|---|
| `src/App.tsx` | layout shell |
| `src/components/Toolbar.tsx` | top action toolbar (現行) |
| `src/components/StatusBar.tsx` | 下部ステータスバー |
| `src/components/ContentArea.tsx` / `ContentPane.tsx` | エディタ領域 |
| `src/hooks/useLayoutPersistence.ts` | 永続化hook |
| `src/types.ts` | 共有型 |
| `src/data/` | データ定義置き場 |
| `src/styles/_variables.css` | theme variables |
| `src/__test__/` | vitest テスト |

**どれか欠けていたら作業中断**し、ユーザーに報告する。

### 3.3 使用技術スタック確認

package.json 記載のバージョンを前提とする：
- React 18 / TypeScript 5.6
- `@blueprintjs/core` v5 / `@blueprintjs/icons` v5
- `allotment` v1.20
- `vitest` v4
- Electron 33 (Phase 1/2 では IPC は触らない)

---

## 4. Phase 1 — Tool State Infrastructure + Status Bar Indicator

### 4.1 成果物サマリ

- ツール定義の型と静的データ
- グローバル active-tool state を管理する hook
- キーボードショートカットの登録・解除
- StatusBar 中央に「現在のツール名」表示

**UI的な変化:** ほぼゼロ。StatusBar に "Navigate (N)" のような表示が 1 項目追加されるだけ。
機能的には `setActiveTool` を呼び出せる土台ができる。

### 4.2 追加ファイル

| パス | 役割 |
|---|---|
| `src/data/viewportTools.ts` | `ToolId`/`ToolDef`/`TOOLS[]` の定義 |
| `src/hooks/useActiveTool.ts` | active tool state + keyboard binding |
| `src/__test__/viewportTools.test.ts` | TOOLS 定義の整合性テスト |
| `src/__test__/useActiveTool.test.ts` | hook の振る舞いテスト (renderHook) |

### 4.3 変更ファイル

| パス | 変更内容 |
|---|---|
| `src/App.tsx` | `useActiveTool()` を呼び、`StatusBar` に `activeTool` を渡す |
| `src/components/StatusBar.tsx` | props に `activeToolLabel`/`activeToolShortcut`/`activeToolIcon` 追加、表示 |
| `src/components/index.ts` | (必要なら) `useActiveTool` を再export |

**Toolbar.tsx は変更しない。** Phase 1 は状態基盤のみ。

### 4.4 テスト

- `viewportTools.test.ts`:
  - 全 `TOOLS` エントリが一意な `id` を持つ
  - 全 `TOOLS` エントリが一意な `shortcut` を持つ (大文字小文字を統一して比較)
  - `category` が `"navigate" | "select" | "measure" | "edit"` のいずれか
- `useActiveTool.test.ts`:
  - 初期値が `"navigate"`
  - `setActiveTool("rectSelect")` が反映される
  - `keydown: "N"` で `navigate` に切替
  - `keydown: "n"` (小文字) でも同じ
  - `keydown: "N"` with `ctrlKey: true` は**無視される** (アクセラレータ衝突防止)
  - 未登録キー (例: `"q"`) は何もしない
  - unmount 後に keydown が発火しても setState が呼ばれない (クリーンアップ確認)

### 4.5 受け入れ条件

- [ ] `pnpm test` が全てパス (既存テストも含めて regression なし)
- [ ] `pnpm run dev` で起動し、StatusBar 中央に "Navigate (N)" が表示される
- [ ] テキストエリアにフォーカスしていない状態で `R` を押すと StatusBar が "Navigate" のまま
- [ ] `B` を押すと "Rect Select" に変わる
- [ ] Log panel の REPL input にフォーカスした状態で `B` を押しても **StatusBar は変わらず、REPL に文字 "B" が入る**
- [ ] `Cmd+R` / `Ctrl+R` 押下でツールは切り替わらない (ブラウザreload等を潰さない)
- [ ] TypeScript ビルドエラー 0、ESLint 警告 0 (既存warningは許容)

### 4.6 実装手順

1. **`src/data/viewportTools.ts` を作成** (§6.1 スケルトン)。
2. **テスト作成** `src/__test__/viewportTools.test.ts`。
3. **`src/hooks/useActiveTool.ts` を作成** (§6.2 スケルトン)。
4. **テスト作成** `src/__test__/useActiveTool.test.ts`。
5. **`StatusBar.tsx` の props を拡張** (§6.3 スケルトン)。
6. **`App.tsx` で hook を呼び StatusBar に渡す** (§6.4)。
7. `pnpm test` / `pnpm run dev` で動作確認。
8. **git commit**: `feat(tool-system): add useActiveTool hook and status bar indicator (Phase 1)`

---

## 5. Phase 2 — Viewport Tool Palette

### 5.1 成果物サマリ

- Viewport 領域の左端に floating で配置される縦型アイコンパレット
- カテゴリ (`navigate`/`select`/`measure`) で grouping + 仕切り線
- `activeTool` を Phase 1 の hook から受け取り、クリックで `setActiveTool`
- Blueprint `Tooltip` でラベル + ショートカットを表示

**注意:** 実際の分子ビューワ (WebGL) はまだ無い。今回は `ContentPane` の非 settings タブ
の**左端に絶対配置でオーバーレイ**する。将来 viewport 専用タブ種別が導入された時点で、
条件分岐のみ差し替えられる設計にする。

### 5.2 追加ファイル

| パス | 役割 |
|---|---|
| `src/components/ViewportToolPalette.tsx` | パレット本体 |
| `src/styles/_viewport-tool-palette.css` | 専用スタイル |
| `src/__test__/ViewportToolPalette.test.tsx` | render + click テスト |

### 5.3 変更ファイル

| パス | 変更内容 |
|---|---|
| `src/components/ContentPane.tsx` | 非-settings タブで `ViewportToolPalette` をオーバーレイ |
| `src/styles/app.css` | `@import "./_viewport-tool-palette.css"` 追加 (または import tree の整合先) |
| `src/components/index.ts` | `ViewportToolPalette` を再export |

**変更してはいけないもの:**
- Allotment 構造
- ActivityBar / SidePanel
- Toolbar (Phase 5 で扱う)
- 永続化スキーマ (Phase 3 で Tool options を加える時に拡張する)

### 5.4 テスト

- 初期 active tool `navigate` なら、`navigate` ボタンが `.active` class を持つ
- 別のボタンをクリックすると `setActiveTool` が呼ばれる
- カテゴリごとの仕切り (`.tool-palette-separator`) が `category` の境界数ぶんある
- Tooltip の content に `label` と shortcut が含まれる (aria-describedbyで辿れる、またはcontent文字列検証)

React Testing Library を使う。既に導入済みでない場合は**Phase 1/2 では導入しない**
(render-only でコンポーネントの snapshot 相当を unit test する)。
既存の `vitest` のみで書ける範囲に留める。RTL の追加が必要なら別 plan で扱う。

### 5.5 受け入れ条件

- [ ] `pnpm run dev` で Welcome タブおよび任意のファイルタブを開いた時、
      ContentPane 左端に縦型パレットが表示される
- [ ] Settings タブを開いた時はパレットが**表示されない**
- [ ] パレットのアイコンをクリックすると、StatusBar 中央の表示がそれに追従する
- [ ] `N` キーを押すと Navigate ボタンが highlight されるし StatusBar も "Navigate"
- [ ] カテゴリ境界に仕切り線が見える (dark/light 両テーマで視認可能)
- [ ] Tooltip hover で `"Rect Select  B"` のようなラベルが出る
- [ ] パレットは content pane の内容をスクロールしても固定位置のままである
- [ ] ウィンドウ幅を狭めてもパレットは clip されずに表示され続ける
  (幅480px以下ではoverlappingを許容。対応は将来plan)
- [ ] 既存の tab drag&drop, inspector open/close, theme switch 全て regression なし

### 5.6 実装手順

1. **`ViewportToolPalette.tsx` を作成** (§6.5 スケルトン)。props で
   `activeTool`/`onSelect` を受ける純粋 presentational component にする。
2. **CSS partial 作成** `src/styles/_viewport-tool-palette.css` (§6.6)。
3. **`ContentPane.tsx` を修正** (§6.7): 非 settings タブ時にパレットをオーバーレイ。
4. **`App.tsx` から activeTool/setActiveTool を ContentPane まで props-drill**。
   `useTabManager`経由の `ContentArea` props に `activeTool`/`onSelectTool` を追加。
5. **テスト作成**。
6. `pnpm run dev` で dark/light 両テーマ・Welcome/File/Settings 各タブで手動確認。
7. **git commit**: `feat(tool-system): add viewport tool palette (Phase 2)`

**重要な props drilling の選択肢:**
- (A) props を `App → ContentArea → ContentPane` に通す (明示的だがboilerplate)
- (B) `useActiveTool` を ContentPane で直接呼ぶ (state が独立してしまうので**禁止**)
- (C) React Context で提供する (きれいだが今回のscopeではoverkill)

→ **(A) を採用**。将来 Context 化する場合は別 plan で扱う。

---

## 6. コードスケルトン

以下は Claude Code が出発点とするためのスケルトン。**プロジェクト既存のヘッダ
コメント規約 (`@file @description @module`) に合わせて整える**こと。

### 6.1 `src/data/viewportTools.ts`

```typescript
/**
 * @file data/viewportTools.ts
 * @description Static definitions for all viewport interaction tools (modes).
 *
 * Tools are grouped by category for visual organization in the palette.
 * Each tool has a single-letter keyboard shortcut for quick activation.
 *
 * @module data/viewportTools
 */

import type { IconName } from "@blueprintjs/icons";

/** Visual grouping category used by the tool palette. */
export type ToolCategory = "navigate" | "select" | "measure" | "edit";

/** All viewport interaction modes. Extend here — nothing else. */
export type ToolId =
  | "navigate"
  | "rectSelect"
  | "lassoSelect"
  | "distance"
  | "angle"
  | "torsion";

export interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: string;
  /** Single-letter keyboard shortcut (compared case-insensitively). */
  shortcut: string;
  category: ToolCategory;
  /** CSS `cursor` value applied to the viewport while this tool is active. */
  cursor: string;
}

export const TOOLS: ToolDef[] = [
  { id: "navigate",   icon: "move",      label: "Translate",   shortcut: "N", category: "navigate", cursor: "move" },
  { id: "rectSelect",  icon: "widget",    label: "Rect Select", shortcut: "B", category: "select",   cursor: "crosshair" },
  { id: "lassoSelect", icon: "draw",      label: "Lasso",       shortcut: "L", category: "select",   cursor: "crosshair" },
  { id: "distance",    icon: "path",      label: "Distance",    shortcut: "D", category: "measure",  cursor: "crosshair" },
  { id: "angle",       icon: "geosearch", label: "Angle",       shortcut: "A", category: "measure",  cursor: "crosshair" },
  { id: "torsion",     icon: "rotate-document", label: "Torsion", shortcut: "T", category: "measure", cursor: "crosshair" },
];

/** Order in which categories appear in the palette (top-to-bottom). */
export const CATEGORY_ORDER: ToolCategory[] = ["navigate", "select", "measure", "edit"];

/** O(1) lookup by ID. */
export const TOOL_BY_ID: Record<ToolId, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t]),
) as Record<ToolId, ToolDef>;
```

### 6.2 `src/hooks/useActiveTool.ts`

```typescript
/**
 * @file hooks/useActiveTool.ts
 * @description Global active-tool state for the 3D viewport.
 *
 * This hook is the single source of truth for which interaction mode
 * (navigate / select / measure / …) is currently active. It must be
 * instantiated once at the App level and the result threaded down to
 * any component that needs to read or mutate the tool state
 * (ViewportToolPalette, StatusBar, viewport mouse handlers).
 *
 * ## Keyboard shortcuts
 *
 * A global `keydown` listener is installed while the hook is mounted.
 * When a plain single letter matches a tool's `shortcut`, that tool is
 * activated. The listener is skipped in three cases:
 *
 *   1. A text input / textarea / select is focused (typing convenience).
 *   2. A contentEditable element is focused.
 *   3. Any modifier key (ctrl / meta / alt) is pressed — avoids
 *      clobbering reload, devtools, and OS-level accelerators.
 *
 * @module hooks/useActiveTool
 */

import { useCallback, useEffect, useState } from "react";
import { TOOLS, TOOL_BY_ID, type ToolId, type ToolDef } from "../data/viewportTools";

export interface UseActiveToolResult {
  activeTool: ToolId;
  activeDef: ToolDef;
  setActiveTool: (id: ToolId) => void;
}

export function useActiveTool(defaultTool: ToolId = "navigate"): UseActiveToolResult {
  const [activeTool, setActiveToolState] = useState<ToolId>(defaultTool);

  const setActiveTool = useCallback((id: ToolId) => {
    setActiveToolState(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when a typable element has focus.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      // Skip when any modifier is held.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const match = TOOLS.find(
        (t) => t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (match) {
        setActiveToolState(match.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return {
    activeTool,
    activeDef: TOOL_BY_ID[activeTool],
    setActiveTool,
  };
}
```

### 6.3 `src/components/StatusBar.tsx` (修正)

新たに 3 つの optional props を追加し、中央セクションに表示する。

```typescript
// Add to imports:
import type { IconName } from "@blueprintjs/icons";

interface StatusBarProps {
  activeFile?: string;
  atomCount: string;
  // ── New (Phase 1) ──
  activeToolLabel?: string;
  activeToolShortcut?: string;
  activeToolIcon?: IconName;
}

// In JSX — inside `.status-center`, before the `activeFile` block:
{activeToolLabel && (
  <span className="status-item status-tool" title="Active viewport tool">
    {activeToolIcon && <Icon icon={activeToolIcon} size={12} />}
    <span>{activeToolLabel}</span>
    {activeToolShortcut && (
      <span className="status-tool-shortcut">({activeToolShortcut})</span>
    )}
  </span>
)}
```

対応する CSS を `src/styles/_status-bar.css` に追加：

```css
.status-tool {
  font-weight: 600;
}
.status-tool-shortcut {
  opacity: 0.6;
  font-weight: 400;
}
```

### 6.4 `src/App.tsx` (統合)

```typescript
// Add to imports:
import { useActiveTool } from "./hooks/useActiveTool";

// Inside App():
const { activeTool, activeDef, setActiveTool } = useActiveTool();

// Update StatusBar invocation:
<StatusBar
  activeFile={activeFile}
  atomCount="13,167"
  activeToolLabel={activeDef.label}
  activeToolShortcut={activeDef.shortcut}
  activeToolIcon={activeDef.icon}
/>
```

Phase 2 では `activeTool` と `setActiveTool` を `ContentArea` にも渡す。

### 6.5 `src/components/ViewportToolPalette.tsx` (Phase 2)

```typescript
/**
 * @file ViewportToolPalette.tsx
 * @description Floating vertical tool palette anchored to the left edge of
 * the 3D viewport area. Each button activates a different interaction
 * mode (navigate, select, measure, …).
 *
 * ## Layout
 *
 * ```
 * ┌──┐
 * │🔄│ ← navigate group
 * │✥ │
 * │🔍│
 * ├──┤ ← separator
 * │▢ │ ← select group
 * │◌ │
 * ├──┤
 * │📏│ ← measure group
 * │∠ │
 * │↺ │
 * └──┘
 * ```
 *
 * @module ViewportToolPalette
 */

import React from "react";
import { Icon, Tooltip } from "@blueprintjs/core";
import {
  TOOLS,
  CATEGORY_ORDER,
  type ToolId,
  type ToolCategory,
} from "../data/viewportTools";

interface Props {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
}

export const ViewportToolPalette: React.FC<Props> = ({ activeTool, onSelect }) => {
  return (
    <div className="viewport-tool-palette" role="toolbar" aria-label="Viewport tools">
      {CATEGORY_ORDER.map((cat, idx) => {
        const tools = TOOLS.filter((t) => t.category === cat);
        if (tools.length === 0) return null;
        return (
          <React.Fragment key={cat}>
            {idx > 0 && <div className="tool-palette-separator" aria-hidden />}
            {tools.map((t) => (
              <Tooltip
                key={t.id}
                placement="right"
                compact
                content={
                  <span>
                    {t.label} <kbd className="tool-shortcut">{t.shortcut}</kbd>
                  </span>
                }
              >
                <button
                  type="button"
                  className={`tool-btn ${activeTool === t.id ? "active" : ""}`}
                  onClick={() => onSelect(t.id)}
                  aria-pressed={activeTool === t.id}
                  aria-label={`${t.label} (${t.shortcut})`}
                >
                  <Icon icon={t.icon} size={18} />
                </button>
              </Tooltip>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
};
```

### 6.6 `src/styles/_viewport-tool-palette.css` (Phase 2)

`_variables.css` で定義済みのテーマ変数のみ使うこと。hardcode色禁止。

```css
/* ─── Viewport Tool Palette ─── */
.viewport-tool-palette {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  user-select: none;
}

.tool-palette-separator {
  height: 1px;
  margin: 4px 2px;
  background: var(--border-subtle);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.tool-btn:hover {
  background: var(--overlay-hover);
  color: var(--text-primary);
}

.tool-btn.active {
  background: var(--bg-active);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.tool-btn.active .bp5-icon {
  color: var(--accent);
}

.tool-shortcut {
  display: inline-block;
  min-width: 1.2em;
  padding: 0 4px;
  margin-left: 4px;
  border: 1px solid var(--border);
  border-radius: 2px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-input);
}
```

### 6.7 `src/components/ContentPane.tsx` (修正)

```typescript
// Add to props:
import { ViewportToolPalette } from "./ViewportToolPalette";
import type { ToolId } from "../data/viewportTools";

interface ContentPaneProps {
  activeTab: TabData | undefined;
  // ── New (Phase 2) ──
  activeTool: ToolId;
  onSelectTool: (id: ToolId) => void;
}

// Inside render:
const showPalette = activeTab?.type !== "settings";

return (
  <div className="content-pane">
    {renderContent()}
    {showPalette && (
      <ViewportToolPalette activeTool={activeTool} onSelect={onSelectTool} />
    )}
  </div>
);
```

`.content-pane` の CSS は `position: relative` である必要がある (overlayの基準)。
既存 `_content-area.css` を確認し、不足していれば追加：

```css
.content-pane {
  position: relative;  /* needed so the absolute-positioned palette anchors here */
  flex: 1;
  overflow: hidden;
}
```

---

## 7. 非目標 (このPhaseでは**やらない**こと)

以下は誘惑されやすいが、**今回は手を出さない**。scope creep を防ぐ。

- Toolbar.tsx の ribbon 化 / 撤廃 (Phase 5)
- Tool Options Strip (contextual options bar) の追加 (Phase 3)
- Command Palette (Cmd+Shift+P) の追加 (Phase 4)
- Active tool の永続化 (electron-store への保存)
- マウスハンドラの strategy pattern 化 (そもそも viewport 実体がまだない)
- React Context への state 昇格 (現状 props drilling で十分)
- RTL / @testing-library/react の新規導入 (既存 vitest のみで書ける範囲に留める)
- 新 icon pack の導入 (Blueprint icons のみ使用)
- Radial menu / quick-favorites / gizmo 系 UI

これらを欲しくなったら**別 plan file を起こす**こと。

---

## 8. リスクと対処

| リスク | 対処 |
|---|---|
| キーボードショートカットが他の UI と衝突する | `"B"` は既存 bindings を grep 確認。なければ OK。`input`/`textarea` focus 時は発火しない実装で大部分は回避。 |
| Tooltip の `kbd` タグが Blueprint の style と干渉 | Tooltip 内の要素は isolated。dark/light 両テーマで手動確認。 |
| パレットが Welcome 画面のアイコンと視覚的に被る | Welcome の `placeholder-icon` は中央、palette は左上なので基本衝突しない。width < 480px は許容外とする (§5.5)。 |
| `useActiveTool` が re-render の度に keydown listener を張り替えている | `useEffect` の依存配列を空にする実装になっているので OK。テストでも確認。 |
| Setting タブに切り替えた時にパレットが残る | `showPalette` が `activeTab?.type !== "settings"` を判定。テストで明示確認。 |
| アイコン選択が直感的でない場合 | 初期セットで動作させ、UX FB を別 issue で受ける。icon差し替えは `viewportTools.ts` 1ファイルで完結。 |

---

## 9. 検証チェックリスト (両 Phase 完了時)

Claude Code は**全項目を実際に確認してから完了報告する**こと。

```
[ ] pnpm install がエラーなく終わる
[ ] pnpm test が全パス (既存 + 新規)
[ ] pnpm run build が型エラーなく完了
[ ] pnpm run dev で Electron ウィンドウが起動する
[ ] Welcome タブ: パレットが表示される / StatusBar に Navigate (N) が見える
[ ] ファイルタブ: パレット表示 / StatusBar に現在のツール
[ ] Settings タブ: パレット非表示 / StatusBar は現在のツールを保持
[ ] キーボード: R / M / Z / B / L / D / A / T がパレット + StatusBar を切替
[ ] REPL input にフォーカス中: B キーは input に挿入され、ツールは変わらない
[ ] Cmd+R / Ctrl+R でツールが切り替わらない
[ ] ダークテーマ ↔ ライトテーマ切替でパレットの色が追従
[ ] tab drag-and-drop, Inspector open/close, sidebar toggle すべて回帰なし
[ ] git log が下記2コミットを含む:
    - feat(tool-system): add useActiveTool hook and status bar indicator (Phase 1)
    - feat(tool-system): add viewport tool palette (Phase 2)
```

---

## 10. コミット戦略

- Phase 1 と Phase 2 は**別コミット**に分ける (revert 容易性のため)。
- 各コミット単独で `pnpm test` と `pnpm run build` がパスすること。
- コミットメッセージは Conventional Commits 形式：
  - `feat(tool-system): add useActiveTool hook and status bar indicator (Phase 1)`
  - `feat(tool-system): add viewport tool palette (Phase 2)`
- ブランチは `tritium_260412` からの派生ブランチ
  `feature/viewport-tool-system-phase1-2` を作って作業、PR で merge 申請する。

---

## 11. 将来 Phase への申し送り (参考情報)

- **Phase 3 (Tool Options Strip)**: `ToolDef` に `OptionsPane?: React.FC` を足し、
  palette の下に contextual options を表示。
- **Phase 4 (Command Palette)**: `TOOLS` を `ACTIONS` と union し、Cmd+Shift+P で
  fuzzy search。既存 `ConfigPane` の search UI が参考になる。
- **Phase 5 (Menu整理)**: `electron/main.ts` の native menu に Tool 切替項目を
  追加。Toolbar.tsx を action-only に整理。

本 plan の `viewportTools.ts` / `useActiveTool.ts` / `StatusBar` 拡張部分は
Phase 3 以降でもそのまま流用する設計になっている。

---

**End of plan.**
