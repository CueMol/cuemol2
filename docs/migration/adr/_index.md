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
| [ADR-0004](ADR-0004-renderer-ctxmenu.md) | Renderer context menu — Coloring, Paint, Style, Change-type | accepted (Edit / Create style dialogs verified in-app 2026-08-22) | 2026-05-13 | `panel.workspace.ctxmenu.renderer` |
| [ADR-0005](ADR-0005-camera-name-keyed.md) | Camera operations are name-keyed at the worker boundary | accepted | 2026-05-13 | `panel.workspace.ctxmenu.camera` |
| [ADR-0006](ADR-0006-stylesets-uid-readonly.md) | StyleSets — uid keying, read-only toggle, save/load semantics | accepted | 2026-05-13 | `panel.workspace.ctxmenu.style` |
| [ADR-0007](ADR-0007-scene-tree-multi-select.md) | Scene-tree multi-select bulk dispatch | accepted | 2026-05-12 | `panel.workspace.ctxmenu.multi`, `panel.workspace.tree` |
| [ADR-0008](ADR-0008-get-pdb-streaming.md) | File > Get PDB — streaming download via StreamManager | accepted | 2026-05-13 | `menu.cuemol2` (Get PDB) |
| [ADR-0009](ADR-0009-open-recent-mru.md) | File > Open Recent — electron-store MRU + OS dock integration | accepted | 2026-05-13 | `menu.cuemol2` (Open Recent) |
| [ADR-0010](ADR-0010-quit-chain.md) | Application quit — per-tab modified-scene confirm chain | superseded by ADR-0016 | 2026-05-13 | `menu.cuemol2` (Quit), `menu.cuemol2-macos` (Quit), `other.cuemol2` |
| [ADR-0011](ADR-0011-new-tab-canvas-lifecycle.md) | New Tab — OffscreenCanvas one-shot bind, addView() for new views | accepted | 2026-05-13 | `menu.cuemol2` (New Tab), `other.cuemol2` |
| [ADR-0012](ADR-0012-save-scene-parity.md) | Save Scene / Save Scene As — UXP parity (.bak, qsc_xml, option dialog) | accepted | 2026-05-13 | `menu.cuemol2` (Save Scene, Save Scene As) |
| [ADR-0013](ADR-0013-toolbar-ribbon-port.md) | Top Toolbar — UXP ribbon port as a tab-less Navbar | accepted (object Save pending; Reload Scene and undo/redo history done) | 2026-05-16 | `toolbar.cuemol2-ribbon` |
| [ADR-0014](ADR-0014-file-menu-save-reload.md) | File menu — Save File As, Save current view, Reload Scene | accepted | 2026-05-16 | `menu.cuemol2` (Save File As, Save current view, Reload Scene) |
| [ADR-0015](ADR-0015-generic-property-inspector.md) | Generic property inspector — docked pane, live-apply, getPropsJSON bridge | accepted (color / vector / timeval widgets pending; nested-object editing enabled 2026-06-03) | 2026-05-16 | `overlay.propeditor-generic` |
| [ADR-0016](ADR-0016-window-close-quit-funnel.md) | Window close and app quit — single win.on('close') confirm funnel | accepted (supersedes ADR-0010) | 2026-05-17 | `menu.cuemol2` (Quit), `menu.cuemol2-macos` (Quit), `other.cuemol2` |
| [ADR-0017](ADR-0017-povray-rendering-ui.md) | POV-Ray rendering UI — Inspector settings, BottomPanel tab, Render Result tab, worker pipeline | accepted (single-frame); animation rendering implemented by [ADR-0040](ADR-0040-animation-rendering.md) on this pipeline; UI surfaces superseded by [ADR-0035](ADR-0035-render-window.md) | 2026-05-18 | `dialog.tool.render-pov` |
| [ADR-0018](ADR-0018-molstruct-panel.md) | MolStruct panel — lazy load, multi-select, deferred virtualization | accepted (tree perf deferred) | 2026-05-24 | `panel.molstruct` |
| [ADR-0019](ADR-0019-seq-panel-selection-latency.md) | Sequence panel — residual selection-commit latency (future work) | proposed (future work) | 2026-05-24 | `panel.btmpanel-holder.seq` |
| [ADR-0020](ADR-0020-color-picker-widget.md) | Color picker widget — popover-panel port of UXP colpicker | accepted (rolled out to all colour-selection UIs) | 2026-05-29 | `widget.colpicker`, `widget.colorslider`, `menu.color` |
| [ADR-0021](ADR-0021-selection-builder.md) | Selection Builder popover for MolSelList — one-way guided query builder, verified grammar | accepted; tab layout partially superseded by [ADR-0044](ADR-0044-selection-quick-pick.md), SelectionPane scoping superseded by [ADR-0051](ADR-0051-selection-pane-live-sel.md) | 2026-05-29 | `widget.molsellist` |
| [ADR-0022](ADR-0022-mol-superpose.md) | Molecular superposition dialog — algorithm dispatch and deferred RMSD-file output | accepted (in-app verified); RMSD-file output dropped (won't implement) | 2026-06-06 | `dialog.tool.ssm-sup` |
| [ADR-0023](ADR-0023-measure-tool.md) | Measure tool — distance/angle/torsion pick port (worker state machine, 3D DistPickDrawObj feedback, target popover) | accepted (host E2E verified; PR pending) | 2026-06-10 | `toolbar.cuemol2-ribbon` |
| [ADR-0024](ADR-0024-bond-editor.md) | Bond editor — viewport pick tool (not a modal): add by 2-atom pick, remove/list in the tool-options popover | accepted (host E2E verified) | 2026-06-12 | `dialog.tool.bond-edit` |
| [ADR-0025](ADR-0025-view-panel.md) | View panel — unbounded DragNumericField fake-dial, relative rotation, command-reused projection | accepted (host E2E verified; PR pending) | 2026-06-12 | `panel.fakedial` |
| [ADR-0026](ADR-0026-camera-vis-flags-editor.md) | Camera visibility-flags editor — scene-tree enumerate + clear-rebuild apply | accepted (host E2E verified; PR pending) | 2026-06-12 | `dialog.tool.visflagset-edit`, `panel.workspace.ctxmenu.camera` |
| [ADR-0027](ADR-0027-interaction-list-editor.md) | Interaction-list editor — getDefsJSON contract and stable-index delete | accepted (host E2E verified; PR pending) | 2026-06-12 | `dialog.tool.aintr-edit`, `panel.workspace.ctxmenu.renderer` |
| [ADR-0028](ADR-0028-style-editor.md) | Style editor — 3-tab modal with live-applied style-set CRUD | accepted (host E2E verified; PR pending) | 2026-06-12 | `dialog.style-editor`, `panel.workspace.ctxmenu.style` |
| [ADR-0029](ADR-0029-anim-timeline-strip-model.md) | Animation panel — strip-timeline model and detail inspector | accepted (migration complete) | 2026-06-13 | `panel.anim`, `dialog.animobj` |
| [ADR-0030](ADR-0030-tritium-packaging-renovation.md) | tritium packaging / release-build renovation — target OS (mac arm64 + win + linux), version single-source (QM_VERSION), signing deferred, python optional | accepted (Phase 0-3 + Electron 42 done; 3-OS CI packaging + release wiring/gating/icon; Phase 4 signing pending) | 2026-06-14 | (none — build/packaging infra) |
| [ADR-0031](ADR-0031-scene-rendering-panel.md) | Scene rendering properties in the Inspector Property tab — curated AO/AA/bg/proofing sections via the generic-props bridge | accepted (host E2E pending) | 2026-06-14 | `dialog.property.scene` |
| [ADR-0032](ADR-0032-view-input-wheel-preset.md) | View-input wheel binding and tritium mouse/trackpad preset switch — wheel zooms by default; selectable DefaultViewInConf/TrackpadViewInConf presets via UiState + setViewInputConfigStyle | accepted (Phase 1/2 host E2E verified; Phase 3 auto-detect host E2E pending) | 2026-06-15 | `overlay.config-mouse` |
| [ADR-0033](ADR-0033-objslot-ownership.md) | ObjProxyBridge `_objSlot` ownership and lifetime — unbounded native-object slot leak; FinalizationRegistry+releaseObj RPC vs scene-scoped eviction | accepted (design-out — ObjProxy bridge + _objSlot removed, leak no longer reachable) | 2026-06-16 | (none — worker-bridge infra) |
| ADR-0034 | Render preview pane — docked pane right of ContentArea (competing alternative to ADR-0035) | retired (PR #416 closed unmerged; number not reused) | 2026-07-05 | `dialog.tool.render-pov` |
| [ADR-0035](ADR-0035-render-window.md) | Rendering window — modeless child BrowserWindow hosting result viewer + render panel + settings; IPC relay to the worker-owning main window; supersedes ADR-0017 UI surfaces | accepted (merged in PR #418; host E2E verified) | 2026-07-05 | `dialog.tool.render-pov` |
| [ADR-0036](ADR-0036-settings-panel-wiring.md) | Settings panel wiring — atom-label defaults (StyleManager DefaultLabel.*) + view-input tbrad/hitprec (ViewInputConfig + UserViewConf), user-style persisted via new saveUserStyle on window close; mock cleanup (32 -> 13 settings) | accepted (host E2E pending) | 2026-07-05 | `overlay.config-misc`, `overlay.config-mouse` |
| [ADR-0037](ADR-0037-scene-export-capability-gate.md) | Scene-export menu items gated by libcuemol2 exporter capability — startup `getAvailableSceneExporters` probe hides exporters not compiled in (e.g. Umbreon without HAVE_UMBREON) via MenuState.exportCaps + MenuItem.visible; fail-open | accepted (host E2E pending) | 2026-07-12 | `menu.cuemol2.rendering` |
| [ADR-0038](ADR-0038-apbs-calcpot.md) | APBS electrostatic-potential tool — modal + inline progress (DialogShell footerActions), exe paths moved to Settings (ApbsConfigContext), worker ProcessManager two-phase pdb2pqr->apbs pipeline loading an ElePotMap | accepted (host E2E verified) | 2026-07-12 | `dialog.tool.apbs-calcpot` |
| [ADR-0040](ADR-0040-animation-rendering.md) | Animation (movie) rendering — ADR-0035 の Rendering window に Still/Animation モードとして統合; scene duplication と target-scene ロックは採らず (実現性は確認済みで将来の option として記録)、代わりに `AnimMgr` の property 保存/復元 (startImpl で保存・stop で復元・pause では保持) を libcuemol2 側に先行実装し undo/redo との乖離を解消。umbreon (in-process ray tracer) は `AnimMgr::writeFrame` を `beginFrame`/`endFrame` に分割し、その間で非同期 render を 1 フレームずつ回す | accepted | 2026-07-20 | `dialog.anim-render` |
| [ADR-0042](ADR-0042-umbreon-quality-presets.md) | Umbreon quality presets — Lighting method (Raytrace / AO / GI, mutually exclusive) + 直交する軸ごとの dropdown (Supersampling / AO or GI quality / Shadows); look knobs はラダー外。libcuemol2 に AO recipe props (aoDiffuseFactor 等) と AA (aaMode/aaDepth) を追加し、ほぼ不可視だった AO を実効化、AO 半径を scene bbox からの自動算出に | accepted (host E2E verified) | 2026-07-28 | `dialog.tool.render-pov` |
| [ADR-0043](ADR-0043-movie-output-lifetime.md) | Movie render output location and temporary-file lifetime — 出力先の既定を app 管理の `os.tmpdir()/cuemol-movies/session-*` にし (ユーザー指定は任意のオーバーライド)、中間 frame PNG は 24h・成果物 movie は 30 日/最新 10 session で**起動時のみ** sweep (アプリ終了時は消さない: still は数十秒で描き直せるが animation は数時間)。同時起動は session pid で保護。あわせて encode 成否を「出力削除→存在確認」で判定 (ProcessManager が exit code を出さないため失敗が成功扱いになり古い movie が結果に化けていた)、レンダ開始前の stale frame 掃除、ffmpeg の事前チェックを追加 | accepted (host E2E verified) | 2026-07-29 | `dialog.anim-render` |
| [ADR-0044](ADR-0044-selection-quick-pick.md) | Tabbed selection widget — Named / History / Term / Mod の 4 タブに分割し、Named / History のクリックは常に置換で即適用 (`onQuickApply`; MolSelList は新値を commit して popover を閉じる) して UXP の 1-step dropdown を復元。合成 (Add/Sub/Intersect) は Term タブの Named / History keyword (dropdown 先頭に移動) が引き続き担う。あわせて CountTag のバッジ幅上限化 (9999 超は 12k/1.2M 略記) と SegmentField の compact variant を追加 | accepted (host E2E verified) | 2026-08-07 | `widget.molsellist`, `widget.selection-widget` |
| [ADR-0045](ADR-0045-rend-group-parity.md) | Renderer group 完全パリティ — group Show/Hide のメンバー visible カスケード (単体+bulk)、rename のメンバー `group` 追従 + scene 全域一意ゲート、`ui_collapsed` の txn なし書き戻し + pre-debounce イベントフィルタ、deep Copy&Paste (`rendGrpToXML`/`rendArrayFromXML`、object 行 paste で group 自動生成)。メンバー列挙は worker 側の名前走査 (`listGroupChildRenderers`) | accepted (host E2E verified) | 2026-08-09 | `panel.workspace.tree`, `panel.workspace.ctxmenu.rendgroup`, `panel.workspace.ctxmenu.multi` |
| [ADR-0046](ADR-0046-preset-renderer.md) | Preset renderer — `<objtype>-rendpreset` style の predefined renderer group を New Renderer / file-open / Get PDB の両経路で一括生成。`RendererOptions.presetName` 明示フィールド (正規表現判定廃止)、短縮既定名 `default1_1`、preset は Presets optgroup 表示だが既定選択にしない、group 内では非表示 (ネスト防止)、file-open は `ensureActiveScene()` 後の `getRendPresetTypes` prefetch→args 供給 | accepted (host E2E verified) | 2026-08-09 | `dialog.setup-renderer`, `overlay.fopen-renderopt` |
| [ADR-0047](ADR-0047-molsurf-regenerate.md) | MolSurfObj "Regenerate surface..." — object ctxmenu の 3 状態ゲート (MolSurfObj 以外は hidden / `orig_mol` 未解決なら表示のまま disabled) と、density のみを編集する専用 `RegenMolSurfDialog`。`.qif` が `regenerateSES1(density)` の第 1 引数しか公開しておらず UXP も probe radius 編集をコメントアウトしているため、probe radius / selection / 対象分子は `orig_*` の read-only 表示に留める。undo は C++ の `MolSurfEditInfo` が積むので worker 側は txn ラベルのみ供給 | accepted (host E2E verified) | 2026-08-09 | `panel.workspace.ctxmenu.object`, `dialog.tool.makesurf` |
| [ADR-0048](ADR-0048-multigrad-editor.md) | Multi-gradient color editor — UXP のモーダル listbox 編集を Illustrator 風の直接操作 stop bar (drag 移動 / 空白クリック追加 / 下 drag 削除 / keep-ratio / preset) に再設計し、ColorPane multigrad deck + DensityMapPane に非モーダル inline 埋め込み。C++ に batch JSON API (`getNodesJSON`/`setNodesJSON`、Boost.PropertyTree、copyFrom 継承で undo/イベント維持)。drag は preview(txn なし)/commit(restore-then-txn 1 undo)/abort。切替時の heatmap seed (UXP deviation)、map renderer の ColorPane 対象化 (paint 対象 filter 拡張)、widget は feature-local 配置 | accepted (host E2E verified) | 2026-08-11 | `dialog.tool.multigrad-editor`, `panel.coloring.deck.multigrad`, `panel.coloring.shell`, `panel.densitymap` |
| [ADR-0049](ADR-0049-create-symm-mol.md) | Create SYMM mol — navi ctxmenu の `*symm` ヒット項目を有効化し、対称像 1 つを新規 MolCoord として実体化 (UXP `createSymmObj` パリティ)。NewRendererDialog は無変更再利用 (編集可な `rendOpts.objectName` を symm フローが初消費 = `bEditObjName:true` 等価)、prefetch は named export 化した `getNewRendererOptions` を再利用、`copyAtoms`→`xformByMat`→`addObject`→`setupRenderer` を単一 'Create symm mol' txn (detached obj は undo レコードを生まないため UXP の txn 範囲と観測同一)。symop 行列は commit 時取得 (意図的逸脱) | accepted (host E2E verified) | 2026-08-21 | `toolbar.cuemol2-ribbon` |
| [ADR-0050](ADR-0050-morph-anim-tool.md) | Mol morphing animation tool — UXP の「事前プロンプト + 暗黙 MolCoord→MorphMol 変換」をダイアログ内 Target セレクタ + 明示 Convert ボタンに統合 (破壊的置換を暗黙にしない)。worker 5 サービス (`convertToMorphMol` = toXML2/fromXML/appendThisFrame の renderer 引き継ぎ変換、frame add/remove は UXP と同じ txn ラベル、mol 追加のコピペラベルのみ是正)。apply-immediately + Close のみ維持。C++ 変更なし — MorphMol の AnimMol 再親子化 (realtime 高速パス) は phase2 plan の保留項目のまま別 workstream | accepted (host E2E verified) | 2026-08-21 | `dialog.tool.morphanim-tool`, `menu.cuemol2.tools` |
| [ADR-0051](ADR-0051-selection-pane-live-sel.md) | SelectionPane を live `mol.sel` 編集 + 共有 SelectionBuilder 埋め込みに再設計 (2026-08-07 実装、記録は 2026-08-22 の遡及)。Selection field は event manager 経由で `mol.sel` を反映 (scene undo/redo が自動追随)、builder の全 op (Replace/Add/Subtract/Intersect + Invert/Byres/Sidechain/Mainchain/Around/Expand) は commit step 無しで `mol.sel` へ直接書き込み (builder ローカル undo は廃し scene undo に一本化)。UXP Editor タブは「deferred indefinitely」ではなく builder が役割を代替 (`hier` = Hierarchical `chain.resid.aname` / property keyword = Terminal / Mod = Around・Expand) | accepted (host E2E verified) | 2026-08-07 | `panel.selection` |
| [ADR-0052](ADR-0052-view-input-gfx-settings-not-ported.md) | View-input / gfx settings not ported — momentum scroll・multi-touch trackpad・右ボタンエミュレート (UXP は独自マウスドライバ層、tritium は ADR-0032 の device preset + OS のイベント平滑化で代替) と MSAA サンプル数 pref (tritium は `antialias:false` で off-screen パイプラインが AA を担い、scene 単位の `aa_method` = none/fxaa/smaa が等価な制御) をいずれも drop。C++ の `View.trans_mms`/`rot_mms` は残置するので、将来 UI が必要になれば配線のみで復活できる | accepted | 2026-08-22 | `overlay.config-mouse`, `overlay.config-misc` |
