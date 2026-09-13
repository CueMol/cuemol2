/**
 * @file plugins/pymconsole/index.ts
 * @description The PyM console: a command line that speaks part of the
 * PyMOL command language.
 *
 * For people arriving from PyMOL, who know `fetch 1crn` and `bg_color white`
 * and would rather type them than find them in menus. Partial compatibility
 * by design -- the aim is that what you already know works, not that every
 * PyMOL script runs.
 *
 * The parser is a port of PyMOL's own (`modules/pymol/parsing.py`), running
 * in the Web Worker so a command reaches the existing worker services by
 * direct call. There is no embedded Python involved: the alternative of
 * hosting the parser in libcuemol2's CPython was investigated and set aside
 * (`docs/plans/pymconsole-research-260529.md`, and the plan that supersedes
 * its section 0).
 *
 * Its stylesheet is imported from this entry rather than from `app.css`, so
 * dropping the plugin drops the CSS with it.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { pymConsoleManifest } from './manifest'
import { PymConsolePanel } from './renderer/PymConsolePanel'
import { PymConsoleRoot } from './renderer/PymConsoleRoot'
import './renderer/pym-console.css'

export const pymConsolePlugin = /* @__PURE__ */ definePlugin({
  manifest: pymConsoleManifest,
  Root: PymConsoleRoot,
  bottomTabs: {
    pymconsole: PymConsolePanel,
  },
})
