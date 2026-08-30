/**
 * @file components/panes/molStruct/selStrFromTree.ts
 * @description Compose a UXP-syntax selection string from the set of
 * tree-node ids currently selected in `MolStructPane`.
 *
 * Mirrors UXP `panel.makeSelstrByTreeSel` /
 * `panel.makeSelstrByNode` from
 * `uxp_gui/cuemol2/base/content/molstruct-panel.js`.
 *
 *   chain "A"                       -> "c;'A'"
 *   residue 10 (chain A)            -> "'A'.10.*"
 *   contiguous residues 10..15 (A)  -> "'A'.10:15.*"
 *   atom id 123                     -> "aid 123"
 *
 * Range merging requires the residue order for the chain (so we can
 * decide whether two indices are positionally adjacent -- insertion codes
 * like "10A" mean we cannot rely on numeric distance). When the caller
 * supplies a `residueOrder` map, contiguous-in-position residues collapse
 * into ranges; without it, each residue emits its own segment.
 */

/**
 * Tree-node id encoding:
 *   chain:<name>                       -> chain row
 *   resid:<chain>:<index>              -> residue row
 *                                          (<index> is a string --
 *                                          ResidIndex::toString() may
 *                                          include an insertion code)
 *   atom:<chain>:<index>:<atomId>      -> atom row
 */
export type MolTreeId = string;

export function encodeChainId(name: string): MolTreeId {
    return `chain:${name}`;
}

export function encodeResidueId(chain: string, index: string): MolTreeId {
    return `resid:${chain}:${index}`;
}

export function encodeAtomId(
    chain: string,
    residueIndex: string,
    atomId: number,
): MolTreeId {
    return `atom:${chain}:${residueIndex}:${atomId}`;
}

interface DecodedChain {
    kind: 'chain';
    chain: string;
}

interface DecodedResidue {
    kind: 'resid';
    chain: string;
    /** Raw ResidIndex string (e.g. "10" or "10A"). */
    index: string;
}

interface DecodedAtom {
    kind: 'atom';
    chain: string;
    /** Raw residue index string the atom belongs to (kept for round-trip). */
    index: string;
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
        const chain = rest.slice(0, sep);
        const index = rest.slice(sep + 1);
        if (!chain || !index) return null;
        return { kind: 'resid', chain, index };
    }
    if (kind === 'atom') {
        // The residue-index slice may itself contain non-digit characters
        // (insertion codes). Split from the right so the atom-id (a pure
        // integer) is unambiguous.
        const lastColon = rest.lastIndexOf(':');
        if (lastColon < 0) return null;
        const aidStr = rest.slice(lastColon + 1);
        const aid = Number(aidStr);
        if (!Number.isFinite(aid)) return null;
        const head = rest.slice(0, lastColon);
        const sep = head.indexOf(':');
        if (sep < 0) return null;
        const chain = head.slice(0, sep);
        const index = head.slice(sep + 1);
        if (!chain || !index) return null;
        return { kind: 'atom', chain, index, atomId: aid };
    }
    return null;
}

interface ChainBucket {
    chainName: string;
    chainSelected: boolean;
    residues: string[];
    atoms: number[];
}

function bucketSelection(selectedIds: ReadonlySet<MolTreeId>): ChainBucket[] {
    // Order chains by first appearance so the output is deterministic.
    const byChain = new Map<string, ChainBucket>();
    const ensure = (chain: string): ChainBucket => {
        let b = byChain.get(chain);
        if (!b) {
            b = { chainName: chain, chainSelected: false, residues: [], atoms: [] };
            byChain.set(chain, b);
        }
        return b;
    };
    for (const id of selectedIds) {
        const decoded = decodeMolTreeId(id);
        if (!decoded) continue;
        const bucket = ensure(decoded.chain);
        switch (decoded.kind) {
            case 'chain':
                bucket.chainSelected = true;
                break;
            case 'resid':
                bucket.residues.push(decoded.index);
                break;
            case 'atom':
                bucket.atoms.push(decoded.atomId);
                break;
        }
    }
    return [...byChain.values()];
}

/**
 * Merge a list of selected residue indices into ranges, using the chain's
 * residue order to determine positional adjacency. Insertion codes ("10A")
 * are handled transparently because we compare *positions* in the supplied
 * order, not numeric values.
 *
 * If no order is supplied (or the chain is not in the map), each residue
 * emits its own segment -- same wire format, just no merging.
 */
function mergeResidueRanges(
    indices: string[],
    order: readonly string[] | undefined,
): Array<{ start: string; end: string }> {
    if (indices.length === 0) return [];
    if (!order || order.length === 0) {
        return indices.map((idx) => ({ start: idx, end: idx }));
    }
    const positionOf = new Map<string, number>();
    order.forEach((idx, i) => positionOf.set(idx, i));
    const positioned = indices
        .map((idx) => ({ idx, pos: positionOf.get(idx) }))
        .filter((e): e is { idx: string; pos: number } => e.pos !== undefined)
        .sort((a, b) => a.pos - b.pos);
    if (positioned.length === 0) {
        return indices.map((idx) => ({ start: idx, end: idx }));
    }
    const ranges: Array<{ start: string; end: string }> = [];
    let runStart = positioned[0];
    let runEnd = positioned[0];
    for (let i = 1; i < positioned.length; i++) {
        const entry = positioned[i];
        if (entry.pos === runEnd.pos + 1) {
            runEnd = entry;
        } else {
            ranges.push({ start: runStart.idx, end: runEnd.idx });
            runStart = entry;
            runEnd = entry;
        }
    }
    ranges.push({ start: runStart.idx, end: runEnd.idx });
    return ranges;
}

function residueSegmentFor(chain: string, range: { start: string; end: string }): string {
    if (range.start === range.end) {
        return `'${chain}'.${range.start}.*`;
    }
    return `'${chain}'.${range.start}:${range.end}.*`;
}

/**
 * Build the joined selection string for the given set of selected tree ids.
 *
 * @param selectedIds - set of tree-node ids currently selected
 * @param residueOrder - optional Map<chainName, ordered residue indices>
 *                      used to merge contiguous residues into UXP ranges.
 *                      Without it, each residue emits its own segment.
 */
export function selStrFromTree(
    selectedIds: ReadonlySet<MolTreeId>,
    residueOrder?: ReadonlyMap<string, readonly string[]>,
): string {
    if (selectedIds.size === 0) return '';
    const buckets = bucketSelection(selectedIds);
    const segments: string[] = [];
    for (const bucket of buckets) {
        // Chain-row selection subsumes every residue / atom under it in
        // UXP, so emit only the chain segment in that case.
        if (bucket.chainSelected) {
            segments.push(`c;'${bucket.chainName}'`);
            continue;
        }
        const ranges = mergeResidueRanges(
            bucket.residues,
            residueOrder?.get(bucket.chainName),
        );
        for (const r of ranges) segments.push(residueSegmentFor(bucket.chainName, r));
        for (const aid of bucket.atoms) segments.push(`aid ${aid}`);
    }
    return segments.join(' | ');
}
