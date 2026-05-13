// Selection-string transforms shared between context-menu services
// (`naviCtxtMenu.service.ts` viewport menu and `sceneOps.service.ts`
// scene-tree object Selection submenu). Mirrors the regex-based
// rewriting in UXP `cuemol2-utils.js` (`molSelAround` /
// `molSelInvertSel` / `molSelToggleSideCh`).

/**
 * Wrap (or rewrite) the previous selection with an "around <dist>"
 * radius selector, optionally with `byres` expansion. If the previous
 * selection already ends in an around (any of the three UXP forms),
 * the inner selection is reused and the outer wrap is replaced.
 */
export function rewriteAround(prevSelStr: string, dist: number, byres: boolean): string {
    let base: string | null = null;
    let m: RegExpMatchArray | null;

    // form I: `byres ( XXXX around N.NN )`
    m = prevSelStr.match(/byres\s*\(\s*(.+)\s+around\s+[\d.]+\s*\)/);
    if (m) { base = m[1]; }

    // form II: `byres XXXX around N.NN`
    if (!base) {
        m = prevSelStr.match(/byres\s+(.+)\s+around\s+[\d.]+/);
        if (m) { base = m[1]; }
    }

    // form III: `XXXX around N.NN`
    if (!base) {
        m = prevSelStr.match(/(.+)\s+around\s+[\d.]+/);
        if (m) { base = m[1]; }
    }

    if (!base) { base = prevSelStr; }

    return byres ? `byres ${base} around ${dist}` : `${base} around ${dist}`;
}

/** Toggle a `!(...)` around the previous selection. */
export function invertSelStr(prev: string): string {
    if (!prev) return '*';
    const m = prev.match(/!\s*\((.+)\)/s);
    if (m) return m[1];
    return `!(${prev})`;
}

/** Toggle a `bysidech ...` prefix around the previous selection. */
export function toggleSidechainStr(prev: string): string {
    const m = prev.match(/bysidech\s+(.+)/s);
    if (m) return m[1];
    return `bysidech ${prev}`;
}
