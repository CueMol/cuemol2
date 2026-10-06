/**
 * @file plugins/console/worker/dialects/native/fromCatalog.ts
 * @description Console commands generated from the core op catalogue.
 *
 * Every op the catalogue exposes to a console becomes a command under its own
 * name (`set_visible`) and under each verb it declares (`show`, `hide`).
 * Nothing here is written per op: the parameters, their order, what Tab
 * offers, and how a typed string becomes the value `run` takes all come from
 * the op's declaration. That is the point of the catalogue -- an op added for
 * the AI agent is a console command the same day, and means the same thing.
 *
 * The values are CueMol's own. A selection is a CueMol selection, passed
 * through unchanged; a colour is whatever CueMol parses; a node is named by
 * its CueMol name (see `refs.ts`).
 */

import { validateSelection } from '@renderer/worker/server/services/select/validateSelection'
import { invokeOp } from '@renderer/worker/server/catalog'
import type { AnyOp, OpContext, OpOutcome, OpVerb } from '@renderer/worker/server/catalog'
import type { AtomSpec, Param, ParamMap } from '@renderer/worker/server/catalog/params'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { resolvePath } from '../../runtime/paths'
import type { ArgCompletion, CmdContext, CmdOutcome, ConsoleCommand, ParamSpec } from '../../runtime/types'
import { formatData } from './formatData'
import { resolveRef } from '@renderer/worker/server/catalog/refs'
import type { RefKind } from '@renderer/worker/server/catalog/refs'

/** The first sentence of a description, for `help`. */
export function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text)
  return m ? m[1] : text
}

/**
 * Parameter names in the order a command reads them positionally: the verb's
 * own order first, then the op's -- except that a node's kind parameter goes
 * last. It is filled in from the node's name, so leaving it in its op
 * position would make the next positional argument land in it
 * (`rename 1crn, mol1` putting `mol1` into the kind). It can still be given
 * by name (`nodeType=renderer`).
 */
function orderedNames(op: AnyOp, verb: OpVerb | undefined): string[] {
  const all = Object.keys(op.params)
  const first = (verb?.order ?? []).filter((n) => all.includes(n))
  const derived = typeParamsOf(op.params as ParamMap)
  const rest = all.filter((n) => !first.includes(n))
  return [...first, ...rest.filter((n) => !derived.has(n)), ...rest.filter((n) => derived.has(n))]
}

/** The enum parameters a node uid fills in when it is resolved by name. */
function typeParamsOf(params: ParamMap): Set<string> {
  const out = new Set<string>()
  for (const p of Object.values(params)) {
    if (p.semantic === 'node' && p.typeParam) out.add(p.typeParam)
  }
  return out
}

/** Drop one layer of matching quotes, which the argument parser keeps. */
function unquote(raw: string): string {
  const t = raw.trim()
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1)
  return t
}

function readBoolean(raw: string): boolean | null {
  const v = raw.toLowerCase()
  if (['true', 'on', 'yes', '1'].includes(v)) return true
  if (['false', 'off', 'no', '0'].includes(v)) return false
  return null
}

/** `A/20/CA A/21/CA` -> two atoms. */
function readAtoms(raw: string): AtomSpec[] | string {
  const out: AtomSpec[] = []
  for (const word of raw.split(/\s+/).filter((w) => w !== '')) {
    const parts = word.split('/')
    if (parts.length !== 3 || parts.some((p) => p === '')) {
      return `"${word}" is not an atom; write each as chain/residue/atom, e.g. A/20/CA`
    }
    out.push({ chain: parts[0], resid: parts[1], atomName: parts[2] })
  }
  return out
}

const REF_KIND: Readonly<Record<string, RefKind>> = {
  object: 'object',
  molecule: 'molecule',
  renderer: 'renderer',
  node: 'node',
}

/**
 * One typed argument read into its parameter's type.
 *
 * @returns the value, or the reason it cannot be one.
 */
