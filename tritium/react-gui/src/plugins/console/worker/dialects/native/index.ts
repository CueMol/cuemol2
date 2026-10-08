/**
 * @file plugins/console/worker/dialects/native/index.ts
 * @description The native dialect: CueMol's own command language.
 *
 * Its scene commands are not written here. They are generated from the core
 * op catalogue (`fromCatalog.ts`), the same declarations the AI agent hands a
 * model as tools, so a command and a tool of the same name do the same thing
 * with the same arguments. What is written here is only what belongs to the
 * console itself (`builtins.ts`) and `help`.
 *
 * Arguments are separated by commas, as in the PyMOL dialect, because a
 * CueMol selection has spaces in it: `zoom 1crn, chain A and resid 10:20`.
 */

import { getSelDefs } from '@renderer/worker/server/services/select/getSelDefs'
import { getNewRendererOptions } from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { getRendererChangeTypes } from '@renderer/worker/server/services/rend/getRendererChangeTypes'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { CONSOLE_COMMAND_OPS } from '@renderer/worker/server/catalog'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { DIALECT_PROMPTS } from '../../../shared/consoleTypes'
import { usageLine } from '../../parser/bindArgs'
import { lookupCommand } from '../../parser/commandLookup'
import type { ConsoleCommand, ConsoleDialect, SourceContext } from '../../runtime/types'
import { NATIVE_BUILTINS, NATIVE_SCRIPT_EXT } from './builtins'
import { catalogCommands } from './fromCatalog'
import type { CommandOrigin } from './fromCatalog'
import { nodePath, resolvePropPath, resolveRef, sceneNodes } from '@renderer/worker/server/catalog/refs'

const GENERATED = catalogCommands(CONSOLE_COMMAND_OPS)

/** The op each generated command runs, for `help`. */
const ORIGINS = new Map<string, CommandOrigin>(GENERATED.map((g) => [g.command.name, g.origin]))

/** Wrap prose to the transcript's width. */
function wrap(text: string, width = 76): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line !== '' && line.length + word.length + 1 > width) {
      out.push(line)
      line = word
    } else {
      line = line === '' ? word : `${line} ${word}`
    }
  }
  if (line !== '') out.push(line)
  return out
}

const help: ConsoleCommand = {
  name: 'help',
  params: [{ name: 'command', default: '' }],
  mode: 'strict',
  mutates: false,
  summary: 'List the commands, or explain one.',
  completions: [{ source: 'commands', description: 'command', suffix: '' }],
  run(_ctx, args, cc) {
    const topic = args.command.trim()
    if (topic === '') {
      cc.print('Commands:')
      for (const c of NATIVE_COMMANDS) cc.print(`  ${c.name.padEnd(22)} ${c.summary}`)
      cc.print('')
      cc.print('Type "help <command>" or "<command> ?" for its arguments.')
      cc.print('Separate arguments with commas: zoom 1crn, chain A and resid 10:20')
      cc.print('Name a renderer as object/renderer (1crn/cartoon1), or any node by #uid.')
      cc.print('A property follows its node after a dot: set 1crn/cartoon1.width, 2')
      return { ok: true }
    }
    const found = lookupCommand(topic, NATIVE_COMMANDS.map((c) => c.name))
    if (found.kind === 'ambiguous') {
      return { ok: false, error: `Error: ambiguous command: ${found.candidates.join(', ')}` }
    }
    const cmd = found.kind === 'found' ? NATIVE_COMMANDS.find((c) => c.name === found.name) : undefined
    if (!cmd) return { ok: false, error: `Error: unknown command: "${topic}"` }
    cc.print(usageLine(cmd.name, cmd.params))
    const origin = ORIGINS.get(cmd.name)
    if (!origin) {
      cc.print(cmd.summary)
      return { ok: true }
    }
    for (const line of wrap(origin.op.description)) cc.print(line)
    if (origin.alias?.fixed) {
      const fixed = Object.entries(origin.alias.fixed).map(([k, v]) => `${k}=${String(v)}`).join(', ')
      cc.print(`(${origin.op.name} with ${fixed})`)
    } else if (origin.alias) {
      cc.print(`(the same as ${origin.op.name})`)
    }
    return { ok: true }
  },
}

