/**
 * @file plugins/mdtools/index.ts
 * @description The MD Tools plugin: the GUI for the C++ mdtools module --
 * opening an MD simulation trajectory and playing it back.
 *
 * The whole flow lives in this directory: the two-step open command, the
 * bottom-pane timeline, and the worker services that assemble a block-centric
 * `mdtools::Trajectory` (topology reader + one TrajBlock per coordinate file)
 * and drive its frame cursor.
 *
 * Unlike the other built-in plugins, this one is the interface to a C++ module
 * of its own. That module (`src/modules/mdtools/`) is linked into every build
 * and cannot be switched off from here, so disabling the plugin removes the
 * GUI only -- a `Trajectory` in a loaded scene keeps rendering either way.
 *
 * Its stylesheet is imported from this entry rather than from `app.css`, so
 * dropping the plugin drops the CSS with it.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { mdtoolsManifest } from './manifest'
import { MdtoolsRoot } from './renderer/MdtoolsRoot'
import { TrajectoryPanel } from './renderer/TrajectoryPanel'
import './renderer/md-traj-panel.css'

export const mdtoolsPlugin = /* @__PURE__ */ definePlugin({
  manifest: mdtoolsManifest,
  Root: MdtoolsRoot,
  bottomTabs: {
    trajectory: TrajectoryPanel,
  },
})
