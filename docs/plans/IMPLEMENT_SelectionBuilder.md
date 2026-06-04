# 実装指示: Selection Builder (CueMol selection-syntax 補助 UI)

tritium (React/Blueprint.js 版 CueMol3) の Mol Selection Panel に、selection syntax を知らないユーザーでも選択文を組み立てられる補助 UI を追加する。本書は Claude Code への実装指示書である。

## 0. 前提・規約

- **スタック**: Electron + React + TypeScript + Blueprint.js v5 ()、Vite、CSS 変数ベースのテーマ。
- **コードコメントは英語、本ドキュメント等の markdown は日本語**で記述する。
- 既存の `SelectionPane.tsx` と同じ命名規約・CSS トークン (`var(--accent)`, `var(--bg-input)`, `var(--border)`, `var(--text-secondary)` 等) を踏襲する。新規の派手な装飾は加えない。
- パッチではなく**ファイル単位の完全実装**を優先する。

## 1. 背景と課題

CueMol の selection syntax は強力だが初学者に不透明:

- プロパティ指定子: `chain.A`, `resid.1:10`, `resname.ALA`, `aname.CA`
- 論理演算子: `and` / `or` / `not`、括弧
- 名前付きマクロ: `protein`, `nucleic`, `ligand`, `water`, `helix`, `sheet` など

文法仕様: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/

つまずく点は「使えるプロパティ名」「演算子の書き方」「範囲指定 `:`」の3点。

## 2. 設計方針 (確定事項)

### 2.1 ハイブリッド + 一方向同期

- 既存のテキスト入力欄を残し、右端の caret ボタンから **Popover 型クエリビルダー**を開く。
- **ビルダー → テキスト の一方向のみ**反映 (`insert` / `replace`)。テキスト → ビルダーの逆パースは**実装しない** (任意式の逆変換はコスト・不安定さが見合わないため POC では割り切る)。
- 上級者はテキスト直接編集、初学者はビルダー誘導、を両立。**テキストが唯一の信頼源 (single source of truth)**。

### 2.2 Popover 3 タブ構成

| タブ | 役割 | 主な Blueprint |
|------|------|----------------|
| Builder | プロパティ + 値で term を組み立て、AND/OR/NOT で連結 | `HTMLSelect`, `Suggest`/`InputGroup`, `Tag`, `Button` |
| Macros | 名前付きマクロを適用。hover で定義を read-only 表示 | `Menu`/`MenuItem`, `Callout` |
| History | 過去の式を再適用 | `Menu`/`MenuItem` |

### 2.3 演算子の扱い (確定)

- 演算子は**構造化 term 単位のみ**で扱う。各 term は `joiner` (and/or) と `negate` (not) を持つ。
- VMD 風の**生トークン挿入ボタンは作らない** (逆パース不能な手編集を誘発するため)。

### 2.4 VMD パネルからの取り込み判断

| VMD の要素 | tritium での扱い | 理由 |
|------------|------------------|------|
| Keyword → Value 動的連動 | **採用** (`resolveValues(kind)` で Suggest 連動) | 実在値提示が初学者に有効 |
| Macro definition 表示 | **採用** (Macros タブ hover 時に `Callout` で read-only 展開) | 略記の中身が見え生文法を学べる |
| and/or/not 挿入ボタン | **不採用** | 演算子は term 単位で完結させる方針 |
| 3カラム常時展開 | **不採用** | Popover に畳むため。Keyword は `HTMLSelect`、Value は `Suggest` に集約 |

## 3. 状態の持ち方

- ビルダーの**ドラフト term** はコンポーネント内ローカル。
- **確定済みテキスト**は親 (`SelectionPane`) が保持し `value` / `onEmit` で受け渡す。
- 値補完は `resolveValues(kind)` を親から注入し、ビルダー自身はデータソース非依存に保つ。molecule から実在値を引けるときだけ `Suggest` が候補を出し、無ければ free text。
- 履歴は当面ローカル state。将来 `useSelectionHistory` フック + electron-store でセッション間永続化へ昇格。