/** Every native command, sorted by name. */
const NATIVE_COMMANDS: readonly ConsoleCommand[] = [
  ...GENERATED.map((g) => g.command),
  ...NATIVE_BUILTINS,
  help,
].sort((a, b) => a.name.localeCompare(b.name))

/** The names of the open scenes, for the scene commands. */
function sceneNames(ctx: WorkerContext): string[] {
  const out: string[] = []
  for (const uid of ctx.sceMgr.getSceneUIDList().split(',')) {
    const scene = uid.trim() === '' ? null : getSceneOrNull(ctx, Number(uid))
    if (scene?.name) out.push(scene.name)
  }
  return [...new Set(out)]
}

/** Colour names the scene and the application define. */
function colorNames(ctx: WorkerContext, sceneId: number): string[] {
  const out: string[] = []
  for (const scope of [0, sceneId]) {
    try {
      out.push(...(JSON.parse(ctx.styleMgr.getColorDefsJSON(scope)) as string[]))
    } catch {
      // A scope with no definitions; nothing to add.
    }
  }
  return [...new Set(out)]
}

/**
 * The writable properties of the node typed at `nodeIndex`, or of the scene
 * when that argument is not typed yet (`set` puts the node last).
 */
function propEntries(ctx: WorkerContext, sc: SourceContext, nodeIndex: number): GenericPropEntry[] {
  const nodeText = nodeIndex >= 0 ? (sc.argsSoFar[nodeIndex] ?? '').trim() : ''
  let target = { nodeId: sc.sceneId, nodeType: 'scene' as 'scene' | 'object' | 'renderer' }
  if (nodeText !== '') {
    const ref = resolveRef(ctx, sc.sceneId, nodeText, 'node')
    if (!ref.ok) return []
    target = { nodeId: ref.node.id, nodeType: ref.node.type === 'object' ? 'object' : 'renderer' }
  }
  const props = getGenericProps(ctx, { sceneId: sc.sceneId, ...target })
  return props.ok ? props.entries.filter((e) => !e.isContainer && !e.readonly) : []
}

/** The writable properties of one node, by uid and kind. */
function writableProps(
  ctx: WorkerContext,
  sceneId: number,
  nodeId: number,
  nodeType: 'scene' | 'object' | 'renderer',
): GenericPropEntry[] {
  const props = getGenericProps(ctx, { sceneId, nodeId, nodeType })
  return props.ok ? props.entries.filter((e) => !e.isContainer && !e.readonly) : []
}

/**
 * The level of a property path the pattern is at. At the top: the scene's
 * properties, and each object twice -- `obj.` for its own properties and
 * `obj/` for its renderers. After `obj/`: its renderers as `obj/rend.`. After
 * a node and a dot: that node's properties. A node is offered ending in its
 * separator so Tab can be pressed again to go down.
 */
function propPathCandidates(ctx: WorkerContext, sc: SourceContext): string[] {
  const nodes = sceneNodes(ctx, sc.sceneId)
  const slash = sc.pattern.indexOf('/')
  if (slash >= 0 && sc.pattern.indexOf('.', slash) < 0) {
    const objName = sc.pattern.slice(0, slash)
    return nodes
      .filter((n) => n.type !== 'object' && n.objName === objName)
      .map((n) => `${objName}/${n.name}.`)
  }
  const target = resolvePropPath(ctx, sc.sceneId, sc.pattern === '' ? '_' : sc.pattern)
  if (!target.ok) return []
  const typedProp = sc.pattern === '' ? '' : target.prop
  const prefix = sc.pattern.slice(0, sc.pattern.length - typedProp.length)
  const out = writableProps(ctx, sc.sceneId, target.nodeId, target.nodeType).map((e) => `${prefix}${e.key}`)
  if (target.nodeType === 'scene') {
    for (const n of nodes) {
      if (n.type !== 'object' || n.name === '') continue
      out.push(`${n.name}.`)
      if (nodes.some((r) => r.type !== 'object' && r.objName === n.name)) out.push(`${n.name}/`)
    }
  }
  return out
}

