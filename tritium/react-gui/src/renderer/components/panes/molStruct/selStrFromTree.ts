/**
 * @file components/panes/molStruct/selStrFromTree.ts
 * @description Compose a UXP-syntax selection string from the set of
 * tree-node ids currently selected in `MolStructPane`.
 *
 * Mirrors UXP `panel.makeSelstrByTreeSel` /
 * `panel.makeSelstrByNode` from
 * `uxp_gui/cuemol2/base/content/molstruct-panel.js`.
 *
 * Phase 1 handles chain-level selection only:
 *   chain "A"              -> "c;'A'"
 *   chain "A" + chain "B"  -> "c;'A' | c;'B'"
 *
 * Phase 2 will extend to residue (range merge within a chain) and
 * atom (`aid <id>`) ids; the id encoding is designed so the parser can
 * stay backwards-compatible.
 */

/**
 * Tree-node id encoding:
 *   chain:<name>                   -> chain row
 *   resid:<chain>:<index>          -> residue row (Phase 2)
 *   atom:<chain>:<index>:<atomId>  -> atom row   (Phase 2)
 */
export type MolTreeId = string;

export function encodeChainId(name: string): MolTreeId {
    return `chain:${name}`;
}

interface DecodedChain {
    kind: 'chain';
    chain: string;
}

interface DecodedResidue {
    kind: 'resid';
    chain: string;
    index: number;
}

interface DecodedAtom {
    kind: 'atom';
    chain: string;
    index: number;
    atomId: number;
}

export type DecodedMolTreeId = DecodedChain | DecodedResidue | DecodedAtom;

export function decodeMolTreeId(id: MolTreeId): DecodedMolTreeId | null {
    const colon = id.indexOf(':');
    if (colon < 0) return null;
    const kind = id.slice(0, colon);
    const rest = id.slice(colon + 1);
    if (kind === 'chain') {
        if (!rest) return null;
        return { kind: 'chain', chain: rest };
    }
    if (kind === 'resid') {
        const sep = rest.indexOf(':');
        if (sep < 0) return null;
        const idx = Number(rest.slice(sep + 1));
        if (!Number.isFinite(idx)) return null;
        return { kind: 'resid', chain: rest.slice(0, sep), index: idx };
    }
    if (kind === 'atom') {
        const parts = rest.split(':');
        if (parts.length !== 3) return null;
        const idx = Number(parts[1]);
        const aid = Number(parts[2]);
        if (!Number.isFinite(idx) || !Number.isFinite(aid)) return null;
        return { kind: 'atom', chain: parts[0], index: idx, atomId: aid };
    }
    return null;
}

function selstrFromDecoded(node: DecodedMolTreeId): string {
    switch (node.kind) {
        case 'chain':
            return `c;'${node.chain}'`;
        case 'resid':
            return `'${node.chain}'.${node.index}.*`;
        case 'atom':
            return `aid ${node.atomId}`;
    }
}

/**
 * Build the joined selection string for the given set of selected tree ids.
 *
 * Returns an empty string when the set is empty or holds only ids that
 * fail to decode (defensive — callers should typically guard the Select
 * button by `selectedIds.size > 0`).
 *
 * @param selectedIds - set of tree-node ids currently selected
 */
export function selStrFromTree(selectedIds: ReadonlySet<MolTreeId>): string {
    if (selectedIds.size === 0) return '';
    const parts: string[] = [];
    for (const id of selectedIds) {
        const decoded = decodeMolTreeId(id);
        if (!decoded) continue;
        parts.push(selstrFromDecoded(decoded));
    }
    return parts.join(' | ');
}
