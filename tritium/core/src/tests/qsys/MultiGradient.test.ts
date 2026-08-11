import { cm } from '../setup';
import type { MultiGradient } from '@/wrappers/MultiGradient';

/**
 * Pins the N-API boundary of the MultiGradient batch JSON API
 * (getNodesJSON / setNodesJSON added for the tritium multigrad editor).
 * The C++ semantics themselves are covered by gtest
 * (src/tests/qsys/test_multigradient.cpp); this suite verifies the
 * regenerated TS wrapper + string marshaling through the addon.
 */
describe('MultiGradient JSON API', () => {
    let sut: MultiGradient;

    beforeEach(() => {
        sut = cm.createObj('MultiGradient') as MultiGradient;
    });

    it('starts empty and serializes to []', () => {
        expect(sut.size).toBe(0);
        expect(sut.getNodesJSON()).toBe('[]');
    });

    it('round-trips nodes through setNodesJSON / getNodesJSON', () => {
        sut.setNodesJSON(JSON.stringify([
            { value: 1.5, color: '#0000FF' },
            { value: -0.5, color: '#FF0000' },
        ]));
        expect(sut.size).toBe(2);

        const nodes = JSON.parse(sut.getNodesJSON()) as Array<{
            value: number; color: string; r: number; g: number; b: number;
        }>;
        // sorted ascending by value
        expect(nodes.map((n) => n.value)).toEqual([-0.5, 1.5]);
        expect(nodes[0].r).toBe(255);
        expect(nodes[0].g).toBe(0);
        expect(nodes[1].b).toBe(255);
    });

    it('empty array clears existing nodes', () => {
        sut.setNodesJSON('[{"value":0,"color":"#FFFFFF"}]');
        expect(sut.size).toBe(1);
        sut.setNodesJSON('[]');
        expect(sut.size).toBe(0);
    });

    it('invalid JSON surfaces as a JS exception', () => {
        expect(() => sut.setNodesJSON('not json')).toThrow();
        expect(sut.size).toBe(0);
    });

    it('named colors round-trip symbolically', () => {
        sut.setNodesJSON('[{"value":0.5,"color":"red"}]');
        const nodes = JSON.parse(sut.getNodesJSON()) as Array<{ color: string }>;
        expect(nodes[0].color).toBe('red');
    });
});
