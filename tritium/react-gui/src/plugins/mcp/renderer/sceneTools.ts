/**
 * @file plugins/mcp/renderer/sceneTools.ts
 * @description The MCP tools that manage scenes as tabs: list, make, switch
 * to and close them.
 *
 * Every other tool is an op and runs in the worker, against the active tab's
 * scene. A tab is the window's, so these are answered here, from the tab
 * strip (`useSceneTabs`), and never reach the worker. Their results have the
 * same JSON shape as an op's (`{ ok, result }` / `{ ok, error }`).
 *
 * Closing never shows the save prompt: the client may be driving CueMol with
 * nobody at the window. A scene with unsaved changes is closed only when the
 * call says to discard them.
 */

import { useMemo } from 'react'
import { useSceneTabs } from '@renderer/plugin-host/api'
import type { SceneTabs } from '@renderer/plugin-host/api'
import type { McpCallResult, McpToolDecl } from '../shared/mcpTypes'

/** A strict object schema, as the op catalogue writes them. */
function schema(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

const SCENE_ID = {
  type: ['integer', 'null'],
  description: 'The scene, by the sceneId list_scenes gives. Null is the active scene.',
}

export const SCENE_TOOLS: readonly McpToolDecl[] = [
  {
    name: 'list_scenes',
    description:
      'List the scenes open in CueMol (each is shown in one or more tabs), in tab order. ' +
      'Every other tool works on the active one.',
    inputSchema: schema({}),
  },
  {
    name: 'new_scene',
    description:
      'Open a new empty scene in a tab of its own and make it the active scene, so the tools ' +
      'that follow work on it. Use it to keep separate work apart; loading into the current ' +
      'scene does not need it.',
    inputSchema: schema({
      name: { type: ['string', 'null'], description: 'Name of the scene. Null uses the next default name.' },
    }),
  },
  {
    name: 'switch_scene',
    description: 'Make an open scene the active one (bring its tab to the front).',
    inputSchema: schema({
      sceneId: { type: 'integer', description: 'The scene, by the sceneId list_scenes gives.' },
    }),
  },
  {
    name: 'close_scene',
    description:
      'Close a scene and its tabs. Refuses a scene with unsaved changes unless discardChanges ' +
      'is true; ask the user before discarding, or save it first with save_scene.',
    inputSchema: schema({
      sceneId: SCENE_ID,
      discardChanges: { type: ['boolean', 'null'], description: 'Close even with unsaved changes. Null is false.' },
    }),
  },
]

const NAMES = new Set(SCENE_TOOLS.map((t) => t.name))

function done(result: unknown): McpCallResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, result }) }], isError: false }
}

function refused(error: string): McpCallResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error }) }], isError: true }
}

/** Carry out one scene tool call. */
export async function callSceneTool(
  tabs: SceneTabs,
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  if (name === 'new_scene') {
    const made = await tabs.create(typeof args.name === 'string' && args.name !== '' ? args.name : undefined)
    return made ? done({ sceneId: made.sceneId, name: made.name, active: true }) : refused('The scene could not be made.')
  }

  const list = await tabs.list()
  if (name === 'list_scenes') {
    return done(list.map((s) => ({ sceneId: s.sceneId, name: s.name, active: s.active, modified: s.modified, tabs: s.viewIds.length })))
  }

  const id = typeof args.sceneId === 'number' ? args.sceneId : null
  const scene = id === null ? list.find((s) => s.active) : list.find((s) => s.sceneId === id)
  if (!scene) return refused(id === null ? 'No scene is active.' : `No open scene has sceneId ${id}; call list_scenes.`)

  if (name === 'switch_scene') {
    await tabs.activate(scene.sceneId)
    return done({ sceneId: scene.sceneId, name: scene.name, active: true })
  }

  if (scene.modified && args.discardChanges !== true) {
    return refused(`Scene ${scene.name} (${scene.sceneId}) has unsaved changes. Save it with save_scene, or ask the user before closing it with discardChanges true.`)
  }
  if (!(await tabs.close(scene.sceneId))) return refused(`Scene ${scene.name} could not be closed.`)
  return done({ closed: scene.sceneId })
}

/** The scene tools, bound to the tab strip; `call` returns null for any other tool. */
export function useSceneTools(): {
  call: (name: string, args: Record<string, unknown>) => Promise<McpCallResult> | null
} {
  const tabs = useSceneTabs()
  return useMemo(
    () => ({ call: (name, args) => (NAMES.has(name) ? callSceneTool(tabs, name, args) : null) }),
    [tabs],
  )
}
