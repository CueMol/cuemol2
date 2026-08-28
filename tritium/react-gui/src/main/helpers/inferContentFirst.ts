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

import { hasExt } from '@shared/fileExt';

export interface FileFilter {
    name: string;
    extensions: string[];
}

/**
 * Decide whether to defer reader picking to content sniffing.
 *
 * @param filePath - The path of the file the user selected.
 * @param filters - The filter rows shown in the open dialog (as built
 *   by `getOpenFilters.service.ts`). The aggregate catch-all is
 *   identified by `name === 'All Supported'` and the wildcard row by
 *   `extensions` containing `'*'`. Reader-specific rows may carry
 *   multiple extensions (e.g. PDB Coordinates -> *.pdb;*.ent;*.pdb.gz),
 *   so length alone cannot identify the aggregate.
 * @returns `true` when content sniffing should be used (ambiguous /
 *   only catch-all matches), `false` when the extension should win.
 */
export function inferContentFirst(filePath: string, filters: FileFilter[]): boolean {
    // Suffix match, not a single trailing segment: the filter rows carry
    // multi-dot extensions (*.pdb.gz, *.cif.gz). See shared/fileExt.ts.
    let matched = 0;
    for (const f of filters) {
        if (f.extensions.includes('*')) continue;
        if (f.name === 'All Supported') continue;
        if (f.extensions.some((e) => hasExt(filePath, e))) {
            matched++;
            if (matched > 1) break;
        }
    }
    return matched !== 1;
}
