/**
 * @file dialects.ts
 * @description The dialects the app speaks, as the client learns them.
 *
 * The client keeps no list of its own: the app says which dialects exist,
 * what they are called and which script files they run (`/console/info`,
 * protocol 3). Only an app from before that is answered with the two
 * dialects every such app had.
 */

import type { ConsoleDialectInfo, ConsoleInfoResponse } from '@cuemol/console-kit'

/** The dialect the app starts in, and the client's default. */
export const NATIVE_DIALECT = 'native'

/** What an app from before protocol 3 speaks (it does not say). */
const PRE_PROTOCOL_3: readonly ConsoleDialectInfo[] = [
  { id: 'native', label: 'CueMol', prompt: 'CueMol>', scripts: [{ ext: '.qax', submit: 'path' }], cliColor: 'cyan' },
  { id: 'pymol', label: 'PyMOL', prompt: 'PyM>', scripts: [{ ext: '.pml', submit: 'text' }], cliColor: 'magenta' },
]

/** The dialects, and whether the app takes a script by its path. */
export interface AppDialects {
  list: readonly ConsoleDialectInfo[]
  /** `scriptPath` in `/console/run`: protocol 3. Before it, a qax file is sent as `run "<path>"`. */
  sendsPath: boolean
}

/** What `info` says the app speaks; null info (no answer) is taken as an older app. */
export function appDialects(info: ConsoleInfoResponse | null): AppDialects {
  if (info?.dialects && info.dialects.length > 0) return { list: info.dialects, sendsPath: true }
  return { list: PRE_PROTOCOL_3, sendsPath: false }
}

/** The dialect with this id, or null. */
export function findDialect(d: AppDialects, id: string): ConsoleDialectInfo | null {
  return d.list.find((x) => x.id === id) ?? null
}

/** The dialect whose script `file` is (by extension), with how it is sent; null for none. */
export function scriptDialect(
  d: AppDialects,
  file: string,
): { dialect: ConsoleDialectInfo; submit: 'text' | 'path' } | null {
  const lower = file.toLowerCase()
  for (const dialect of d.list) {
    const script = dialect.scripts.find((s) => lower.endsWith(s.ext))
    if (script) return { dialect, submit: script.submit }
  }
  return null
}
