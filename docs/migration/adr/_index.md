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
> Status field, not by reusing numbers. A number may also be absent because
> the document turned out not to be about the migration and moved to
> `../../architecture/`; those numbers are retired, not reused (see below).
>
> **Moved out of this set.** ADR-0039 (Umbreon GI pt2 integrator) ->
> [`docs/architecture/umbreon-pt2-integrator.md`](../../architecture/umbreon-pt2-integrator.md).
> umbreon is a new rendering backend, not a UXP surface being migrated.
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
| [ADR-0010](ADR-0010-quit-chain.md) | Application quit — per-tab modified-scene confirm chain | superseded by ADR-0016 | 2026-05-13 | `menu.cuemol2` (Quit), `menu.cuemol2-macos` (Quit), `other.cuemol2` |
| [ADR-0011](ADR-0011-new-tab-canvas-lifecycle.md) | New Tab — OffscreenCanvas one-shot bind, addView() for new views | accepted | 2026-05-13 | `menu.cuemol2` (New Tab), `other.cuemol2` |
| [ADR-0012](ADR-0012-save-scene-parity.md) | Save Scene / Save Scene As — UXP parity (.bak, qsc_xml, option dialog) | accepted | 2026-05-13 | `menu.cuemol2` (Save Scene, Save Scene As) |
| [ADR-0013](ADR-0013-toolbar-ribbon-port.md) | Top Toolbar — UXP ribbon port as a tab-less Navbar | accepted (object Save / Reload Scene / undo history pending) | 2026-05-16 | `toolbar.cuemol2-ribbon` |
| [ADR-0014](ADR-0014-file-menu-save-reload.md) | File menu — Save File As, Save current view, Reload Scene | accepted | 2026-05-16 | `menu.cuemol2` (Save File As, Save current view, Reload Scene) |
| [ADR-0015](ADR-0015-generic-property-inspector.md) | Generic property inspector — docked pane, live-apply, getPropsJSON bridge | accepted (color/vector/timeval/nested-object pending) | 2026-05-16 | `overlay.propeditor-generic` |
| [ADR-0016](ADR-0016-window-close-quit-funnel.md) | Window close and app quit — single win.on('close') confirm funnel | accepted (supersedes ADR-0010) | 2026-05-17 | `menu.cuemol2` (Quit), `menu.cuemol2-macos` (Quit), `other.cuemol2` |
| [ADR-0017](ADR-0017-povray-rendering-ui.md) | POV-Ray rendering UI — Inspector settings, BottomPanel tab, Render Result tab, worker pipeline | accepted (single-frame; animation deferred); UI surfaces superseded by ADR-0035 | 2026-05-18 | `dialog.tool.render-pov` |
| [ADR-0018](ADR-0018-molstruct-panel.md) | MolStruct panel — lazy load, multi-select, deferred virtualization | accepted (tree perf deferred) | 2026-05-24 | `panel.molstruct` |
| [ADR-0019](ADR-0019-seq-panel-selection-latency.md) | Sequence panel — residual selection-commit latency (future work) | proposed (future work) | 2026-05-24 | `panel.btmpanel-holder.seq` |
| [ADR-0020](ADR-0020-color-picker-widget.md) | Color picker widget — popover-panel port of UXP colpicker | accepted (ColorPane decks wired; Paint table + Inspector deferred) | 2026-05-29 | `widget.colpicker`, `widget.colorslider`, `menu.color` |
| [ADR-0021](ADR-0021-selection-builder.md) | Selection Builder popover for MolSelList — one-way guided query builder, verified grammar | accepted (RendererOptionsPane only; PaintSelCell / SelectionPane deferred) | 2026-05-29 | `widget.molsellist` |
| [ADR-0022](ADR-0022-mol-superpose.md) | Molecular superposition dialog — algorithm dispatch and deferred RMSD-file output | accepted (in-app verification pending) | 2026-06-06 | `dialog.tool.ssm-sup` |
| [ADR-0023](ADR-0023-measure-tool.md) | Measure tool — distance/angle/torsion pick port (worker state machine, 3D DistPickDrawObj feedback, target popover) | accepted (host E2E verified; PR pending) | 2026-06-10 | `toolbar.cuemol2-ribbon` |
| [ADR-0024](ADR-0024-bond-editor.md) | Bond editor — viewport pick tool (not a modal): add by 2-atom pick, remove/list in the tool-options popover | accepted (host E2E verified) | 2026-06-12 | `dialog.tool.bond-edit` |
| [ADR-0025](ADR-0025-view-panel.md) | View panel — unbounded DragNumericField fake-dial, relative rotation, command-reused projection | accepted (host E2E verified; PR pending) | 2026-06-12 | `panel.fakedial` |
| [ADR-0026](ADR-0026-camera-vis-flags-editor.md) | Camera visibility-flags editor — scene-tree enumerate + clear-rebuild apply | accepted (host E2E verified; PR pending) | 2026-06-12 | `dialog.tool.visflagset-edit`, `panel.workspace.ctxmenu.camera` |
| [ADR-0027](ADR-0027-interaction-list-editor.md) | Interaction-list editor — getDefsJSON contract and stable-index delete | accepted (host E2E verified; PR pending) | 2026-06-12 | `dialog.tool.aintr-edit`, `panel.workspace.ctxmenu.renderer` |
| [ADR-0028](ADR-0028-style-editor.md) | Style editor — 3-tab modal with live-applied style-set CRUD | accepted (host E2E verified; PR pending) | 2026-06-12 | `dialog.style-editor`, `panel.workspace.ctxmenu.style` |
| [ADR-0029](ADR-0029-anim-timeline-strip-model.md) | Animation panel — strip-timeline model and detail inspector | accepted (migration complete) | 2026-06-13 | `panel.anim`, `dialog.animobj` |
| [ADR-0030](ADR-0030-tritium-packaging-renovation.md) | tritium packaging / release-build renovation — target OS (mac arm64 + win + linux), version single-source (QM_VERSION), signing deferred, python optional | accepted (Phase 0-3 + Electron 42 done; 3-OS CI packaging + release wiring/gating/icon; Phase 4 signing pending) | 2026-06-14 | (none — build/packaging infra) |
| [ADR-0031](ADR-0031-scene-rendering-panel.md) | Scene rendering properties in the Inspector Property tab — curated AO/AA/bg/proofing sections via the generic-props bridge | accepted (host E2E pending) | 2026-06-14 | `dialog.property.scene` |
| [ADR-0032](ADR-0032-view-input-wheel-preset.md) | View-input wheel binding and tritium mouse/trackpad preset switch — wheel zooms by default; selectable DefaultViewInConf/TrackpadViewInConf presets via UiState + setViewInputConfigStyle | accepted (Phase 1 UXP host E2E verified; tritium Phase 2 host E2E pending) | 2026-06-15 | `overlay.config-mouse` |
| [ADR-0033](ADR-0033-objslot-ownership.md) | ObjProxyBridge `_objSlot` ownership and lifetime — unbounded native-object slot leak; FinalizationRegistry+releaseObj RPC vs scene-scoped eviction | accepted (design-out — ObjProxy bridge + _objSlot removed, leak no longer reachable) | 2026-06-16 | (none — worker-bridge infra) |
| ADR-0034 | Render preview pane — docked pane right of ContentArea (competing alternative to ADR-0035) | retired (PR #416 closed unmerged; number not reused) | 2026-07-05 | `dialog.tool.render-pov` |
| [ADR-0035](ADR-0035-render-window.md) | Rendering window — modeless child BrowserWindow hosting result viewer + render panel + settings; IPC relay to the worker-owning main window; supersedes ADR-0017 UI surfaces | accepted (merged in PR #418; host E2E verified) | 2026-07-05 | `dialog.tool.render-pov` |
| [ADR-0036](ADR-0036-settings-panel-wiring.md) | Settings panel wiring — atom-label defaults (StyleManager DefaultLabel.*) + view-input tbrad/hitprec (ViewInputConfig + UserViewConf), user-style persisted via new saveUserStyle on window close; mock cleanup (32 -> 13 settings) | accepted (host E2E pending) | 2026-07-05 | `overlay.config-misc`, `overlay.config-mouse` |
| [ADR-0037](ADR-0037-scene-export-capability-gate.md) | Scene-export menu items gated by libcuemol2 exporter capability — startup `getAvailableSceneExporters` probe hides exporters not compiled in (e.g. Umbreon without HAVE_UMBREON) via MenuState.exportCaps + MenuItem.visible; fail-open | accepted (host E2E pending) | 2026-07-12 | `menu.cuemol2.rendering` |
| [ADR-0038](ADR-0038-apbs-calcpot.md) | APBS electrostatic-potential tool — modal + inline progress (DialogShell footerActions), exe paths moved to Settings (ApbsConfigContext), worker ProcessManager two-phase pdb2pqr->apbs pipeline loading an ElePotMap | accepted (host E2E pending) | 2026-07-12 | `dialog.tool.apbs-calcpot` |
| [ADR-0040](ADR-0040-animation-rendering.md) | Animation (movie) rendering — ADR-0035 の Rendering window に Still/Animation モードとして統合; scene duplication と target-scene ロックは採らず (実現性は確認済みで将来の option として記録)、代わりに `AnimMgr` の property 保存/復元 (startImpl で保存・stop で復元・pause では保持) を libcuemol2 側に先行実装し undo/redo との乖離を解消。umbreon (in-process ray tracer) は `AnimMgr::writeFrame` を `beginFrame`/`endFrame` に分割し、その間で非同期 render を 1 フレームずつ回す | accepted | 2026-07-20 | `dialog.anim-render` |
| [ADR-0042](ADR-0042-umbreon-quality-presets.md) | Umbreon quality presets — Lighting method (Raytrace / AO / GI, mutually exclusive) + 直交する軸ごとの dropdown (Supersampling / AO or GI quality / Shadows); look knobs はラダー外。libcuemol2 に AO recipe props (aoDiffuseFactor 等) と AA (aaMode/aaDepth) を追加し、ほぼ不可視だった AO を実効化、AO 半径を scene bbox からの自動算出に | accepted (host E2E verified) | 2026-07-28 | `dialog.tool.render-pov` |
| [ADR-0043](ADR-0043-movie-output-lifetime.md) | Movie render output location and temporary-file lifetime — 出力先の既定を app 管理の `os.tmpdir()/cuemol-movies/session-*` にし (ユーザー指定は任意のオーバーライド)、中間 frame PNG は 24h・成果物 movie は 30 日/最新 10 session で**起動時のみ** sweep (アプリ終了時は消さない: still は数十秒で描き直せるが animation は数時間)。同時起動は session pid で保護。あわせて encode 成否を「出力削除→存在確認」で判定 (ProcessManager が exit code を出さないため失敗が成功扱いになり古い movie が結果に化けていた)、レンダ開始前の stale frame 掃除、ffmpeg の事前チェックを追加 | accepted (host E2E verified) | 2026-07-29 | `dialog.anim-render` |