## 4. 成果物ファイル

1. `src/components/panes/SelectionBuilder.tsx` — 新規コンポーネント (§6)
2. `src/styles/_selection-builder.css` — スタイル (§7)。`src/styles/_side-panel.css` の import 群か既存の集約 CSS に追加すること。
3. `src/components/panes/SelectionPane.tsx` — 既存ファイルを §8 の通り改修。
4. (任意) `resolveValues` の実データ配線 — §9 参照。

## 5. 受け入れ条件

- [ ] Selection ラベル行の右端に caret ボタンが出る。クリックで Popover が開く。
- [ ] Builder タブ: Keyword 選択で Value 欄が Suggest 補完になる (実在値があれば)。`resid` 選択時のみ範囲 (`:`) の第2入力が出る。Add で term が `Tag` として追加される。
- [ ] term の `Tag` クリックで NOT トグル (赤表示)、× で削除。term 間の `HTMLSelect` で AND/OR 切替。
- [ ] preview 行に合成式がリアルタイム表示される (例: `chain.A and not (resname.HOH)`)。
- [ ] Insert は既存テキストに ` and ` 連結で追記、Replace all は全置換。emit 後 Popover が閉じ term がクリアされる。
- [ ] Macros タブ: hover でマクロ定義が `Callout` に read-only 表示。クリックでマクロ名を replace 適用。
- [ ] History タブ: 過去式クリックで replace 適用。空なら "No history"。
- [ ] テキスト欄を直接手編集しても壊れない (一方向同期なので無影響)。
- [ ] ダーク/ライト両テーマで CSS 変数により破綻しない。

## 6. `SelectionBuilder.tsx` 完全実装

