/**
 * @file plugins/agent/worker/tools/index.ts
 * @description The tool catalogue, and its OpenAI form.
 *
 * Sorted by name and frozen in that order. The tool list is part of the
 * cached prompt prefix, so a catalogue that reordered itself between turns
 * would miss the cache every time for no benefit.
 *
 * Files here are deliberately NOT named `*.service.ts`: the worker registry
 * globs that pattern across every plugin directory and would try to register
 * a tool module as a service.
 */

import type { FunctionTool } from 'openai/resources/responses/responses'
import { ANALYSIS_TOOLS } from './analysisTools'
import { FILE_TOOLS } from './fileTools'
import { MEASURE_TOOLS } from './measureTools'
import { RENDERER_TOOLS } from './rendererTools'
import { SCENE_TOOLS } from './sceneTools'
import { SELECTION_TOOLS } from './selectionTools'
import type { AgentTool } from './types'

/** Every tool the model may call, by name. */
export const AGENT_TOOLS: readonly AgentTool[] = [
  ...SCENE_TOOLS,
  ...SELECTION_TOOLS,
  ...RENDERER_TOOLS,
  ...FILE_TOOLS,
  ...ANALYSIS_TOOLS,
  ...MEASURE_TOOLS,
].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

/** Lookup by the name the model used. */
export function findTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name)
}

/**
 * The catalogue as the Responses API takes it.
 *
 * `strict: true` makes the API enforce each schema before the call arrives,
 * which is why no tool validates its own argument shape.
 */
export const OPENAI_TOOLS: FunctionTool[] = AGENT_TOOLS.map((tool) => ({
  type: 'function',
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters as unknown as Record<string, unknown>,
  strict: true,
}))
