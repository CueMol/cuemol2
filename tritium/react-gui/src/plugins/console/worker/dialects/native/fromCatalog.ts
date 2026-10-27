/**
 * @file plugins/console/worker/dialects/native/fromCatalog.ts
 * @description Console commands generated from the core op catalogue.
 *
 * Every op the catalogue exposes to a console becomes a command under its own
 * name (`set_visible`) and under each alias it declares (`show`, `hide`).
 * Nothing here is written per op: the parameters, their order, what Tab
 * offers, and how a typed string becomes the value `run` takes all come from
 * the op's declaration. That is the point of the catalogue -- an op added for
 * the AI agent is a console command the same day, and means the same thing.
 *
 * The values are CueMol's own. A selection is a CueMol selection, passed
 * through unchanged; a colour is whatever CueMol parses; a node is named by
 * its CueMol name (see `refs.ts`).
 */

import { invokeOp } from '@renderer/worker/server/catalog'
import type { AnyOp, OpOutcome, OpAlias, OpTable } from '@renderer/worker/server/catalog'
import type { AtomSpec, Param, ParamMap } from '@renderer/worker/server/catalog/params'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { readPathList, resolvePath, splitPathWords } from '../../runtime/paths'
import type { PathWord } from '../../runtime/paths'
import { SCENE_FILE_RE } from '@renderer/worker/server/catalog/fileLoad'
import type { ArgCompletion, CmdContext, CmdOutcome, ConsoleCommand, ParamSpec } from '../../runtime/types'
import { formatData } from './formatData'
import { table } from '../../help/helpMarkdown'
import { opContextOf } from '../../runtime/opContext'
import { checkArg, parseBoolText, parseNumberText } from '@renderer/worker/server/catalog/argValues'
import { expandPropPath, isWildcardRef, nodePath, resolveRef, resolveRefs } from '@renderer/worker/server/catalog/refs'
import type { SceneNodeEntry } from '@renderer/worker/server/catalog/refs'
import type { RefKind } from '@renderer/worker/server/catalog/refs'

/** The first sentence of a description, for `help`. */
function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text)
  return m ? m[1] : text
}

/**
 * Parameter names in the order a command reads them positionally: the alias's
 * own order first, then the op's -- except that a node's kind parameter goes
 * last. It is filled in from the node's name, so leaving it in its op
 * position would make the next positional argument land in it
 * (`rename 1crn, mol1` putting `mol1` into the kind). It can still be given
 * by name (`nodeType=renderer`).
 */
function orderedNames(op: AnyOp, alias: OpAlias | undefined): string[] {
  const all = Object.keys(op.params)
  const first = (alias?.order ?? []).filter((n) => all.includes(n))
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

/** `A.20.CA A.21.CA` -> two atoms. */
function readAtoms(raw: string): AtomSpec[] | string {
  const out: AtomSpec[] = []
  for (const word of raw.split(/\s+/).filter((w) => w !== '')) {
    const parts = word.split('.')
    if (parts.length !== 3 || parts.some((p) => p === '')) {
      return `"${word}" is not an atom; write each as chain.residue.atom, e.g. A.20.CA`
    }
    out.push({ chain: parts[0], resid: parts[1], atomName: parts[2] })
  }
  return out
}

const REF_KIND: Readonly<Record<string, RefKind>> = {
  object: 'object',
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
    const ref = resolveRef(ctx, cc.sceneId, text, refKind, p.objClass)
    return ref.ok ? { value: ref.node.id } : `${name}: ${ref.error}`
  }
  if (p.kind === 'atoms') {
    const list = readAtoms(text)
    return typeof list === 'string' ? list : { value: list }
  }
  // Parsed from text here, then checked by the rules a JSON caller meets too.
  const parsed =
    p.kind === 'boolean' ? parseBoolText(text)
    : p.kind === 'integer' || p.kind === 'real' ? parseNumberText(text)
    // Written `x y z`: a comma would end the argument.
    : p.kind === 'vec3' ? text.split(/\s+/).filter((w) => w !== '').map(Number)
    : text
  const bad = checkArg(name, p, parsed)
  if (bad) return `${bad.slice(0, -1)}, not "${text}"`
  if (p.kind !== 'string') return { value: parsed }
  if (p.semantic === 'path') return { value: resolvePath(cc.cwd, text) }
  return { value: text }
}