```tsx
/**
 * @file SelectionBuilder.tsx
 * @description Popover-based helper UI for composing CueMol selection-syntax
 * expressions without memorising the grammar.
 *
 * ## Design rationale
 *
 * CueMol selection syntax combines property specifiers (`chain.A`,
 * `resid.1:10`, `resname.ALA`, `aname.CA`), boolean operators
 * (`and` / `or` / `not`), and named macros (`protein`, `helix`, ...).
 *
 * This builder lowers the barrier with a **one-way** model: it writes into
 * the selection text but never parses it back. Power users hand-edit the
 * text freely; novices get a guided path.
 *
 * ### VMD-inspired refinements
 *
 *  - **Keyword -> value autocomplete:** selecting a keyword (property)
 *    populates value suggestions from the active molecule, mirroring VMD's
 *    Keyword/Value column pairing. Values stay free-text when unavailable.
 *  - **Macro definition disclosure:** hovering a macro reveals its expansion
 *    (read-only), so users gradually learn the raw grammar.
 *
 * Operators are handled at the **structured term** level only (each term
 * carries a joiner + optional negation); we intentionally do NOT offer raw
 * token-insertion buttons, keeping composition fully structured.
 *
 * ## State ownership
 *
 * Draft terms are local; the committed selection text is owned by the parent
 * (SelectionPane) via `value` / `onEmit`. Text is the single source of truth.
 *
 * @module SelectionBuilder
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Button,
  Popover,
  Tabs,
  Tab,
  HTMLSelect,
  InputGroup,
  Suggest,
  Tag,
  Menu,
  MenuItem,
  Callout,
  type ItemRenderer,
} from "@blueprintjs/core";

/* --- Grammar metadata --- */

/** A selectable property and how its value is formatted into syntax. */
interface PropertyDef {
  /** Syntax keyword, e.g. "chain". */
  key: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
  /** Whether the value supports a numeric range (`a:b`). */
  rangeable: boolean;
  /**
   * Optional value source for autocomplete. When present the value field
   * suggests real values pulled from the active molecule. Resolved lazily by
   * the parent so the builder stays data-source agnostic.
   */
  valueKind?: "chain" | "resname" | "aname" | "elem";
}

const PROPERTIES: PropertyDef[] = [
  { key: "chain", label: "Chain", rangeable: false, valueKind: "chain" },
  { key: "resid", label: "Residue index", rangeable: true },
  { key: "resname", label: "Residue name", rangeable: false, valueKind: "resname" },
  { key: "aname", label: "Atom name", rangeable: false, valueKind: "aname" },
  { key: "elem", label: "Element", rangeable: false, valueKind: "elem" },
];

/**
 * Named macros plus their grammar expansion. The definition is shown
 * read-only (VMD "Macro definition" idea) so users learn the raw syntax.
 * `null` means an atomic primitive with no further expansion.
 */
interface MacroDef {
  key: string;
  label: string;
  definition: string | null;
}

const MACROS: MacroDef[] = [
  { key: "all", label: "All atoms (*)", definition: null },
  { key: "none", label: "No atoms", definition: null },
  { key: "protein", label: "Protein", definition: null },
  { key: "nucleic", label: "Nucleic acid", definition: null },
  { key: "ligand", label: "Ligand", definition: "not (protein or nucleic or water)" },
  { key: "water", label: "Water", definition: "resname.HOH or resname.WAT" },
  { key: "sugar", label: "Sugar", definition: null },
  { key: "hydrogen", label: "Hydrogen", definition: "elem.H" },
  { key: "helix", label: "Helix", definition: null },
  { key: "sheet", label: "Sheet", definition: null },
  { key: "coil", label: "Coil", definition: "protein and not (helix or sheet)" },
];

type BoolOp = "and" | "or";

/** A single builder term plus the operator that joins it to the next term. */
interface Term {
  id: string;
  /** Rendered selection fragment, e.g. "chain.A" or "resid.1:10". */
  text: string;
  /** Negation applied to this term. */
  negate: boolean;
  /** Operator joining THIS term to the following one (ignored on last). */
  joiner: BoolOp;
}

/* --- Helpers --- */

/** Build a syntax fragment from a property + value(s). */
function makeFragment(
  prop: PropertyDef,
  value: string,
  rangeTo: string
): string {
  const v =
    prop.rangeable && rangeTo.trim() !== ""
      ? `${value.trim()}:${rangeTo.trim()}`
      : value.trim();
  return `${prop.key}.${v}`;
}

/** Join all terms into a single selection expression. */
function composeExpression(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const frag = t.negate ? `not (${t.text})` : t.text;
      const joiner = i < terms.length - 1 ? ` ${t.joiner} ` : "";
      return frag + joiner;
    })
    .join("");
}

/* --- Value autocomplete renderer --- */

const renderSuggestItem: ItemRenderer<string> = (
  item,
  { handleClick, modifiers }
) => {
  if (!modifiers.matchesPredicate) return null;
  return (
    <MenuItem
      key={item}
      text={item}
      active={modifiers.active}
      onClick={handleClick}
      roleStructure="listoption"
    />
  );
};

/* --- Component --- */

export interface SelectionBuilderProps {
  /** Current committed selection text (read-only here). */
  value: string;
  /** Emit a new expression to the parent. */
  onEmit: (next: string, mode: "insert" | "replace") => void;
  /** Recently used expressions, newest first. */
  history?: string[];
  /**
   * Resolve candidate values for a keyword from the active molecule.
   * Returns [] when unavailable; the field still accepts free text.
   */
  resolveValues?: (kind: NonNullable<PropertyDef["valueKind"]>) => string[];
}

export const SelectionBuilder: React.FC<SelectionBuilderProps> = ({
  value,
  onEmit,
  history = [],
  resolveValues,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Builder draft state -- local until emitted.
  const [terms, setTerms] = useState<Term[]>([]);
  const [propKey, setPropKey] = useState(PROPERTIES[0].key);
  const [val, setVal] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // Macro tab: which macro's definition is currently disclosed.
  const [activeMacro, setActiveMacro] = useState<MacroDef | null>(null);

  const activeProp = useMemo(
    () => PROPERTIES.find((p) => p.key === propKey) ?? PROPERTIES[0],
    [propKey]
  );

  const suggestItems = useMemo(
    () =>
      activeProp.valueKind && resolveValues
        ? resolveValues(activeProp.valueKind)
        : [],
    [activeProp, resolveValues]
  );

  /* -- Term manipulation -- */

  const addTerm = useCallback(() => {
    if (val.trim() === "") return;
    const text = makeFragment(activeProp, val, rangeTo);
    setTerms((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, text, negate: false, joiner: "and" },
    ]);
    setVal("");
    setRangeTo("");
  }, [activeProp, val, rangeTo]);

  const removeTerm = useCallback((id: string) => {
    setTerms((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleNegate = useCallback((id: string) => {
    setTerms((prev) =>
      prev.map((t) => (t.id === id ? { ...t, negate: !t.negate } : t))
    );
  }, []);

  const setJoiner = useCallback((id: string, joiner: BoolOp) => {
    setTerms((prev) =>
      prev.map((t) => (t.id === id ? { ...t, joiner } : t))
    );
  }, []);

  /* -- Emit -- */

  const preview = useMemo(() => composeExpression(terms), [terms]);

  const emit = useCallback(
    (mode: "insert" | "replace") => {
      if (preview === "") return;
      onEmit(preview, mode);
      setIsOpen(false);
      setTerms([]);
    },
    [preview, onEmit]
  );

  const emitMacro = useCallback(
    (macroKey: string) => {
      onEmit(macroKey, "replace");
      setIsOpen(false);
    },
    [onEmit]
  );

  const emitHistory = useCallback(
    (expr: string) => {
      onEmit(expr, "replace");
      setIsOpen(false);
    },
    [onEmit]
  );

  /* -- Tab panels -- */

  const builderPanel = (
    <div className="selbuilder-panel">
      <div className="selbuilder-form">
        {/* Keyword picker -- VMD "Keyword" column, condensed to a select. */}
        <HTMLSelect
          value={propKey}
          onChange={(e) => setPropKey(e.target.value)}
          options={PROPERTIES.map((p) => ({ value: p.key, label: p.label }))}
        />
        {/* Value field -- autocompletes from real molecule values when known. */}
        {suggestItems.length > 0 ? (
          <Suggest<string>
            items={suggestItems}
            itemRenderer={renderSuggestItem}
            inputValueRenderer={(s) => s}
            onItemSelect={(s) => setVal(s)}
            query={val}
            onQueryChange={setVal}
            resetOnSelect
            inputProps={{ placeholder: "value" }}
            popoverProps={{ minimal: true }}
          />
        ) : (
          <InputGroup
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="value"
          />
        )}
        {activeProp.rangeable && (
          <>
            <span className="selbuilder-range-sep">:</span>
            <InputGroup
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              placeholder="to (optional)"
            />
          </>
        )}
        <Button icon="plus" intent="primary" onClick={addTerm} text="Add" />
      </div>

      {/* Current terms as removable tags with per-term joiner / negate */}
      <div className="selbuilder-terms">
        {terms.length === 0 && (
          <span className="selbuilder-empty">No terms yet.</span>
        )}
        {terms.map((t, i) => (
          <div key={t.id} className="selbuilder-term-row">
            <Tag
              minimal
              interactive
              intent={t.negate ? "danger" : "none"}
              onClick={() => toggleNegate(t.id)}
              onRemove={() => removeTerm(t.id)}
              title="Click to toggle NOT"
            >
              {t.negate ? "not " : ""}
              {t.text}
            </Tag>
            {i < terms.length - 1 && (
              <HTMLSelect
                minimal
                value={t.joiner}
                onChange={(e) => setJoiner(t.id, e.target.value as BoolOp)}
                options={[
                  { value: "and", label: "AND" },
                  { value: "or", label: "OR" },
                ]}
              />
            )}
          </div>
        ))}
      </div>

      {/* Live preview of the composed expression */}
      <div className="selbuilder-preview">
        <code>{preview || "\u2014"}</code>
      </div>

      <div className="selbuilder-actions">
        <Button text="Replace all" onClick={() => emit("replace")} />
        <Button text="Insert" intent="primary" onClick={() => emit("insert")} />
      </div>
    </div>
  );

  const macrosPanel = (
    <div className="selbuilder-macros">
      <Menu className="selbuilder-menu">
        {MACROS.map((m) => (
          <MenuItem
            key={m.key}
            text={m.label}
            active={activeMacro?.key === m.key}
            onClick={() => emitMacro(m.key)}
            // Disclose the definition on hover without committing.
            onMouseEnter={() => setActiveMacro(m)}
          />
        ))}
      </Menu>
      {/* Macro definition disclosure -- VMD "Macro definition" idea. */}
      {activeMacro && (
        <Callout className="selbuilder-macrodef" compact>
          <div className="selbuilder-macrodef-label">{activeMacro.label}</div>
          <code>{activeMacro.definition ?? "(primitive \u2014 no expansion)"}</code>
        </Callout>
      )}
    </div>
  );

  const historyPanel = (
    <Menu className="selbuilder-menu">
      {history.length === 0 ? (
        <MenuItem disabled text="No history" />
      ) : (
        history.map((h, i) => (
          <MenuItem
            key={i}
            text={h}
            onClick={() => emitHistory(h)}
            className="selbuilder-history-item"
          />
        ))
      )}
    </Menu>
  );

  return (
    <Popover
      isOpen={isOpen}
      onInteraction={(next) => setIsOpen(next)}
      placement="bottom-end"
      content={
        <div className="selbuilder-popover">
          <Tabs id="selbuilder-tabs" defaultSelectedTabId="builder">
            <Tab id="builder" title="Builder" panel={builderPanel} />
            <Tab id="macros" title="Macros" panel={macrosPanel} />
            <Tab id="history" title="History" panel={historyPanel} />
          </Tabs>
        </div>
      }
    >
      <Button
        icon="caret-down"
        minimal
        title="Build selection"
        aria-label="Build selection"
      />
    </Popover>
  );
};
```

