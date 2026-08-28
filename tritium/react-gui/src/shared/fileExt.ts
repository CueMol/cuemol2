/**
 * @file shared/fileExt.ts
 * @description Matching a file path against declared extensions.
 *
 * Readers and dialog filters declare extensions as a semicolon list of glob
 * patterns -- the PDB reader's is `"*.pdb; *.ent; *.pdb.gz"` -- so an
 * extension is not necessarily one dot-segment. Reducing a path with
 * `split('.').pop()` turns `1crn.pdb.gz` into `gz`, which matches nothing:
 * the file then falls through to whatever the no-match branch does. That
 * mistake appeared independently in four places, hence this module.
 *
 * Matching is by suffix, and the longest declared extension wins, so a reader
 * claiming `pdb.gz` beats one claiming only `gz`.
 */

/**
 * Split a `fext` / filter string into bare extensions.
 *
 * @param fext - semicolon-separated patterns, e.g. `"*.pdb; *.ent; *.pdb.gz"`.
 * @returns lower-cased extensions without the leading `*.`, e.g.
 *   `['pdb', 'ent', 'pdb.gz']`.
 */
export function parseExtList(fext: string): string[] {
    return fext
        .split(';')
        .map((s) => s.trim().replace(/^\*\./, '').replace(/^\./, '').toLowerCase())
        .filter((s) => s.length > 0)
}

/**
 * Whether `filePath` carries the extension `ext`.
 *
 * @param ext - bare extension, with or without a leading dot; may contain dots
 *   of its own (`pdb.gz`).
 */
export function hasExt(filePath: string, ext: string): boolean {
    const bare = ext.replace(/^\*\./, '').replace(/^\./, '').toLowerCase()
    if (!bare) return false
    return filePath.toLowerCase().endsWith('.' + bare)
}

/**
 * How specifically `exts` claims `filePath`.
 *
 * @returns the length of the longest matching extension, or 0 when none match.
 *   Comparing this across candidates is what makes `pdb.gz` win over `gz`.
 */
export function matchExtLength(filePath: string, exts: readonly string[]): number {
    let best = 0
    for (const e of exts) {
        const bare = e.replace(/^\*\./, '').replace(/^\./, '').toLowerCase()
        if (bare.length > best && hasExt(filePath, bare)) best = bare.length
    }
    return best
}
