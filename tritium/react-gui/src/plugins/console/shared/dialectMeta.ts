/**
 * @file plugins/console/shared/dialectMeta.ts
 * @description What a dialect says about itself, and the native dialect's own.
 *
 * The console speaks native itself; every other dialect comes from a plugin
 * of its own, which declares its `DialectMeta` under the `console.dialect`
 * extension point (`contributes.extensions`) and registers its
 * implementation in the worker (`worker/dialect-api.ts`). The panel (its
 * switch, prompt, history), the endpoint and `/console/info` read the metas
 * of native plus the switched-on plugins (`renderer/useDialectMetas.ts`);
 * the worker reads those of the registered dialects. Nothing names a
 * dialect other than native.
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

/** The extension point a dialect plugin declares its meta under. */
export const DIALECT_EXTENSION = 'console.dialect'

/** The native dialect: the console's own, always there. */
export const NATIVE_META: DialectMeta = {
  id: 'native',
  label: 'CueMol',
  prompt: 'CueMol>',
  txnPrefix: 'cmd: ',
  actionSource: 'cmd',
  historyKey: 'cuemol.console.history.native',
  scripts: [{ ext: '.qax', submit: 'path' }],
  cliColor: 'cyan',
}

/** A dialect's id. Any string: whether it names a dialect depends on the list at hand. */
export type DialectId = string

/** The dialect a fresh panel speaks, and what an unknown id falls back to. */
export const DEFAULT_DIALECT: DialectId = NATIVE_META.id

/** Whether `v` has the shape of a `DialectMeta` (a plugin's extension value). */
export function isDialectMeta(v: unknown): v is DialectMeta {
  const m = v as Partial<DialectMeta> | null
  return (
    typeof m === 'object' && m !== null &&
    typeof m.id === 'string' && m.id !== '' &&
    typeof m.label === 'string' && typeof m.prompt === 'string' &&
    typeof m.txnPrefix === 'string' && typeof m.actionSource === 'string' &&
    typeof m.historyKey === 'string' && Array.isArray(m.scripts)
  )
}

/** The dialect with this id in `metas`, or null. */
export function findMeta(metas: readonly DialectMeta[], id: string): DialectMeta | null {
  return metas.find((m) => m.id === id) ?? null
}

/** Whether `id` names a dialect in `metas`. */
export function isDialectId(metas: readonly DialectMeta[], id: unknown): id is DialectId {
  return typeof id === 'string' && findMeta(metas, id) !== null
}

/**
 * `id` when it names a dialect in `metas`, else the default -- for a stored
 * preference, which may name a dialect whose plugin is now switched off.
 */
export function knownDialect(metas: readonly DialectMeta[], id: unknown): DialectId {
  return isDialectId(metas, id) ? id : DEFAULT_DIALECT
}

/** The dialect with this id in `metas`, or native. */
export function metaOf(metas: readonly DialectMeta[], id: string): DialectMeta {
  return findMeta(metas, id) ?? NATIVE_META
}

/** The dialect in `metas` whose script `filePath` is (by extension), with how it is sent; null for none. */
export function scriptOwner(
  metas: readonly DialectMeta[],
  filePath: string,
): { meta: DialectMeta; script: DialectScript } | null {
  const lower = filePath.toLowerCase()
  for (const meta of metas) {
    const script = meta.scripts.find((s) => lower.endsWith(s.ext))
    if (script) return { meta, script }
  }
  return null
}
