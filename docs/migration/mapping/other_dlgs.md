<!--
Mapping values:
  direct      -- one-to-one React component
  split       -- split into multiple React components
  merged      -- merged into existing React component
  dropped     -- not migrated (feature removed)
  deferred    -- migration deferred

Status values:
  todo        -- not started
  wip         -- in progress
  review      -- PR open, under review
  done        -- merged
  blocked     -- blocked by dependency
-->

# Mapping — Dialog_other

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`dialog.about`](../uxp-inventory/other_dlgs.md#dialogabout) | `AboutDialog` / `useDialog` | direct | wip | | | GRE info・userAgent は省略 |
| [`dialog.atomintr`](../uxp-inventory/other_dlgs.md#dialogatomintr) | | | todo | | | |
| [`dialog.delete-object`](../uxp-inventory/other_dlgs.md#dialogdelete-object) | | | todo | | | |
| [`dialog.dsurf`](../uxp-inventory/other_dlgs.md#dialogdsurf) | | | todo | | | |
| [`dialog.exportlxs-opt`](../uxp-inventory/other_dlgs.md#dialogexportlxs-opt) | | | todo | | | |
| [`dialog.exportpng-opt`](../uxp-inventory/other_dlgs.md#dialogexportpng-opt) | | | todo | | | |
| [`dialog.exportqsl-opt`](../uxp-inventory/other_dlgs.md#dialogexportqsl-opt) | | | todo | | | |
| [`dialog.fopen-option`](../uxp-inventory/other_dlgs.md#dialogfopen-option) | | | todo | | | |
| [`dialog.generic`](../uxp-inventory/other_dlgs.md#dialoggeneric) | | | todo | | | |
| [`dialog.new-tabwnd`](../uxp-inventory/other_dlgs.md#dialognew-tabwnd) | | | todo | | | |
| [`dialog.paint`](../uxp-inventory/other_dlgs.md#dialogpaint) | | | todo | | | |
| [`dialog.qscwriter-option`](../uxp-inventory/other_dlgs.md#dialogqscwriter-option) | | | todo | | | |
| [`dialog.setup-renderer`](../uxp-inventory/other_dlgs.md#dialogsetup-renderer) | | | todo | | | |
| [`dialog.anim-render`](../uxp-inventory/other_dlgs.md#dialoganim-render) | | | todo | | | |
| [`dialog.animobj`](../uxp-inventory/other_dlgs.md#dialoganimobj) | | | todo | | | |
| [`dialog.apply-rend-style`](../uxp-inventory/other_dlgs.md#dialogapply-rend-style) | `ApplyRendStyleDialog` / `getRendererStyleEditInfo` / `applyRendererStyleList` | direct | wip | | | Blueprint replacement for UXP `apply_rend_style.xul`. List view + Add popup (type/edge/coloring sections) + Delete/Up/Down operating on the working list; commit dispatches `applyRendererStyleList` to call `rend.applyStyles` under "Change style" txn. Pre-fetch via `getRendererStyleEditInfo` (parses `rend.style`, groups available styles by regex, excludes already-applied entries). |
| [`dialog.rendstyle-create`](../uxp-inventory/other_dlgs.md#dialogrendstyle-create) | `CreateRendStyleDialog` / `getCreateRendStyleInfo` / `createStyleFromRenderer` | direct | wip | | | Blueprint replacement for UXP `rendstyle_create.xul`. Writable style-set listbox (filters out readonly + global "system") + base-name input with `type_name` postfix; commit calls `createStyleFromRenderer` worker → `StyleManager.createStyleFromObj`. Same-name overwrite is handled by C++ internally (UXP's confirm prompt dropped — auto-overwrite matches our other paste patterns). |
| [`dialog.style-editor`](../uxp-inventory/other_dlgs.md#dialogstyle-editor) | | | todo | | | |