/**
 * The bound strings of one command line read into the arguments `run` takes.
 *
 * A node parameter named by name also fills in the parameter that says what
 * kind of node it is, unless the user gave that one. A node left out of a
 * parameter that can address the scene addresses the scene.
 */
function readConsoleArgs(
  ctx: WorkerContext,
  cc: CmdContext,
  op: AnyOp,
  bound: Readonly<Record<string, string>>,
  alias?: OpAlias,
): Record<string, unknown> | string {
  const params = op.params as ParamMap
  const fixed = alias?.fixed ?? {}
  const defaults = alias?.defaults ?? {}
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
    if (!ref.ok) {
      // The scene and the view have no id: their type word names them
      // (props view), unless a node has that name.
      if ((raw === 'scene' || raw === 'view') && typeParam?.values?.includes(raw)) {
        derived[p.typeParam] = raw
        out[name] = null
        continue
      }
      return `${name}: ${ref.error}`
    }
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

/**
 * Whether a parameter is the file a load opens. It takes a list of paths
 * (`runtime/paths.ts`), patterns included, and the load runs once per file;
 * a file to write takes one path, since writing several makes no sense.
 */
function opensFiles(op: AnyOp, name: string): boolean {
  return name === 'path' && op.name.startsWith('load') && (op.params as ParamMap)[name]?.semantic === 'path'
}

/**
 * The files a load's path list names: a lone path as the argument it
 * replaces (escapes removed), or a fan over the files when there are several
 * or a pattern. A scene file named by a pattern or among others is warned
 * about and left out: a scene opens outside the undo transaction
 * (`outsideTxn`), which only a lone path can ask for.
 */
function fileTargets(cc: CmdContext, param: string, text: string): { lone: string } | Fan {
  const list = readPathList(cc.cwd, text)
  for (const u of list.unmatched) cc.warn(`no matches found: ${u}`)
  if (!list.glob && list.files.length === 1) return { lone: list.files[0] }
  const files = list.files.filter((f) => {
    if (!SCENE_FILE_RE.test(f)) return true
    cc.warn(`${f}: a scene file opens on its own; load it by its name alone`)
    return false
  })
  return { param, targets: files.map((f) => ({ text: f, label: f })) }
}

/** How a pattern's run names its node: by path, by type too when it has no name (`1crn/@*selection`). */
function labelOf(n: SceneNodeEntry): string {
  return n.name === '' && n.typeName ? `${nodePath(n)}@${n.typeName}` : nodePath(n)
}

/** The targets one argument names: the command runs once for each. */
interface Fan {
  param: string
  /** What the argument becomes for each run (`#12`, `#12.width`, a file), and how that run is named in output. */
  targets: { text: string; label: string }[]
}

type Target = Fan['targets'][number]

/**
 * The nodes one word of a node or property-path list stands for when it is a
 * pattern (`refs.ts`); null when it is a plain path, read as typed.
 */
function expandWord(ctx: WorkerContext, cc: CmdContext, p: Param<unknown>, w: PathWord): Target[] | null | string {
  if (p.semantic === 'propPath') {
    const ex = expandPropPath(ctx, cc.sceneId, w.pattern)
    if (ex === null) return null
    if (!ex.ok) return ex.error
    return ex.targets.map((t) => ({ text: t.path, label: `${labelOf(t.node)}.${t.prop}` }))
  }
  const kind = p.semantic ? REF_KIND[p.semantic] : undefined
  if (!kind || !isWildcardRef(w.pattern)) return null
  const res = resolveRefs(ctx, cc.sceneId, w.pattern, kind, p.objClass)
  if (!res.ok) return res.error
  return res.nodes.map((n) => ({ text: `#${n.id}`, label: labelOf(n) }))
}

/**
 * What a node or property-path argument names, read as a list of words
 * (`runtime/paths.ts`): a lone plain path as the argument it replaces, or a
 * fan over every node the words name, patterns expanded. A pattern that
 * matches nothing is warned about.
 */
function refTargets(ctx: WorkerContext, cc: CmdContext, name: string, p: Param<unknown>, text: string): { lone: string } | Fan | string {
  const words = splitPathWords(text)
  if (words.length === 0) return { lone: '' }
  const targets: Target[] = []
  for (const w of words) {
    const many = expandWord(ctx, cc, p, w)
    if (typeof many === 'string') return `${name}: ${many}`
    if (many === null) {
      if (words.length === 1) return { lone: w.value }
      targets.push({ text: w.value, label: w.value })
      continue
    }
    if (many.length === 0) cc.warn(`no matches found: ${w.raw}`)
    targets.push(...many)
  }
  return { param: name, targets }
}

/**
 * The bound strings with every list argument read: a lone value in place of
 * its text, and the one argument that names several targets, if any. Only
 * one argument may: two would mean every pair, which nobody wants by
 * accident.
 *
 * @param filesParam - the parameter holding the files a load opens, if any
 */
function readTargets(
  ctx: WorkerContext,
  cc: CmdContext,
  op: AnyOp,
  bound: Readonly<Record<string, string>>,
  filesParam: string | null,
  alias?: OpAlias,
): { line: Record<string, string>; fan: Fan | null } | string {
  const fixed = alias?.fixed ?? {}
  const line: Record<string, string> = { ...bound }
  const fans: Fan[] = []
  for (const [name, p] of Object.entries(op.params as ParamMap)) {
    const text = (bound[name] ?? '').trim()
    if (name in fixed || text === '') continue
    const isRef = p.semantic === 'propPath' || (p.semantic !== undefined && REF_KIND[p.semantic] !== undefined)
    if (name !== filesParam && !isRef) continue
    const read = name === filesParam ? fileTargets(cc, name, text) : refTargets(ctx, cc, name, p, text)
    if (typeof read === 'string') return read
    if ('lone' in read) line[name] = read.lone
    else fans.push(read)
  }
  if (fans.length > 1) return `only one argument may name several targets, not ${fans.map((f) => f.param).join(' and ')}`
  return { line, fan: fans[0] ?? null }
}

/** What an op needs from the console line it runs for. */
/** Text for a Markdown table cell, shown as typed: emphasis and code marks escaped. */
function mdText(text: string): string {
  return text.replace(/[\\`*_]/g, '\\$&')
}

/** An op's table as Markdown: its title in bold, then the table. */
function tableMarkdown(t: OpTable): string {
  const body = table(t.head, t.rows.map((r) => r.map(mdText)))
  return t.title ? `**${mdText(t.title)}**\n\n${body}` : body
}

/**
 * The tables of a run over several targets as one: rows in run order, each
 * after a column naming its target unless the table's first column does
 * already (`OpTable.keyed`). Tables of another shape stay apart.
 */
function mergeTables(runs: readonly { label: string; table: OpTable }[]): OpTable[] {
  const first = runs[0].table
  if (!runs.every((r) => r.table.head.join('\0') === first.head.join('\0'))) return runs.map((r) => ({ ...r.table, title: r.label }))
  if (first.keyed) return [{ head: first.head, rows: runs.flatMap((r) => r.table.rows) }]
  return [{ head: ['Target', ...first.head], rows: runs.flatMap((r) => r.table.rows.map((row) => [r.label, ...row])) }]
}

/**
 * Print a successful result: the op's own way, or the generic layout.
 *
 * @param heading - printed first, when there is anything to print (the node
 *   a pattern's run was for)
 */
function printOutcome(op: AnyOp, outcome: Extract<OpOutcome, { ok: true }>, cc: CmdContext, heading?: string): void {
  if (outcome.data === undefined) return
  if (op.table) {
    cc.printMarkdown(tableMarkdown(op.table(outcome.data)))
    return
  }
  const lines = op.format ? op.format(outcome.data) : formatData(outcome.data)
  if (heading !== undefined && lines.length > 0) cc.print(heading)
  for (const line of lines) cc.print(line)
}

/** The parameters a completion source reads, by their role. */
interface RelatedParams {
  object: string | null
  node: string | null
  prop: string | null
  propPath: string | null
  renderer: string | null
  file: string | null
  /** The reader that always reads `file` (a format's load op), or null when it is picked from the file. */
  fileReader: string | null
}

/**
 * Where Tab finds one parameter's values, by its semantic kind. A source that
 * depends on another argument names that parameter; the value typed for it
 * reaches the source by name (`SourceContext.bound`), however it was typed.
 *
 * @param opens - a path a load opens: its readers' files come first
 */
function completionOf(p: Param<unknown>, rel: RelatedParams, opens = false): ArgCompletion | null {
  if (p.kind === 'enum' && p.values) return { source: `enum:${p.values.join('|')}`, description: 'value' }
  if (p.kind === 'boolean') return { source: 'enum:true|false', description: 'value' }
  switch (p.semantic) {
    // Nodes and property paths are lists, and a class narrows the objects.
    case 'object':
      return { source: p.objClass ? `objects:${p.objClass}` : 'objects', description: 'object', list: true }
    case 'renderer':
      return { source: 'renderers', description: 'renderer', list: true }
    case 'node':
      return { source: 'nodes', description: 'node', list: true }
    case 'selection':
      return { source: 'selections', description: 'selection', open: true }
    case 'color':
      return { source: 'colors', description: 'color' }
    case 'rendererType':
      // Created on an object: what that object can show. Changed on a
      // renderer: what that renderer can become. Created with what a file
      // loads (load): what its reader's object can show. With none of
      // those (fetch): what a MolCoord object can show.
      if (rel.object) return { source: `rendererTypes:${rel.object}`, description: 'renderer type' }
      if (rel.renderer) return { source: `rendererChangeTypes:${rel.renderer}`, description: 'renderer type' }
      if (rel.file) return { source: `fileRendererTypes:${rel.file}${rel.fileReader ? `:${rel.fileReader}` : ''}`, description: 'renderer type' }
      return { source: 'molCoordRendererTypes', description: 'renderer type' }
    case 'propName':
      return { source: `props:${rel.node ?? ''}`, description: 'property' }
    case 'propValue':
      return rel.prop
        ? { source: `propValues:${rel.prop}:${rel.node ?? ''}`, description: 'value' }
        : { source: `pathValues:${rel.propPath ?? ''}`, description: 'value' }
    case 'propPath':
      return { source: 'propPath', description: 'property', list: true }
    case 'path':
      return opens ? { source: 'files', description: 'file', files: 'openable', list: true } : { source: 'files', description: 'file' }
    default:
      // Free text (a name, a chain, a property) has nothing to offer, and
      // listing files for it would only mislead.
      return { source: 'none', description: 'value' }
  }
}

/** The first parameter of each role a completion source reads. */
function related(params: ParamMap): RelatedParams {
  const named = (...kinds: string[]) => Object.keys(params).find((n) => kinds.includes(params[n].semantic ?? '')) ?? null
  const file = named('path')
  return {
    object: named('object'),
    node: named('node'),
    prop: named('propName'),
    propPath: named('propPath'),
    renderer: named('renderer'),
    file,
    fileReader: file === null ? null : (params[file].readerName ?? null),
  }
}

/** One command for an op, under its name or one of its aliases. */
function opCommand(op: AnyOp, alias?: OpAlias): ConsoleCommand {
  const params = op.params as ParamMap
  const fixed = alias?.fixed ?? {}
  const defaults = alias?.defaults ?? {}
  const derivable = typeParamsOf(params)
  const names = orderedNames(op, alias).filter((n) => !(n in fixed))
  const filesParam = names.find((n) => opensFiles(op, n)) ?? null
  /**
   * The bound strings as `outsideTxn` reads them: a path list that is one
   * plain path as that path, any other list as no path (a scene in it is
   * not opened; see fileTargets).
   */
  const loneFile = (bound: Record<string, string>): Record<string, string> => {
    if (filesParam === null) return bound
    const words = splitPathWords(bound[filesParam] ?? '')
    return { ...bound, [filesParam]: words.length === 1 && !words[0].glob ? words[0].value : '' }
  }

  const specs: ParamSpec[] = names.map((n) => {
    const p = params[n]
    const optional = p.optional || derivable.has(n) || defaults[n] !== undefined
    return optional ? { name: n, default: '' } : { name: n }
  })

  return {
    name: alias?.name ?? op.name,
    group: op.group,
    params: specs,
    mode: 'strict',
    mutates: op.mutates,
    summary: alias?.summary ?? firstSentence(op.description),
    // The file a load op opens lists what it can open first.
    completions: names.map((n) => completionOf(params[n], related(params), n === filesParam)),
    ...(op.outsideTxn ? { outsideTxn: (bound: Record<string, string>) => op.outsideTxn?.(loneFile(bound)) ?? false } : {}),
    async run(ctx, bound, cc): Promise<CmdOutcome> {
      /** One run of the op; the reason it failed, or null. */
      const runOnce = async (b: Readonly<Record<string, string>>, label?: string): Promise<string | null> => {
        const args = readConsoleArgs(ctx, cc, op, b, alias)
        if (typeof args === 'string') return args
        const outcome = await invokeOp(op, ctx, args, opContextOf(cc, 'call'))
        if (!outcome.ok) return outcome.error
        // A table from a run over several targets waits, to be shown as one.
        if (op.table && label !== undefined && outcome.data !== undefined) tables.push({ label, table: op.table(outcome.data) })
        else printOutcome(op, outcome, cc, label === undefined ? undefined : `${label}:`)
        return null
      }
      const tables: { label: string; table: OpTable }[] = []

      const read = readTargets(ctx, cc, op, bound, filesParam, alias)
      if (typeof read === 'string') return { ok: false, error: `Error: ${read}` }
      const { line, fan } = read
      if (fan === null) {
        const error = await runOnce(line)
        return error === null ? { ok: true } : { ok: false, error: `Error: ${error}` }
      }
      // Several targets (a pattern, or a list) run the op once each. One that
      // fails is reported and the rest still run: the command, and the line,
      // go on.
      for (const t of fan.targets) {
        if (cc.stopped()) break
        const error = await runOnce({ ...line, [fan.param]: t.text }, t.label)
        if (error !== null) cc.warn(`${t.label}: ${error}`)
      }
      if (tables.length > 0) for (const t of mergeTables(tables)) cc.printMarkdown(tableMarkdown(t))
      return { ok: true }
    },
  }
}

/** What `help <command>` adds for a generated command: the op it runs. */
export interface CommandOrigin {
  op: AnyOp
  alias?: OpAlias
}

/**
 * Every command the catalogue's console ops make, with the op each came from.
 */
export function catalogCommands(ops: readonly AnyOp[]): { command: ConsoleCommand; origin: CommandOrigin }[] {
  const out: { command: ConsoleCommand; origin: CommandOrigin }[] = []
  for (const op of ops) {
    out.push({ command: opCommand(op), origin: { op } })
    for (const alias of op.aliases ?? []) {
      out.push({ command: opCommand(op, alias), origin: { op, alias } })
    }
  }
  return out
}
