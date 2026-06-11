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
| [`dialog.tool.makesurf`](../uxp-inventory/tool_dlgs.md#dialogtoolmakesurf) | `MakeMolSurfDialog` / `useToolCommands` / `makeMolSurf.service` | direct | review | | | Blueprint dialog from h3-kit/form (`ObjectSelect` molCoord + `SwitchField` use-selection + `MolSelList` + `TextField` name + `NumericField` density/probe). OK commits via `makeMolSurf` worker service: `MolSurfObj.createSESFromMol(mol, sel, density, probe)` then `addObject`/`forceEmbed` + default `molsurf` renderer (target=mol name, colormode=molecule, CPKColoring), all in one "Create mol surface" undo txn with whole-txn rollback. Blank name -> unique `sf_<molname>`. Built-in algorithm only (external MSMS = `msms-makesurf`, separate row); UXP regeneration mode out of scope. Reached from Tools > Mol surface generation (`menu:mol-surf`). Awaiting E2E sign-off. |
| [`dialog.tool.mol-delete`](../uxp-inventory/tool_dlgs.md#dialogtoolmol-delete) | `DeleteMolDialog` / `useToolCommands` / `deleteMolAtoms.service` | direct | review | | | Blueprint dialog built from h3-kit/form (`FieldSection` + `ObjectSelect` molCoord + `MolSelList`). OK commits via `deleteMolAtoms` worker service (`MolAnlManager.deleteAtoms` under a "Delete atoms" undo txn). Reached from Edit > Delete mol atoms (`menu:delete-mol-atoms`). Empty selection disables OK (avoids deleting all atoms). Awaiting E2E sign-off. |
| [`dialog.tool.mol-merge`](../uxp-inventory/tool_dlgs.md#dialogtoolmol-merge) | `MergeMolDialog` / `useToolCommands` / `mergeMol.service` | direct | review | | | Blueprint dialog from h3-kit/form (From `ObjectSelect`+`MolSelList` / To `ObjectSelect` / Copy `SwitchField`). OK commits via `mergeMol` worker service: `MolAnlManager.copyAtoms(toMol, fromMol, sel)`, and when Copy is off also `deleteAtoms(fromMol, sel)` (move) -- both in one "Merge molecule" undo txn with whole-txn rollback on failure. Self-merge blocked. Reached from Edit > Merge molecule (`menu:merge-mol`). Awaiting E2E sign-off. |
| [`dialog.tool.molclient-tools`](../uxp-inventory/tool_dlgs.md#dialogtoolmolclient-tools) | | | todo | | | |
| [`dialog.tool.morphanim-tool`](../uxp-inventory/tool_dlgs.md#dialogtoolmorphanim-tool) | | | todo | | | |
| [`dialog.tool.msms-makesurf`](../uxp-inventory/tool_dlgs.md#dialogtoolmsms-makesurf) | | | todo | | | |
| [`dialog.tool.multigrad-editor`](../uxp-inventory/tool_dlgs.md#dialogtoolmultigrad-editor) | | | todo | | | |
| [`dialog.tool.netpdb-progress`](../uxp-inventory/tool_dlgs.md#dialogtoolnetpdb-progress) | | | todo | | | |
| [`dialog.tool.open-pdb`](../uxp-inventory/tool_dlgs.md#dialogtoolopen-pdb) | | | todo | | | |
| [`dialog.tool.prot2ndry-tool`](../uxp-inventory/tool_dlgs.md#dialogtoolprot2ndry-tool) | `ReassignProt2ndryDialog` / `useToolCommands` / `reassignProt2ndry.service` | direct | review | | | Blueprint dialog from h3-kit/form (`ObjectSelect` molCoord + `SegmentField` Recalc/Assign + Recalc: Ignore-β-bulge / Helix gap-fill angle `SwitchField`+`NumericField` / Assign: `MolSelList` + type `SelectField`). OK commits via `reassignProt2ndry` worker service (`MolAnlManager.calcProt2ndry2` / `setProt2ndry` under "Recalc/Assign protein secondary str" undo txn). Reached from Edit > Reassign secondary str (`menu:reassign-2ndry`). Awaiting E2E sign-off. |
| [`dialog.tool.render-pov`](../uxp-inventory/tool_dlgs.md#dialogtoolrender-pov) | `InspectorPanel` (RenderSettingsEditor) / `RenderPanel` / `RenderResultPane` / `renderJob.service` / `PovrayBackend` / `useRenderJob` | split | done | | [ADR-0017](../adr/ADR-0017-povray-rendering-ui.md) | Re-designed as Inspector Render Settings + BottomPanel Render tab + ContentArea Render Result tab; worker pipeline drives POV-Ray / blendpng via ProcessManager. Single-frame only; animation rendering deferred. See ADR-0017. |
| [`dialog.tool.ssm-sup`](../uxp-inventory/tool_dlgs.md#dialogtoolssm-sup) | `MolSuperposeDialog` / `useToolCommands` / `superposeMol.service` | direct | done | | [ADR-0022](../adr/ADR-0022-mol-superpose.md) | Blueprint dialog from h3-kit/form (`SegmentField` LSQ/SSM + Reference/Moving `ObjectSelect`+`MolSelList` + Auto-recenter / Use-xformMat switches). OK commits via `superposeMol` worker service (`MolAnlManager.superposeSSM1`/`superposeLSQ1` under a "Mol superpose" undo txn, rollback on failure; auto-recenter -> `fitView2`). History (mol/algo/checkbox) in localStorage. "Write RMSD info file" dropped (won't implement; RMSD readable from log) -- see ADR-0022. Reached from Tools > Molecular superposition (`menu:mol-superpose`). E2E verified. |
| [`dialog.tool.surf-cutbyplane`](../uxp-inventory/tool_dlgs.md#dialogtoolsurf-cutbyplane) | | | todo | | | |
| [`dialog.tool.symm-chg`](../uxp-inventory/tool_dlgs.md#dialogtoolsymm-chg) | | | todo | | | |
| [`dialog.tool.visflagset-edit`](../uxp-inventory/tool_dlgs.md#dialogtoolvisflagset-edit) | | | todo | | | |
