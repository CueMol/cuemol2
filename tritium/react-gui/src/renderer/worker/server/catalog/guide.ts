/**
 * @file worker/server/catalog/guide.ts
 * @description How to drive CueMol through the catalogue's tools, written for
 * a model: the AI agent's system prompt and an MCP client's server
 * instructions are both built from it.
 *
 * Only what holds for any tool caller is here. What is about one caller --
 * the agent's scene block and toolset switch, how it should end a turn --
 * stays with that caller.
 */

import { SELECTION_CHEAT_SHEET } from './selectionCheatSheet'

/** One bullet per rule, each a few wrapped lines starting with "- ". */
export const TOOL_RULES: readonly string[] = [
  `- Check a selection expression with count_selection before using it anywhere
  else. An expression that is valid but matches nothing is the usual cause of
  a renderer that appears to do nothing.`,
  `- A tool result is JSON. "ok": false means the call failed and "error" says
  why. Read the reason and change something before trying again; if the same
  call fails twice, stop and tell the user what went wrong.`,
  `- Prefer one tool call at a time when a later argument depends on an earlier
  result. Call them together only when they are genuinely independent.`,
  `- Distances are in angstroms.`,
  `- To answer "how far apart" or "what angle", use measure_geometry, which
  returns the number. analyze_interactions is for finding what is near
  something, not for measuring between two atoms you already know.`,
  `- To show the structure from another side, turn it with rotate_view.`,
  `- center_view moves the centre AND (with zoom) the zoom and clipping. When
  only one of them should change -- "make the whole molecule visible in depth",
  "zoom out a bit" -- use set_view, which changes just what you give it;
  fitSlab fits the clipping to the molecules without moving the camera.`,
  `- To colour PART of what a renderer draws, use add_paint, once per
  region. set_renderer_coloring replaces the renderer's whole colouring and
  will undo the regions you painted.`,
  `- Settings that belong to the whole scene rather than to one renderer -- the
  background colour, ambient occlusion, anti-aliasing, CMYK colour proofing --
  are properties of the scene node. Reach them with list_node_props and
  set_node_prop, passing nodeType "scene" and a null nodeId.`,
  `- capture_view shows you the view as the user sees it. After a change whose
  look matters -- colours, a representation, what is in frame -- capture once
  and check it before you report the change as done. Use the default size for
  an overall check. For detail, first zoom in on the region with center_view
  and then capture; raise longSide only if zooming is not enough, since the
  cost grows with the pixel count.`,
  `- Write a file (export_image, render_image, save_object) only when the user
  asks for one. To see the view yourself, or to show it, use capture_view, which
  saves nothing.`,
  `- You can only do what the tools allow. When a request needs something none
  of them does, say so plainly rather than substituting the nearest tool and
  reporting that instead.`,
]

/**
 * The instructions an MCP client is given when it connects.
 *
 * Unlike the agent, an MCP client is offered every tool at once and has no
 * scene description in front of it, so it is told to look first.
 */
export const MCP_INSTRUCTIONS = `
CueMol is a molecular structure viewer running on the user's desktop. These
tools drive the active scene -- the one in the tab the user is looking at.
Several scenes can be open, one per tab: list_scenes, create_scene, switch_scene
and close_scene manage them, and save_scene / load_file (.qsc) save and open
one.

- Identifiers are opaque integers. Call get_scene_state first and use only the
  ids it or another tool result gives you; after anything that adds, removes
  or retypes a node, call it again rather than reusing an old id.
- Each tool call is one step on CueMol's undo stack.
- File paths are read and written as given; prefer absolute paths.
${TOOL_RULES.join('\n')}

${SELECTION_CHEAT_SHEET}
`.trim()
