# ADR Index

Architecture Decision Records for the UXP → tritium migration.

> **Scope.** ADRs capture *why* a design choice was made. Implementation
> status, completion percentages, and per-item progress live in
> `../mapping/`. UXP-side inventory lives in `../uxp-inventory/` and stays
> closed to migration progress information.
>
> **When to write an ADR.** Open one when:
> - A mapping row's Notes would otherwise grow past ~3 sentences (~200
>   chars) of design rationale.
> - You hit a known issue worth recording with reproduction context.
> - Multiple Phase-style sub-decisions accumulate under one mapping row.
>
> **Linking.** Each mapping row references its ADRs in the `ADR` column as
> `[ADR-NNNN](../adr/ADR-NNNN-<slug>.md)`. The Notes column keeps a 1-2
> sentence summary; full rationale lives in the ADR.
>
> **Numbering.** Four-digit zero-padded sequential (`ADR-0001`, `ADR-0002`,
> ...). Once assigned, never renumber — supersession is recorded in the
> Status field, not by reusing numbers.
>
> **Template.** Copy `_template.md` when adding a new ADR.

---

## Index

| ADR | Title | Status | Date | Mapping rows |
|-----|-------|--------|------|--------------|
| [ADR-0001](ADR-0001-scene-tree-dnd.md) | Scene-tree drag-and-drop detection strategy | accepted (in-app verification pending) | 2026-05-12 | `panel.workspace.tree` |
| [ADR-0002](ADR-0002-scene-tree-inline-rename.md) | Scene-tree inline rename — three triggers, single controller | accepted | 2026-05-13 | `panel.workspace.tree` |
| [ADR-0003](ADR-0003-object-ctxmenu-phases.md) | Object context menu — phase decomposition and per-phase choices | accepted | 2026-05-12 | `panel.workspace.ctxmenu.object` |
| [ADR-0004](ADR-0004-renderer-ctxmenu.md) | Renderer context menu — Coloring, Paint, Style, Change-type | accepted (Edit/Create style dialog pending) | 2026-05-13 | `panel.workspace.ctxmenu.renderer` |
| [ADR-0005](ADR-0005-camera-name-keyed.md) | Camera operations are name-keyed at the worker boundary | accepted | 2026-05-13 | `panel.workspace.ctxmenu.camera` |
| [ADR-0006](ADR-0006-stylesets-uid-readonly.md) | StyleSets — uid keying, read-only toggle, save/load semantics | accepted | 2026-05-13 | `panel.workspace.ctxmenu.style` |
| [ADR-0007](ADR-0007-scene-tree-multi-select.md) | Scene-tree multi-select bulk dispatch | accepted | 2026-05-12 | `panel.workspace.ctxmenu.multi`, `panel.workspace.tree` |
| [ADR-0008](ADR-0008-get-pdb-streaming.md) | File > Get PDB — streaming download via StreamManager | accepted | 2026-05-13 | `menu.cuemol2` (Get PDB) |
| [ADR-0009](ADR-0009-open-recent-mru.md) | File > Open Recent — electron-store MRU + OS dock integration | accepted | 2026-05-13 | `menu.cuemol2` (Open Recent) |
| [ADR-0010](ADR-0010-quit-chain.md) | Application quit — per-tab modified-scene confirm chain | accepted | 2026-05-13 | `menu.cuemol2` (Quit), `menu.cuemol2-macos` (Quit), `other.cuemol2` |
| [ADR-0011](ADR-0011-new-tab-canvas-lifecycle.md) | New Tab — OffscreenCanvas one-shot bind, addView() for new views | accepted | 2026-05-13 | `menu.cuemol2` (New Tab), `other.cuemol2` |
| [ADR-0012](ADR-0012-save-scene-parity.md) | Save Scene / Save Scene As — UXP parity (.bak, qsc_xml, option dialog) | accepted | 2026-05-13 | `menu.cuemol2` (Save Scene, Save Scene As) |
| [ADR-0013](ADR-0013-toolbar-ribbon-port.md) | Top Toolbar — UXP ribbon port as a tab-less Navbar | accepted (object Save / Reload Scene / undo history pending) | 2026-05-16 | `toolbar.cuemol2-ribbon` |
| [ADR-0014](ADR-0014-file-menu-save-reload.md) | File menu — Save File As, Save current view, Reload Scene | accepted | 2026-05-16 | `menu.cuemol2` (Save File As, Save current view, Reload Scene) |
| [ADR-0015](ADR-0015-generic-property-inspector.md) | Generic property inspector — docked pane, live-apply, getPropsJSON bridge | accepted (color/vector/timeval/nested-object pending) | 2026-05-16 | `overlay.propeditor-generic` |