function readArg(
  ctx: WorkerContext,
  cc: CmdContext,
  name: string,
  p: Param<unknown>,
  raw: string,
): { value: unknown } | string {
  const text = unquote(raw)
  const refKind = p.semantic ? REF_KIND[p.semantic] : undefined
  if (refKind) {
    const ref = resolveRef(ctx, cc.sceneId, text, refKind)
    return ref.ok ? { value: ref.node.id } : `${name}: ${ref.error}`
  }
  switch (p.kind) {
    case 'boolean': {
      const b = readBoolean(text)
      return b === null ? `${name} must be true or false, not "${text}"` : { value: b }
    }
    case 'integer': {
      const n = Number(text)
      return Number.isInteger(n) ? { value: n } : `${name} must be a whole number, not "${text}"`
    }
    case 'real': {
      const n = Number(text)
      return text !== '' && Number.isFinite(n) ? { value: n } : `${name} must be a number, not "${text}"`
    }
    case 'enum':
      return p.values?.includes(text)
        ? { value: text }
        : `${name} must be one of ${(p.values ?? []).join(', ')}, not "${text}"`
    case 'atoms': {
      const list = readAtoms(text)
      return typeof list === 'string' ? list : { value: list }
    }
    case 'vec3': {
      // Written `x y z`: a comma would end the argument.
      const v = text.split(/\s+/).filter((w) => w !== '').map(Number)
      return v.length === 3 && v.every(Number.isFinite)
        ? { value: v }
        : `${name} must be three numbers, x y z, not "${text}"`
    }
    default:
      break
  }
  if (p.semantic === 'path') return { value: resolvePath(cc.cwd, text) }
  if (p.semantic === 'selection' && text !== '') {
    // Checked here rather than left to the op, so a typo is reported as a
    // typo before anything has been changed.
    const valid = validateSelection(ctx, { selStr: text, sceneId: cc.sceneId })
    if (!valid.ok) return `${name}: "${text}" is not a valid selection`
  }
  return { value: text }
}

/**
 * The bound strings of one command line read into the arguments `run` takes.
 *
 * A node parameter named by name also fills in the parameter that says what
 * kind of node it is, unless the user gave that one. A node left out of a
 * parameter that can address the scene addresses the scene.
 */
export function readConsoleArgs(
  ctx: WorkerContext,
  cc: CmdContext,
  op: AnyOp,
  bound: Readonly<Record<string, string>>,
  verb?: OpVerb,
): Record<string, unknown> | string {
  const params = op.params as ParamMap
  const fixed = verb?.fixed ?? {}
  const defaults = verb?.defaults ?? {}
  const out: Record<string, unknown> = {}
  const derived: Record<string, string> = {}

  for (const [name, p] of Object.entries(params)) {
    if (name in fixed) {
      out[name] = fixed[name]
      continue
    }
    if (p.semantic !== 'node' || !p.typeParam) continue
    const raw = (bound[name] ?? '').trim()
    const typeParam = params[p.typeParam]
    if (raw === '') {
      if (typeParam?.values?.includes('scene')) derived[p.typeParam] = 'scene'
      out[name] = null
      continue
    }
    const ref = resolveRef(ctx, cc.sceneId, unquote(raw), 'node')
    if (!ref.ok) return `${name}: ${ref.error}`
    out[name] = ref.node.id
    // A group is a renderer to the ops that do not tell them apart.
    const kind = typeParam?.values?.includes(ref.node.type) ? ref.node.type : 'renderer'
    derived[p.typeParam] = kind
  }

  for (const [name, p] of Object.entries(params)) {
    if (name in out) continue
    let raw = (bound[name] ?? '').trim()
    if (raw === '' && derived[name] !== undefined) raw = derived[name]
    if (raw === '' && defaults[name] !== undefined) raw = defaults[name]
    if (raw === '') {
      if (p.optional) {
        out[name] = null
        continue
      }
      // A required string may be empty on purpose (`select 1crn, ""` clears
      // the selection); anything else has nothing to read.
      if (p.kind !== 'string') return `missing ${name}`
    }
    const read = readArg(ctx, cc, name, p, raw)
    if (typeof read === 'string') return read
    out[name] = read.value
  }
  return out
}

/** What an op needs from the console line it runs for. */
function opContextOf(cc: CmdContext): OpContext {
  return {
    sceneId: cc.sceneId,
    viewId: cc.viewId,
    callId: cc.streamId('call'),
    markMutated: () => cc.markMutated(),
    noteStream: (reqId) => cc.noteStream(reqId),
    streamId: (tag) => cc.streamId(tag),
    openScene: (filePath) => cc.openScene(filePath),
  }
}

/** Print a successful result: the op's own way, or the generic layout. */
function printOutcome(op: AnyOp, outcome: Extract<OpOutcome, { ok: true }>, cc: CmdContext): void {
  if (outcome.data === undefined) return
  const lines = op.format ? op.format(outcome.data) : formatData(outcome.data)
  for (const line of lines) cc.print(line)
}

/**
 * The completion source for one parameter, by its semantic kind.
 *
 * @param objectIndex - the position of the op's object parameter, for a
 *   source whose candidates depend on it (renderer types); -1 when none.
 */