## 7. `_selection-builder.css` 完全実装

```css
/* ─── Selection Builder (Popover query helper) ─── */

.selection-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.selbuilder-popover {
  width: 340px;
  padding: 8px;
}

.selbuilder-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
}

.selbuilder-form {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.selbuilder-form .bp5-html-select,
.selbuilder-form .bp5-input-group {
  flex: 1 1 80px;
  min-width: 0;
}

.selbuilder-range-sep {
  color: var(--text-secondary);
  font-weight: 600;
}

.selbuilder-terms {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 24px;
}

.selbuilder-term-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selbuilder-empty {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

.selbuilder-preview {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 6px 8px;
}

.selbuilder-preview code {
  font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
  font-size: 12px;
  color: var(--accent);
  word-break: break-all;
}

.selbuilder-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.selbuilder-menu {
  max-height: 280px;
  overflow-y: auto;
  min-width: 220px;
}

.selbuilder-history-item .bp5-text-overflow-ellipsis {
  font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
  font-size: 11px;
}

/* --- Macros tab: definition disclosure --- */
.selbuilder-macros {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selbuilder-macrodef.bp5-callout {
  background: var(--bg-input);
  border: 1px solid var(--border);
}

.selbuilder-macrodef-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.selbuilder-macrodef code {
  font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
  font-size: 11px;
  color: var(--accent);
  word-break: break-all;
}
```