/** The candidates for one source id, read fresh on every Tab. */
function candidates(id: string, ctx: WorkerContext, sc: SourceContext): string[] | null {
  if (id === 'commands') return NATIVE_COMMANDS.map((c) => c.name)
  if (id === 'none') return []
  if (id === 'scenes') return sceneNames(ctx)
  if (id.startsWith('enum:')) return id.slice('enum:'.length).split('|')

  const hasScene = sc.sceneId > 0 && getSceneOrNull(ctx, sc.sceneId) !== null
  if (!hasScene) return id === 'colors' ? colorNames(ctx, 0) : []
  const nodes = sceneNodes(ctx, sc.sceneId)
  switch (id) {
    case 'objects':
      return nodes.filter((n) => n.type === 'object' && n.name !== '').map(nodePath)
    case 'renderers':
      return nodes.filter((n) => n.type !== 'object').map(nodePath)
    case 'nodes':
      return nodes.filter((n) => n.name !== '').map(nodePath)
    case 'selections':
      return getSelDefs(ctx, { sceneId: sc.sceneId }).scene
    case 'colors':
      return colorNames(ctx, sc.sceneId)
    default:
      break
  }
  if (id === 'propPath') return propPathCandidates(ctx, sc)
  if (id.startsWith('pathValues:')) {
    const path = (sc.argsSoFar[Number(id.slice('pathValues:'.length))] ?? '').trim()
    const target = resolvePropPath(ctx, sc.sceneId, path)
    if (!target.ok) return []
    const entry = writableProps(ctx, sc.sceneId, target.nodeId, target.nodeType).find((e) => e.key === target.prop)
    if (!entry) return []
    if (entry.enumdef && entry.enumdef.length > 0) return [...entry.enumdef]
    return entry.type === 'boolean' ? ['true', 'false'] : []
  }
  if (id.startsWith('props:')) {
    return propEntries(ctx, sc, Number(id.slice('props:'.length))).map((e) => e.key)
  }
  if (id.startsWith('propValues:')) {
    // The values a property takes, where they are a closed set: an enum's
    // choices, or on/off. Anything open (a number, a name) has nothing to offer.
    const [propAt, nodeAt] = id.slice('propValues:'.length).split(':').map(Number)
    const name = (sc.argsSoFar[propAt] ?? '').trim()
    const entry = propEntries(ctx, sc, nodeAt).find((e) => e.key === name)
    if (!entry) return []
    if (entry.enumdef && entry.enumdef.length > 0) return [...entry.enumdef]
    return entry.type === 'boolean' ? ['true', 'false'] : []
  }
  if (id.startsWith('rendererChangeTypes:')) {
    const rendText = sc.argsSoFar[Number(id.slice('rendererChangeTypes:'.length))] ?? ''
    const ref = resolveRef(ctx, sc.sceneId, rendText, 'renderer')
    return ref.ok ? getRendererChangeTypes(ctx, { sceneId: sc.sceneId, rendId: ref.node.id }).typeNames : []
  }
  if (id.startsWith('rendererTypes:')) {
    // The types an object can be drawn as depend on the object, so they are
    // read from the object argument typed before this one.
    const at = Number(id.slice('rendererTypes:'.length))
    const objText = at >= 0 ? sc.argsSoFar[at] : undefined
    if (!objText) return []
    const ref = resolveRef(ctx, sc.sceneId, objText, 'object')
    if (!ref.ok) return []
    const opts = getNewRendererOptions(ctx, {
      sceneId: sc.sceneId,
      sourceNodeId: ref.node.id,
      sourceNodeType: 'object',
    })
    return opts.ok ? opts.rendererTypes : []
  }
  return null
}

export const NATIVE_DIALECT: ConsoleDialect = {
  id: 'native',
  prompt: DIALECT_PROMPTS.native,
  txnPrefix: 'cmd: ',
  commands: () => NATIVE_COMMANDS,
  refuseLine: (cmd) =>
    cmd.python ? 'Error: a line starting with "/" is Python, which this console does not run' : null,
  refuseScript: (filePath) => {
    if (/\.pml$/i.test(filePath)) {
      return `Error: ${filePath} is a PyMOL script; switch the console to the PyMOL dialect to run it`
    }
    if (/\.(py|pym)$/i.test(filePath)) return `Error: ${filePath} is a Python script, which this console does not run`
    return null
  },
  candidates,
}

export { NATIVE_SCRIPT_EXT }
