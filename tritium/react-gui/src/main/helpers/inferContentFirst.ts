/**
 * @file main/helpers/inferContentFirst.ts
 * @description Heuristic for deciding whether to route an Open-File
 * request through content sniffing or extension-based reader lookup.
 *
 * Electron's `dialog.showOpenDialog` does not surface which filter row
 * the user actually selected. We infer the intent from the chosen
 * extension and the registered filter rows: if exactly one reader-
 * specific filter claims that extension, the user almost certainly
 * picked it, so the extension is authoritative (return false). For any
 * other case (multiple specific filters claim it, only catch-all rows
 * claim it, or no filter claims it) we hand picking to content
 * sniffing (return true).
 */

export { inferContentFirst } from '@shared/openFileKind'
export type { OpenFilter as FileFilter } from '@shared/openFileKind'