function completionOf(
  p: Param<unknown>,
  last: boolean,
  objectIndex: number,
  nodeIndex: number,
  propIndex: number,
  pathIndex: number,
  rendererIndex: number,
): ArgCompletion | null {
  const suffix = last ? '' : ', '
  if (p.kind === 'enum' && p.values) {
    return { source: `enum:${p.values.join('|')}`, description: 'value', suffix }
  }
  if (p.kind === 'boolean') return { source: 'enum:true|false', description: 'value', suffix }
  switch (p.semantic) {
    case 'object':
    case 'molecule':
      return { source: 'objects', description: 'object', suffix }
    case 'renderer':
      return { source: 'renderers', description: 'renderer', suffix }
    case 'node':
      return { source: 'nodes', description: 'node', suffix }
    case 'selection':
      return { source: 'selections', description: 'selection', suffix: '' }
    case 'color':
      return { source: 'colors', description: 'color', suffix }
    case 'rendererType':
      // Created on an object: what that object can show. Changed on a
      // renderer: what that renderer can become.
      return objectIndex < 0 && rendererIndex >= 0
        ? { source: `rendererChangeTypes:${rendererIndex}`, description: 'renderer type', suffix }
        : { source: `rendererTypes:${objectIndex}`, description: 'renderer type', suffix }
    case 'propName':
      return { source: `props:${nodeIndex}`, description: 'property', suffix }
    case 'propValue':
      return propIndex >= 0
        ? { source: `propValues:${propIndex}:${nodeIndex}`, description: 'value', suffix }
        : { source: `pathValues:${pathIndex}`, description: 'value', suffix }
    case 'propPath':
      // No separator: a node completes to `name.` and the path goes on.
      return { source: 'propPath', description: 'property', suffix: '' }
    case 'path':
      // Null falls back to filename completion.
      return null
    default:
      // Free text (a name, a chain, a property) has nothing to offer, and
      // listing files for it would only mislead.
      return { source: 'none', description: 'value', suffix }
  }
}

/** One command for an op, under its name or one of its verbs. */
function opCommand(op: AnyOp, verb?: OpVerb): ConsoleCommand {
  const params = op.params as ParamMap
  const fixed = verb?.fixed ?? {}
  const defaults = verb?.defaults ?? {}
  const derivable = typeParamsOf(params)
  const names = orderedNames(op, verb).filter((n) => !(n in fixed))

  const specs: ParamSpec[] = names.map((n) => {
    const p = params[n]
    const optional = p.optional || derivable.has(n) || defaults[n] !== undefined
    return optional ? { name: n, default: '' } : { name: n }
  })

  return {
    name: verb?.verb ?? op.name,
    params: specs,
    mode: 'strict',
    mutates: op.mutates,
    summary: verb?.summary ?? firstSentence(op.description),
    completions: names.map((n, i) =>
      completionOf(
        params[n],
        i === names.length - 1,
        names.findIndex((m) => params[m].semantic === 'object' || params[m].semantic === 'molecule'),
        names.findIndex((m) => params[m].semantic === 'node'),
        names.findIndex((m) => params[m].semantic === 'propName'),
        names.findIndex((m) => params[m].semantic === 'propPath'),
        names.findIndex((m) => params[m].semantic === 'renderer'),
      ),
    ),
    ...(op.outsideTxn ? { outsideTxn: (bound: Record<string, string>) => op.outsideTxn?.(bound) ?? false } : {}),
    async run(ctx, bound, cc): Promise<CmdOutcome> {
      const args = readConsoleArgs(ctx, cc, op, bound, verb)
      if (typeof args === 'string') return { ok: false, error: `Error: ${args}` }
      const outcome = await invokeOp(op, ctx, args, opContextOf(cc))
      if (!outcome.ok) return { ok: false, error: `Error: ${outcome.error}` }
      printOutcome(op, outcome, cc)
      return { ok: true }
    },
  }
}

/** What `help <command>` adds for a generated command: the op it runs. */
export interface CommandOrigin {
  op: AnyOp
  verb?: OpVerb
}

/**
 * Every command the catalogue's console ops make, with the op each came from.
 */
export function catalogCommands(ops: readonly AnyOp[]): { command: ConsoleCommand; origin: CommandOrigin }[] {
  const out: { command: ConsoleCommand; origin: CommandOrigin }[] = []
  for (const op of ops) {
    out.push({ command: opCommand(op), origin: { op } })
    for (const verb of op.verbs ?? []) {
      out.push({ command: opCommand(op, verb), origin: { op, verb } })
    }
  }
  return out
}
