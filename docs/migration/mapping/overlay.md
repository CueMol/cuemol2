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

# Mapping — Overlay

> Many UXP overlays are XUL fragments injected into a host dialog/panel; in
> tritium they are not separate widgets but parts of a parent component. Such
> rows use `merged` and carry the parent's status, with a cross-reference to
> the parent mapping row (e.g. `fopen-*` panes -> `dialog.fopen-option`,
> `property.*` sections -> `dialog.property.*`). Counting them is intentional:
> they pin per-fragment migration, mirrored from the parent.

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`overlay.coloring-deck-bfac`](../uxp-inventory/overlay.md#overlaycoloring-deck-bfac) | `ColorPane` (BfacDeck) | merged | done | | | B-factor coloring deck of `ColorPane`; tracked under `panel.coloring.deck.bfac` ([panels.md](panels.md)) |
| [`overlay.coloring-deck-cpk`](../uxp-inventory/overlay.md#overlaycoloring-deck-cpk) | `ColorPane` (CpkDeck) | merged | done | | | CPK coloring deck of `ColorPane`; tracked under `panel.coloring.deck.cpk` ([panels.md](panels.md)) |
| [`overlay.coloring-deck-elepot`](../uxp-inventory/overlay.md#overlaycoloring-deck-elepot) | `ColorPane` (ElepotDeck) | merged | done | | | Electrostatic-potential coloring deck of `ColorPane`; tracked under `panel.coloring.deck.elepot` ([panels.md](panels.md)) |
| [`overlay.coloring-deck-paint`](../uxp-inventory/overlay.md#overlaycoloring-deck-paint) | `ColorPane` (PaintTable) | merged | done | | | Paint coloring deck of `ColorPane`; tracked under `panel.coloring.deck.paint` ([panels.md](panels.md)) |
| [`overlay.coloring-deck-rainbow`](../uxp-inventory/overlay.md#overlaycoloring-deck-rainbow) | `ColorPane` (RainbowDeck) | merged | done | | | Rainbow coloring deck of `ColorPane`; tracked under `panel.coloring.deck.rainbow` ([panels.md](panels.md)) |
| [`overlay.coloring-deck-script`](../uxp-inventory/overlay.md#overlaycoloring-deck-script) | -- | dropped | done | | | Script coloring not carried forward. In UXP it was never user-selectable: the coloring-type selector has no Script option (`paint-type-*` items lack `script`) and `onChgColoring` has no case to create a `ScriptColoring`. The deck + `onLoadColoringScript` only edit `coloring.script` of a renderer that already has `ScriptColoring` (settable only via a qsc/scripting path, never the panel UI). A first-class tritium script-coloring mode would be new work, not UXP parity. |
| [`overlay.config-keybind`](../uxp-inventory/overlay.md#overlayconfig-keybind) | -- | deferred | done | | | UXP key-binding editor (config-keybind pane) intentionally not ported as-is. A better tritium-native keybinding approach is planned as future new work rather than a 1:1 XUL port. Already flagged as deferred in `config-misc` / `config-mouse` notes. |
| [`overlay.config-misc`](../uxp-inventory/overlay.md#overlayconfig-misc) | `SettingsPane` / `AppSettingsContext` | split | wip | | [ADR-0036](../adr/ADR-0036-settings-panel-wiring.md) | Atom-label defaults (font/size/color/bold/italic) wired to StyleManager `DefaultLabel.*` via `AppSettingsContext`; persisted to `user_styles.xml` on window close (UXP `onUnLoad` parity, `saveUserStyle`). Font picker lists installed system fonts (`queryLocalFonts`, in-font options) with a live WYSIWYG typography preview. HiDPI toggle and UI language dropped (no tritium consumer). Key-binding editor tracked separately (`config-keybind`). |
| [`overlay.config-mouse`](../uxp-inventory/overlay.md#overlayconfig-mouse) | `SettingsPane` / `ViewInputConfigContext` / `AppSettingsContext` / `input/` detector | split | wip | | [ADR-0032](../adr/ADR-0032-view-input-wheel-preset.md), [ADR-0036](../adr/ADR-0036-settings-panel-wiring.md) | Wheel zooms by default (`DefaultViewInConf`); tritium adds a Mouse / Mac-trackpad / **Auto-detect** device preset (auto default; renderer heuristic + pinch/rotate latch, no OS signal in Electron 42). Persisted in `UiState.inputDeviceMode`, re-applied live via `setViewInputConfigStyle`. XY-rotation sensitivity (`tbrad`) and pick precision (`hitprec`) wired to the ViewInputConfig singleton + persisted via `UserViewConf.*` user style (ADR-0036). Mouse-preset picker dropped (conflicts with device selector; invented options). Full UXP key-binding editor deferred. Phase 1/2 host E2E done; Phase 3 (auto) pending. |
| [`overlay.fopen-ccp4map`](../uxp-inventory/overlay.md#overlayfopen-ccp4map) | `Ccp4MapOptionsPane` | merged | done | | | CCP4 map options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-mmcifopt`](../uxp-inventory/overlay.md#overlayfopen-mmcifopt) | `FileOpenOptionDialog` (mmCIF options) | merged | done | | | mmCIF format-specific options of `FileOpenOptionDialog` (`dialog.fopen-option`); rendered for `formatKind === 'mmcif'` with C++-sourced reader defaults |
| [`overlay.fopen-msmsopt`](../uxp-inventory/overlay.md#overlayfopen-msmsopt) | `MsmsOptionsPane` | merged | done | | | MSMS surface options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-mtzopt`](../uxp-inventory/overlay.md#overlayfopen-mtzopt) | `MtzOptionsPane` (`mtzColumns.ts`) | merged | done | | | MTZ reflection options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-namdcooropt`](../uxp-inventory/overlay.md#overlayfopen-namdcooropt) | `NamdCoorOptionsPane` | merged | done | | | NAMD coordinate options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-pdbopt`](../uxp-inventory/overlay.md#overlayfopen-pdbopt) | `PdbOptionsPane` | merged | done | | | PDB options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-renderopt`](../uxp-inventory/overlay.md#overlayfopen-renderopt) | `RendererOptionsPane` | merged | done | | | Renderer options pane shared by `FileOpenOptionDialog` (`dialog.fopen-option`) and `NewRendererDialog` (`dialog.setup-renderer`) |
| [`overlay.propeditor-generic`](../uxp-inventory/overlay.md#overlaypropeditor-generic) | InspectorPanel / GenericTab | merged | wip | | [ADR-0015](../adr/ADR-0015-generic-property-inspector.md) | Generic tab of the docked inspector pane; live-apply, no OK/Cancel. First stage edits primitive types (string/int/real/bool/enum); color/vector/timeval/nested-object deferred. Targets object/renderer/scene (ScenePane tree) and View (View menu > View property...); follows content-tab switches via per-scene memory. Replaces the retired `NodePropertyDialog` modal. |
| [`overlay.propeditor-radii-common`](../uxp-inventory/overlay.md#overlaypropeditor-radii-common) | `CPKRendererSection` (Atom radii) | merged | done | | | Shared van der Waals radii sub-page; migrated as the "Atom radii" section of the CPK property page (`dialog.property.cpk`, [prop_dlgs.md](prop_dlgs.md)) |
| [`overlay.property.cartoon-coil`](../uxp-inventory/overlay.md#overlaypropertycartoon-coil) | `CartoonRendererSection` | merged | done | | | Coil accordion of the Inspector section for `dialog.property.cartoon` (done) |
| [`overlay.property.cartoon-helix`](../uxp-inventory/overlay.md#overlaypropertycartoon-helix) | `CartoonRendererSection` | merged | done | | | Helix accordion of the Inspector section for `dialog.property.cartoon` (done) |
| [`overlay.property.cartoon-sheet`](../uxp-inventory/overlay.md#overlaypropertycartoon-sheet) | `CartoonRendererSection` | merged | done | | | Sheet accordion of the Inspector section for `dialog.property.cartoon` (done) |
| [`overlay.property.molsurf`](../uxp-inventory/overlay.md#overlaypropertymolsurf) | `MolSurfRendererSection` | merged | done | | | Inspector section for `dialog.property.molsurf` (done) |
| [`overlay.property.renderer-common`](../uxp-inventory/overlay.md#overlaypropertyrenderer-common) | `RendererCommonSection` | merged | wip | | | Common (Basic settings + Edge lines) section of the Inspector Properties tab; tracked under `dialog.property.renderer` (wip) |
| [`overlay.property.ribbon-coil`](../uxp-inventory/overlay.md#overlaypropertyribbon-coil) | `RibbonRendererSection` | merged | done | | | Coil accordion of the Inspector section for `dialog.property.ribbon` (done) |
| [`overlay.property.ribbon-helix`](../uxp-inventory/overlay.md#overlaypropertyribbon-helix) | `RibbonRendererSection` | merged | done | | | Helix accordion of the Inspector section for `dialog.property.ribbon` (done) |
| [`overlay.property.ribbon-sheet`](../uxp-inventory/overlay.md#overlaypropertyribbon-sheet) | `RibbonRendererSection` | merged | done | | | Sheet accordion of the Inspector section for `dialog.property.ribbon` (done) |
| [`overlay.property.tube`](../uxp-inventory/overlay.md#overlaypropertytube) | `TubeRendererSection` | merged | done | | | Inspector section for `dialog.property.tube` (done) |
| [`overlay.anim.animobj-common-proppage`](../uxp-inventory/overlay.md#overlayanimanimobj-common-proppage) | `AnimElementInspector` | merged | done | | [ADR-0029](../adr/ADR-0029-anim-timeline-strip-model.md) | UXP animobj common property page realized by the anim detail inspector: common settings (Name / Quadric / Start time / Duration via `TimeField`) + all five per-type editors (SimpleSpin / CamMotion / ShowHide / Slide / MolAnim). Tracked under `dialog.animobj` (done, ADR-0029). |
