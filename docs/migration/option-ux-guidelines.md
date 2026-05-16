# Option-specification UX Guidelines (UXP → tritium migration)

- Updated: 2026-05-16
- Scope: how a user supplies options/arguments when invoking a feature
  (the UXP "menu/button → option dialog → execute" pattern)
- Audience: anyone migrating a UXP dialog row in
  `mapping/{prop_dlgs,tool_dlgs,other_dlgs}.md`

This document is **guidance, not a contract**. Per-feature design decisions
(known issues, parity strategy) still go into an ADR; this file only fixes the
default routing so individual migrations stay consistent.

---

## 1. Background — why not port "everything is a modal"

UXP GUI used one uniform pattern: a menu/button opens a **modal dialog**, the
user fills in every option, then the feature runs. Ported verbatim this carries
avoidable UX costs:

- The user cannot **see the result while adjusting** — the modal hides the view
  and blocks the flow.
- For object-creating operations the dialog fields and the object's later
  property fields become a **duplicated configuration surface**.
- Re-adjusting after the fact means **re-opening the same dialog**.

There is no single "best" replacement. The modern approach is to **route by the
nature of the operation**.

---

## 2. UI pattern toolbox (available with Blueprint)

| Pattern | Blueprint | Good for |
|---|---|---|
| Modal dialog | `Dialog` | One-shot confirm actions; a step in a blocking flow |
| Docked property panel (non-modal, persistent) | custom pane + `Tabs` / `Collapse` | Live-editing a persistent object's settings |
| Popover anchored to the trigger | `Popover` | 1–3 lightweight options |
| Inline editing | `EditableText` | Rename and similar, completed in-place |
| Side sheet / drawer | `Drawer` | Transient task with many options |
| Tool mode + contextual panel | pane + viewport interaction | Tools that involve interaction on the 3D view |

---

## 3. Routing axes

Decide a pattern by asking, in order:

1. **Does it create / edit a persistent, re-editable scene object?**
   If yes, the options belong in a **property panel** (single source of truth).
   Do not gate creation behind a modal — create with defaults.
2. **How many parameters / how complex?**
   1–3 simple → popover · moderate form → modal · many or grouped → panel.
3. **Is live preview valuable?**
   If yes, prefer non-modal (panel or popover) so the viewport stays visible.
4. **Must a choice be made before the object can exist?**
   e.g. renderer type, target molecule. Ask only that minimum in a lightweight
   picker (submenu / popover); defer everything else to the panel.

---

## 4. Category recommendations

### prop_dlgs — renderer-type property dialogs (13 items)

`ballstick`, `cartoon`, `contour`, `cpk`, `disorder`, `isosurf`, `molsurf`,
`nucl`, `ribbon`, `tube`, ... — all edit a **persistent renderer object**.

- **Consolidate into one docked "Properties" panel**, alongside `ScenePane` /
  `SettingsPane`. It shows the settings of the renderer selected in the scene
  tree.
- Do **not** build 13 per-type modal dialogs. Use one panel with a shared
  section (color, transparency, ...) plus a per-type form difference, switched
  by `Tabs` / `Collapse`.
- Changes apply **live** (adjust while watching the view).
- The `panel.workspace.tree` double-click stub should **focus / load this
  panel**, not open a modal.
- Creating a renderer: ask only **type + target object** in a lightweight UI,
  create immediately, then refine in the panel.

### GetPdbDialog

- A one-shot network fetch with no persistent editable object — panel form has
  little benefit. **Keep it a modal** (slimmed down). Progress stays in the
  separate `StreamProgressDialog`.
- Future option: unify the "open structure" entry point into a single picker
  with tabs `Local file / PDB ID / Recent`. Low priority.

### tool_dlgs — mixed bag (21 items), sub-classify first

| Sub-class | Examples | Pattern |
|---|---|---|
| Edit attributes of an existing object | `symm-chg` (symmetry), `chg-chname` (chain name) | Property panel / inline editing; many-field ones become a panel section |
| Create an object | `makesurf` (surface) | Create with sensible defaults → refine in property panel (same as prop_dlgs) |
| One-shot export / rendering | `render-pov`, `anim-render` | Many options → docked / `Drawer` "render settings" panel rather than a giant modal; re-render is easy |
| Destructive operation | `mol-delete` | Small confirm dialog / inline confirm |
| Interactive viewport tool | `aintr-edit`, `bond-edit` | Tool mode + contextual panel (viewport interaction, values shown in a side panel) — never a modal |

### export dialogs — `exportpng-opt`, `exportlxs-opt`

- One-shot but many options, and size/preview feedback helps → **`Drawer` type
  "export settings"**, adjustable while watching the view.
- Either way, **persist last-used settings** to pre-fill next time (UXP did this
  via preferences).

### fopen-option / qscwriter-option

- These are a **step inside the blocking open/save flow** (after the native
  file dialog) — a modal is the natural fit. Keep the current
  `FileOpenOptionDialog` (per-format `Collapse`) / `QscWriterOptionDialog`
  approach.

---

## 5. Cross-cutting principles (apply regardless of pattern)

- **Execute with defaults + rely on Undo as the safety net.** Do not ask every
  option up front for creation operations; sensible defaults + "create then
  adjust" works because Undo exists.
- **Persist last-used settings** for one-shot operations (export / render).
- **The property panel is the source of truth** for a persistent object's
  settings — do not duplicate them in a creation dialog.

---

## 6. How to use this during migration

When migrating a dialog row in `mapping/{prop_dlgs,tool_dlgs,other_dlgs}.md`:

1. Classify the operation with the axes in §3.
2. Pick a pattern from the table in §4 (or §2).
3. Record the chosen pattern and the reason in the row's **Notes** column. If
   the rationale exceeds ~3 sentences or carries a known issue, write an ADR
   and link it (see `CLAUDE.md` → Migration Tracking).
