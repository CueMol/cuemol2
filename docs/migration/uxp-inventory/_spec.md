# UXP Inventory Format Specification

> **Inventory entries are hand-maintained.**
> The initial inventory was produced by a one-time scan pass of
> `uxp_gui/cuemol2/`. No generator is checked in, so entries can and should
> be edited when the actual UI granularity outgrows an existing screen-id
> boundary (e.g. a monolithic panel entry can be split into per-surface
> sub-entries).
>
> When editing:
> - Use the [Entry Markdown Template](#entry-markdown-template) below.
> - Keep each entry to **one user-visible surface** (a panel pane, a single
>   context menu, a toolbar). If you find yourself listing two unrelated
>   menus or both a toolbar and a tree under one entry, split it.
> - Update `<category>.md`'s Index list, the per-category Statistics block,
>   and the corresponding row(s) in `docs/migration/mapping/<category>.md`
>   together with `_index.md` counts.

---

## Screen ID Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Dialog_property (renderer property dialogs in `property/`) | `dialog.property.` | `dialog.property.ballstick` |
| Dialog_tool (tool operation dialogs in `tools/`) | `dialog.tool.` | `dialog.tool.open-pdb` |
| Dialog_other (root-level, `anim/`, `style/`) | `dialog.` | `dialog.about` |
| Panel (side/bottom panel overlay) | `panel.` | `panel.workspace` |
| Menu (standalone menupopup or menu overlay) | `menu.` | `menu.cuemol2` |
| Toolbar (ribbon/topbar overlay) | `toolbar.` | `toolbar.cuemol2-ribbon` |
| Custom Widget (XBL `<bindings>`) | `widget.` | `widget.numslider` |
| Overlay (property page, config, fopen page overlay) | `overlay.` | `overlay.fopen-pdbopt` |
| Other (window, prefwindow, placeholder) | `other.` | `other.main-window` |

**Rules:**
- Use kebab-case derived from the filename.
- Strip redundant suffixes already implied by the category prefix:
  `-propdlg`, `-dlg`, `-dialog`, `-panel`, `-page`, `-bindings`, `-binding`.
- Replace underscores with hyphens: `workspace_panel` → `panel.workspace`.
- If multiple files map to the same logical screen, add a disambiguator suffix.

---

## Entry Markdown Template

```markdown
### `<screen-id>`

- **File**: `uxp_gui/cuemol2/<relative-path>`
- **Root element**: `<element-name>`
- **Title**: "<Visible title>" (`<entity-or-key>` in `<dtd-or-properties-file>`) — or `unknown`
- **Chrome URL**: `chrome://cuemol2/content/<path>`
- **Associated JS**: `<filename>.js` — or `none`
- **Overlays applied**: `<overlay-file>`, ... — or `none`

#### User-visible features
- <bullet list of UI elements / controls the user sees>

#### Commands / Handlers
| Trigger | Handler | Description |
|---------|---------|-------------|
| <trigger> | <function-name()> | <what it does> |

#### i18n keys used
- `&entity.name;` (dtd: `<dtd-filename>`)
- `key.name` (properties: `<properties-filename>`)

#### Notes
- <any non-obvious constraints, workarounds, or migration concerns>
```

---

## Field Rules

### Required fields
All fields are **required**. Use `unknown` when the value cannot be determined by static analysis.

### Title
- Extract from `<dialog title="…">` attribute or DTD entity reference.
- Format: `"Human Readable Title"` (`&dtd.entity;` in `filename.dtd`)
- If title is hardcoded in XUL: `"Literal String"` (hardcoded)
- If not determinable: `unknown`

### Chrome URL
- Always use the form `chrome://cuemol2/content/<path-under-base/content/>`.
- Derive path from the file's location under `base/content/`.
- Example: `base/content/tools/openPDB.xul` → `chrome://cuemol2/content/tools/openPDB.xul`

### Associated JS
- Look for a `<script src="...">` element or a same-name `.js` file in the same directory.
- List all JS files if multiple. Use `none` if none found.

### Overlays applied
- Scan `<?xul-overlay href="...">` processing instructions at the top of the file.
- Use `none` if absent.

### i18n keys
- DTD entities: `&entity.name;` — note the DTD filename in parentheses.
- `.properties` keys: list the bare key name and the filename.
- Only list keys actually referenced in this file (not inherited from overlays).

### Guessing prohibition
- Never infer or guess values. If a field requires reading a file that was not scanned, write `unknown`.
- Do not fabricate handler function names; use `unknown` if not visible in the XUL.

---

## Category Definitions (for classification)

| Category | Root element / Pattern | Prefix |
|----------|----------------------|--------|
| Dialog_property | `<dialog>` + file under `property/` | `dialog.property.` |
| Dialog_tool | `<dialog>` + file under `tools/` | `dialog.tool.` |
| Dialog_other | `<dialog>` + file at root-level, `anim/`, or `style/` | `dialog.` |
| Panel | `<overlay>` + filename contains `panel` or is a side/bottom panel | `panel.` |
| Menu | `<menupopup>` standalone, or `<overlay>` containing menu definitions | `menu.` |
| Toolbar | `<overlay>` + ribbon/topbar (`*-ribbon.xul`, topbar/) | `toolbar.` |
| Custom Widget | `<bindings>` root in `.xml` | `widget.` |
| Overlay | `<overlay>` + property page, config page, fopen page | `overlay.` |
| Other | `<window>`, `<prefwindow>`, empty files | `other.` |