## 8. `SelectionPane.tsx` への統合

既存の `SelectionPane` を以下の通り改修する。要点:

- `selectionText` は引き続きペインが所有 (single source of truth)。
- Selection ラベル行を `selection-label-row` でラップし、右端に `<SelectionBuilder>` を配置。
- `onEmit` で insert (既存式に ` and ` 連結) / replace を処理。
- `history` はローカル state。`onBlur` で `commitToHistory` 呼び出し (将来フック化)。
- `resolveValues` は props で受け取り素通し (実配線は §9)。

参考実装 (変更箇所を含む完全形):

```tsx
/**
 * @file SelectionPane.integration.tsx
 * @description Reference showing how SelectionBuilder plugs into the existing
 * SelectionPane. Only the changed parts of the original file are shown.
 *
 * Key points:
 *  - selectionText is still owned by the pane (single source of truth).
 *  - The builder is placed in the Selection label row, right-aligned.
 *  - `onEmit` handles both insert (append with a leading space) and replace.
 *  - History is kept in local state; lift to a hook + electron-store later
 *    for cross-session persistence.
 *
 * @module SelectionPaneIntegration
 */

import React, { useState, useCallback } from "react";
import { HTMLSelect, TextArea } from "@blueprintjs/core";
import { SectionHeader } from "./SectionHeader";
import { SelectionBuilder } from "./SelectionBuilder";

export interface MolOption {
  id: string;
  label: string;
}

const MAX_HISTORY = 15;

interface SelectionPaneProps {
  molecules: MolOption[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Optional value resolver wired to the active molecule for autocomplete. */
  resolveValues?: (kind: "chain" | "resname" | "aname" | "elem") => string[];
}

export const SelectionPane: React.FC<SelectionPaneProps> = ({
  molecules,
  collapsed,
  onToggleCollapse,
  resolveValues,
}) => {
  const [selectedMol, setSelectedMol] = useState("mol1");
  const [selectionText, setSelectionText] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  // Apply an expression emitted from the builder.
  const handleEmit = useCallback(
    (next: string, mode: "insert" | "replace") => {
      setSelectionText((prev) => {
        if (mode === "replace") return next;
        // Insert: append, wrapping the previous expression so operator
        // precedence stays predictable when the user adds an AND/OR later.
        return prev.trim() === "" ? next : `${prev.trim()} and ${next}`;
      });
    },
    []
  );

  // Push the current text onto history (call on Apply / commit).
  const commitToHistory = useCallback((expr: string) => {
    const trimmed = expr.trim();
    if (trimmed === "") return;
    setHistory((prev) =>
      [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY)
    );
  }, []);

  return (
    <div className="sp-pane">
      <SectionHeader
        title="Selection"
        icon="select"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="sp-pane-fill">
          <div className="selection-row">
            <label className="selection-label">Molecule</label>
            <HTMLSelect
              value={selectedMol}
              onChange={(e) => setSelectedMol(e.target.value)}
              fill
              className="selection-mol-select"
            >
              {molecules.map((mol) => (
                <option key={mol.id} value={mol.id}>
                  {mol.label}
                </option>
              ))}
            </HTMLSelect>
          </div>

          <div className="selection-text-row">
            {/* Label row carries the builder trigger on the right edge. */}
            <div className="selection-label-row">
              <label className="selection-label">Selection</label>
              <SelectionBuilder
                value={selectionText}
                onEmit={handleEmit}
                history={history}
                resolveValues={resolveValues}
              />
            </div>
            <TextArea
              value={selectionText}
              onChange={(e) => setSelectionText(e.target.value)}
              onBlur={(e) => commitToHistory(e.target.value)}
              placeholder="e.g. chain.A and resid.1:10"
              fill
              growVertically={false}
              className="selection-textarea"
            />
          </div>
        </div>
      )}
    </div>
  );
};
```

## 9. `resolveValues` の実データ配線 (任意・将来)

`resolveValues(kind)` は active molecule から実在値を返す関数。POC 段階では未配線でも free text で動作する。配線する場合の指針:

- `kind` は `"chain" | "resname" | "aname" | "elem"`。
- molecule の構造データ (chains → residues → atoms) を走査し、重複排除した一意値の配列を返す。
- 大規模構造 (最大100万原子) を考慮し、**molecule ロード時に kind ごとの一意値セットを事前計算してキャッシュ**し、`resolveValues` は O(1) で参照するだけにすること。毎回の全走査は避ける。
- backend scripting engine 接続後は IPC 経由で取得する形へ移行可能。

## 10. 今後の拡張余地 (今回スコープ外)

- 確定式の簡易バリデーション (未知プロパティ警告) を preview 行に追加。
- 括弧グループ化 UI (ネスト term)。
- 確定式を backend scripting engine へ IPC ディスパッチ。
- 履歴の electron-store 永続化 (`useSelectionHistory`)。
