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
import { closeScene, createScene, listScenes, switchScene, useSceneTabs } from '@renderer/plugin-host/api'
import { mcpErrorResult, mcpOkResult } from '@shared/mcpResult'
import type { NumberedScene, SceneTabs } from '@renderer/plugin-host/api'
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
    name: 'create_scene',
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

/** One scene, as the scene tools report it. */
function sceneJson(s: NumberedScene) {
  return { sceneId: s.sceneId, name: s.name, active: s.active, modified: s.modified, tabs: s.viewIds.length }
}

/** Carry out one scene tool call, through the tab operations the console uses too. */
async function callSceneTool(
  tabs: SceneTabs,
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const id = typeof args.sceneId === 'number' ? args.sceneId : null
  switch (name) {
    case 'list_scenes':
      return mcpOkResult((await listScenes(tabs)).map(sceneJson))
    case 'create_scene': {
      const made = await createScene(tabs, typeof args.name === 'string' ? args.name : null)
      return made.ok ? mcpOkResult({ ...made.data, active: true }) : mcpErrorResult(made.error)
    }
    case 'switch_scene': {
      const res = await switchScene(tabs, id)
      return res.ok ? mcpOkResult(sceneJson(res.data)) : mcpErrorResult(res.error)
    }
    default: {
      const res = await closeScene(tabs, id, args.discardChanges === true)
      return res.ok ? mcpOkResult({ closed: res.data.sceneId }) : mcpErrorResult(res.error)
    }
  }
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
