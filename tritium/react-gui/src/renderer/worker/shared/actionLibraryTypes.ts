/**
 * @file worker/shared/actionLibraryTypes.ts
 * @description The Library pane's view of the action files: the preset
 * macros shipped with the app and the user's own qax files, as the worker
 * reads them.
 */

/**
 * What a macro needs to run, as far as the Library can run it today:
 * - `target`: one object (its class in `targetType`), the one selected;
 * - `none`: nothing, it acts on the scene;
 * - `unsupported`: any other parameter list, shown but not run.
 */
export type MacroShape =
  | { kind: 'target'; targetType: string }
  | { kind: 'none' }
  | { kind: 'unsupported'; reason: string }

/** One macro of a file. */
export interface LibraryMacro {
  name: string
  label: string
  description: string
  shape: MacroShape
}

/** One qax file. */
export interface LibraryFile {
  /** Absolute path. */
  path: string
  /** The file name without `.qax`. */
  name: string
  /** The shipped presets (read only) or the user's folder. */
  origin: 'bundled' | 'user'
  macros: LibraryMacro[]
  /** Plain actions (recorded steps), run in order, one undo step each. */
  actionCount: number
  /** Why the file could not be read; nothing else is set then. */
  error?: string
}

export interface ListActionLibraryArgs {
  bundledFile: string
  userDir: string
}

export interface RunLibraryEntryArgs {
  sceneId: number
  viewId: number
  file: string
  /** A macro of the file; the file's actions when left out. */
  macro?: string
  /** The objects a `target` macro runs on, one run each. */
  targetIds?: number[]
}

/** One target a multi-target run skipped. */
export interface LibraryRunFailure {
  target: string
  error: string
}
