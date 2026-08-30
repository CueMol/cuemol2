/**
 * @file components/panels/sequence/seqCanvas.test.ts
 * @description Contract for the sequence panel's geometry.
 *
 * The panel paints residues onto a canvas, so nothing in the DOM says which
 * cell a click landed in -- `pickCell` is the only answer, and a wrong one
 * selects the wrong residue silently. These pin the mapping in both
 * directions of the two cases that are easy to get wrong: a click past the
 * end of a row, and an insertion-coded residue whose index is not a plain
 * integer.
 */

import { describe, it, expect } from 'vitest';
import { pickCell, type CellMetrics } from './seqCanvas';
import type { SeqRow } from './useMolSequenceData';

const METRICS: CellMetrics = { cellW: 10, rowH: 20 };

/** A canvas whose top-left is the origin, so client coords are cell coords. */
function fakeCanvas(): HTMLCanvasElement {
    return {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement;
}

function row(name: string, indices: string[]): SeqRow {
    return {
        molId: 1,
        molName: 'mol1',
        chainName: name,
        residues: indices.map((index) => ({ index, single: 'A', selected: false })),
    } as unknown as SeqRow;
}

const ROWS: SeqRow[] = [row('A', ['0', '1', '2']), row('B', ['0', '1'])];

describe('pickCell', () => {
    it('maps a click to the cell under it', () => {
        const hit = pickCell(ROWS, fakeCanvas(), METRICS, 15, 5);
        expect(hit).not.toBeNull();
        expect(hit!.rowIndex).toBe(0);
        expect(hit!.residueIndex).toBe('1');
    });

    it('maps the second row by its height', () => {
        const hit = pickCell(ROWS, fakeCanvas(), METRICS, 5, 25);
        expect(hit!.rowIndex).toBe(1);
        expect(hit!.row.chainName).toBe('B');
    });

    it('returns null below the last row', () => {
        expect(pickCell(ROWS, fakeCanvas(), METRICS, 5, 200)).toBeNull();
    });

    it('returns null above the first row', () => {
        expect(pickCell(ROWS, fakeCanvas(), METRICS, 5, -5)).toBeNull();
    });

    it('returns null past the last residue of a row', () => {
        // Row B has two residues; column 2 is inside the canvas but empty.
        expect(pickCell(ROWS, fakeCanvas(), METRICS, 25, 25)).toBeNull();
    });

    it('picks an insertion-coded residue by its leading integer', () => {
        // "52A" sits in column 52 and must still be clickable there.
        const rows = [row('A', ['51', '52A', '53'])];
        const hit = pickCell(rows, fakeCanvas(), METRICS, 52 * 10 + 5, 5);
        expect(hit!.residueIndex).toBe('52A');
    });
});
