/**
 * @file plugins/console/shared/dialectMeta.ts
 * @description The dialects the console speaks, and what each says about itself.
 *
 * The one list of dialects. The panel (its switch, prompt, history), the
 * worker (the undo label, the action log's source, which dialect owns a
 * script file) and the command-line client (through `/console/info`) read
 * a dialect's properties from here and nowhere else, so adding or removing
 * a dialect is a row here and its entry in `worker/dialects/index.ts`.
 *
 * Plain data with no imports: the renderer, the worker and main all read it.
 */

/** How the command-line client sends a script file of this kind. */
export type ScriptSubmit = 'text' | 'path'

/** One kind of script file a dialect runs. */
export interface DialectScript {
  /** The extension, lower case with its dot (`.pml`). */
  ext: string
  /**
   * `text`: the client reads the file and submits what it says, in this
   * dialect. `path`: the client sends only the path (`scriptPath`), and the
   * app runs the file itself -- for a file that is not command lines (qax).
   */
  submit: ScriptSubmit
}

/** What a dialect says about itself. */
export interface DialectMeta {
  /** Its id, as stored in the panel's preference and sent over the wire. */
  id: string
  /** Its name in the panel's switch and in messages ("Now speaking PyMOL commands"). */
  label: string
  /** The prompt, without the space: shown in the panel and in the transcript's echo. */
  prompt: string
  /** The undo entry's label prefix, so the history says where an edit came from. */
  txnPrefix: string
  /** The action log's source for its submissions. */
  actionSource: string
  /** The localStorage key of its command history. */
  historyKey: string
  /** The script files it runs. */
  scripts: readonly DialectScript[]
  /** The colour of its name in tritium_cli's prompt (an ANSI colour name). */
  cliColor: 'cyan' | 'magenta' | 'green' | 'yellow' | 'blue'
}

/** Every dialect, in the order the panel's switch shows them. */
export const DIALECT_METAS: readonly DialectMeta[] = [
  {
    id: 'native',
    label: 'CueMol',
    prompt: 'CueMol>',
    txnPrefix: 'cmd: ',
    actionSource: 'cmd',
    historyKey: 'cuemol.console.history.native',
    scripts: [{ ext: '.qax', submit: 'path' }],
    cliColor: 'cyan',
  },
  {
    id: 'pymol',
    label: 'PyMOL',
    prompt: 'PyM>',
    txnPrefix: 'pym: ',
    actionSource: 'pym',
    // The key it had before the console spoke more than one language.
    historyKey: 'cuemol.pymconsole.history',
    scripts: [{ ext: '.pml', submit: 'text' }],
    cliColor: 'magenta',
  },
  {
    id: 'chimerax',
    label: 'ChimeraX',
    prompt: 'ChX>',
    txnPrefix: 'chx: ',
    actionSource: 'chx',
    historyKey: 'cuemol.console.history.chimerax',
    scripts: [{ ext: '.cxc', submit: 'text' }],
    cliColor: 'green',
  },
]

/** A dialect's id. Any string: whether it names a dialect is `isDialectId`. */
export type DialectId = string

/** The dialect a fresh panel speaks, and what an unknown id falls back to. */
export const DEFAULT_DIALECT: DialectId = 'native'

/** The dialect with this id, or null. */
export function dialectMeta(id: string): DialectMeta | null {
  return DIALECT_METAS.find((m) => m.id === id) ?? null
}

/** Whether `id` names a dialect. */
export function isDialectId(id: unknown): id is DialectId {
  return typeof id === 'string' && dialectMeta(id) !== null
}

/**
 * `id` when it names a dialect, else the default -- for a stored preference,
 * which may name a dialect this build no longer has.
 */
export function knownDialect(id: unknown): DialectId {
  return isDialectId(id) ? id : DEFAULT_DIALECT
}

/** The dialect with this id, or the default one. */
export function metaOf(id: string): DialectMeta {
  return dialectMeta(id) ?? (dialectMeta(DEFAULT_DIALECT) as DialectMeta)
}

/** The dialect whose script `filePath` is (by extension), with how it is sent; null for none. */
export function scriptOwner(filePath: string): { meta: DialectMeta; script: DialectScript } | null {
  const lower = filePath.toLowerCase()
  for (const meta of DIALECT_METAS) {
    const script = meta.scripts.find((s) => lower.endsWith(s.ext))
    if (script) return { meta, script }
  }
  return null
}
