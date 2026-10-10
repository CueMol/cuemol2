---
name: inspect-ui
description: Use after implementing or changing tritium react-gui UI (a pane, dialog, sidebar view, form-kit component, CSS) and before asking the user to check it visually. Launches the built app under Playwright, opens the changed pane/dialog, and checks layout (clipped/overflowing/overlapping text and controls, size-token mismatches) in dark and light at several window sizes, with screenshots. A development-time self-check, not a regression test.
---

# Inspect tritium UI layout

Checks the screen as it is now against absolute rules: the style guide's size
tokens, nothing cut off, nothing overlapping. It does not compare against an
earlier run. Spec: `docs/architecture/ui-layout-inspect.md`.

## Steps

1. Build: `cd build_scripts && task build_tritium` (the inspector runs `out/`).
2. Pick the target for what changed:
   - dialog -> `--target dialog:<CmdId>` (ids in `tritium/react-gui/src/renderer/commands/ids.ts`)
   - sidebar view -> `--target view:explorer|view|selection|crystal|<plugin view>`
   - form-kit / list-kit component -> `--target catalog` (Component Catalog)
   - anything already on screen -> `--target pane:<css selector>`
   - needs a molecule -> add `--open tests/test_data/1CRN.pdb`
3. Run from `build_scripts/`:
   ```sh
   task inspect_tritium_ui -- --target <spec> [--open <file>] --out <scratchpad dir>
   ```
   It starts its own instance on a throwaway profile, so a running CueMol does
   not need to be closed. Defaults: themes `dark,light`, sizes
   `1400x900,1000x700` (the second gives the minimum-width sidebar).
4. Read the summary, then look at the images with the Read tool:
   - `<target>_<theme>_<WxH>.png`: the root element
   - `..._issues.png`: numbered boxes on the flagged elements
   - `..._issue<n>.png`: an issue that was scrolled out of view, scrolled in
   - `report.json`: every issue with path, rect and detail; `app.log` when the run fails
   Always look at least one plain screenshot per theme even with 0 issues: the
   audit cannot see wrong colours, wrong alignment or a wrong design.
5. Fix real issues and re-run. For an intentional one (e.g. a deliberately
   clipped preview) add `data-audit-ignore="<kind>"` on the element rather
   than loosening the audit. `info` items (`ellipsis`, `min-size-override`)
   need no action unless the screenshot shows a problem.
6. Then hand over to the user for the final visual check, listing what was
   inspected and any issue left on purpose.

Exit code: 0 clean, 1 issues found, 2 the run failed (see `app.log`).
