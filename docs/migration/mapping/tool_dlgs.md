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

# Mapping — Dialog_tool

> Option-specification UX: pick a pattern per row using
> [option-ux-guidelines.md](../option-ux-guidelines.md). Sub-classify each tool
> (attribute edit / object create / one-shot render / destructive / interactive).

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`dialog.tool.aintr-edit`](../uxp-inventory/tool_dlgs.md#dialogtoolaintr-edit) | | | todo | | | |
| [`dialog.tool.apbs-calcpot`](../uxp-inventory/tool_dlgs.md#dialogtoolapbs-calcpot) | | | todo | | | |
| [`dialog.tool.bond-edit`](../uxp-inventory/tool_dlgs.md#dialogtoolbond-edit) | | | todo | | | |
| [`dialog.tool.chg-chname`](../uxp-inventory/tool_dlgs.md#dialogtoolchg-chname) | `ChangeChainIdDialog` / `chainNameInput` / `useToolCommands` / `changeChainName.service` | direct | review | | | Blueprint dialog built from h3-kit/form (FieldSection + `ObjectSelect` + `MolSelList` + `TextField`). OK commits via `changeChainName` worker service (`MolAnlManager.changeChainName` under a "Change chain name" undo txn). Reached from Edit > Change chain ID (`menu:change-chain-id`). UXP parity: whitespace-only input -> blank chain "_" (confirm), trimmed length > 1 -> non-conforming confirm (Blueprint `Alert`); last-picked molecule retained in-session (no cross-session persistence). Re-verify after confirm/blank changes. |
| [`dialog.tool.chg-resindex`](../uxp-inventory/tool_dlgs.md#dialogtoolchg-resindex) | `ChangeResidueIndexDialog` / `resIndexInput` / `useToolCommands` / `changeResidueIndex.service` | direct | review | | | Blueprint dialog from h3-kit/form (`ObjectSelect` molCoord + `MolSelList` + `SegmentField` Shift/Start + `TextField` value + `SwitchField` Renumber). OK commits via `changeResidueIndex` worker service (`MolAnlManager.renumResIndex`/`shiftResIndex` under a "Change residue index" undo txn). Shift mode rejects 0; start mode > 4 digits -> PDB confirm (Blueprint `Alert`). Reached from Edit > Change residue number (`menu:change-resid-num`). Awaiting E2E sign-off. |
| [`dialog.tool.intr-tool`](../uxp-inventory/tool_dlgs.md#dialogtoolintr-tool) | | | todo | | | |
| [`dialog.tool.makesurf`](../uxp-inventory/tool_dlgs.md#dialogtoolmakesurf) | | | todo | | | |
| [`dialog.tool.mol-delete`](../uxp-inventory/tool_dlgs.md#dialogtoolmol-delete) | `DeleteMolDialog` / `useToolCommands` / `deleteMolAtoms.service` | direct | review | | | Blueprint dialog built from h3-kit/form (`FieldSection` + `ObjectSelect` molCoord + `MolSelList`). OK commits via `deleteMolAtoms` worker service (`MolAnlManager.deleteAtoms` under a "Delete atoms" undo txn). Reached from Edit > Delete mol atoms (`menu:delete-mol-atoms`). Empty selection disables OK (avoids deleting all atoms). Awaiting E2E sign-off. |
| [`dialog.tool.mol-merge`](../uxp-inventory/tool_dlgs.md#dialogtoolmol-merge) | | | todo | | | |
| [`dialog.tool.molclient-tools`](../uxp-inventory/tool_dlgs.md#dialogtoolmolclient-tools) | | | todo | | | |
| [`dialog.tool.morphanim-tool`](../uxp-inventory/tool_dlgs.md#dialogtoolmorphanim-tool) | | | todo | | | |
| [`dialog.tool.msms-makesurf`](../uxp-inventory/tool_dlgs.md#dialogtoolmsms-makesurf) | | | todo | | | |
| [`dialog.tool.multigrad-editor`](../uxp-inventory/tool_dlgs.md#dialogtoolmultigrad-editor) | | | todo | | | |
| [`dialog.tool.netpdb-progress`](../uxp-inventory/tool_dlgs.md#dialogtoolnetpdb-progress) | | | todo | | | |
| [`dialog.tool.open-pdb`](../uxp-inventory/tool_dlgs.md#dialogtoolopen-pdb) | | | todo | | | |
| [`dialog.tool.prot2ndry-tool`](../uxp-inventory/tool_dlgs.md#dialogtoolprot2ndry-tool) | | | todo | | | |
| [`dialog.tool.render-pov`](../uxp-inventory/tool_dlgs.md#dialogtoolrender-pov) | `InspectorPanel` (RenderSettingsEditor) / `RenderPanel` / `RenderResultPane` / `renderJob.service` / `PovrayBackend` / `useRenderJob` | split | done | | [ADR-0017](../adr/ADR-0017-povray-rendering-ui.md) | Re-designed as Inspector Render Settings + BottomPanel Render tab + ContentArea Render Result tab; worker pipeline drives POV-Ray / blendpng via ProcessManager. Single-frame only; animation rendering deferred. See ADR-0017. |
| [`dialog.tool.ssm-sup`](../uxp-inventory/tool_dlgs.md#dialogtoolssm-sup) | `MolSuperposeDialog` / `useToolCommands` / `superposeMol.service` | direct | done | | [ADR-0022](../adr/ADR-0022-mol-superpose.md) | Blueprint dialog from h3-kit/form (`SegmentField` LSQ/SSM + Reference/Moving `ObjectSelect`+`MolSelList` + Auto-recenter / Use-xformMat switches). OK commits via `superposeMol` worker service (`MolAnlManager.superposeSSM1`/`superposeLSQ1` under a "Mol superpose" undo txn, rollback on failure; auto-recenter -> `fitView2`). History (mol/algo/checkbox) in localStorage. "Write RMSD info file" dropped (won't implement; RMSD readable from log) -- see ADR-0022. Reached from Tools > Molecular superposition (`menu:mol-superpose`). E2E verified. |
| [`dialog.tool.surf-cutbyplane`](../uxp-inventory/tool_dlgs.md#dialogtoolsurf-cutbyplane) | | | todo | | | |
| [`dialog.tool.symm-chg`](../uxp-inventory/tool_dlgs.md#dialogtoolsymm-chg) | | | todo | | | |
| [`dialog.tool.visflagset-edit`](../uxp-inventory/tool_dlgs.md#dialogtoolvisflagset-edit) | | | todo | | | |
