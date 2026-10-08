/**
 * @file plugins/console/index.ts
 * @description The console: a command line in one of two dialects.
 *
 * The native dialect speaks CueMol's own commands. They are not written here:
 * they are generated from the core op catalogue (`worker/server/catalog`),
 * the same declarations the AI agent's tools come from, so a command and a
 * tool of the same name do the same thing. Selections are CueMol selections.
 *
 * The PyMOL dialect is for people arriving from PyMOL, who know `fetch 1crn`
 * and `bg_color white`. Its parser is a port of PyMOL's own
 * (`modules/pymol/parsing.py`), as is Tab completion (`parser.py`'s
 * `_complete`), and PyMOL selections are translated into CueMol ones
 * (`worker/dialects/pymol/sel/`) -- refused by name where CueMol has no
 * equivalent, because a selection that quietly means a different set of atoms
 * is the worst thing a console could do. There is no embedded Python
 * (`docs/plans/pymconsole-research-260529.md`).
 *
 * Both run in the Web Worker, one undo transaction per submission
 * (`worker/runtime/`), and reach the existing worker services by direct call.
 *
 * Its stylesheet is imported from this entry rather than from `app.css`, so
 * dropping the plugin drops the CSS with it.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { consoleManifest } from './manifest'
import { ConsolePanel } from './renderer/ConsolePanel'
import { CliPathRow } from './renderer/CliPathRow'
import { CliStatusItem } from './renderer/CliStatusItem'
import { ConsoleRoot } from './renderer/ConsoleRoot'
import { CLI_PATH_ROW } from './shared/consoleTypes'
import './renderer/console.css'

export const consolePlugin = /* @__PURE__ */ definePlugin({
  manifest: consoleManifest,
  Root: ConsoleRoot,
  bottomTabs: {
    console: ConsolePanel,
  },
  settingRows: {
    [CLI_PATH_ROW]: CliPathRow,
  },
  statusBarItems: {
    cli: CliStatusItem,
  },
})
