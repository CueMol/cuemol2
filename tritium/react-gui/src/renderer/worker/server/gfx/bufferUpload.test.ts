/**
 * @file worker/server/gfx/bufferUpload.test.ts
 * @description The vertex-buffer upload gate.
 *
 * `drawBuffer` re-uploads a buffer only when the C++ side reports the data
 * changed. That gate used to sit behind an A/B flag (`RESPECT_ISUPDATED`)
 * whose other branch uploaded every buffer on every frame; the flag shipped
 * permanently on and is now gone. Nothing about a static scene looks wrong
 * when this regresses -- it just uploads the whole scene at 60 Hz -- so the
 * behaviour is pinned here rather than left to the flag's memory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BufferStore } from './BufferStore';

const GL = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    TRIANGLES: 4,
};

function makeGl() {
    return {
        ...GL,
        FLOAT: 0x1406,
        SHORT: 0x1402,
        createBuffer: vi.fn(() => ({})),
        createVertexArray: vi.fn(() => ({})),
        bindVertexArray: vi.fn(),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        vertexAttribDivisor: vi.fn(),
        deleteVertexArray: vi.fn(),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        bufferSubData: vi.fn(),
        deleteBuffer: vi.fn(),
        drawElements: vi.fn(),
        drawArrays: vi.fn(),
        drawElementsInstanced: vi.fn(),
        drawArraysInstanced: vi.fn(),
    };
}

describe('BufferStore.drawBuffer upload gate', () => {
    let gl: ReturnType<typeof makeGl>;
    let store: BufferStore;
    const ID = '1';

    beforeEach(() => {
        gl = makeGl();
        store = new BufferStore();
        store.setContext(gl as never);
        // One float3 attribute at location 0: the smallest buffer the store
        // will accept.
        store.createBuffer(
            String(ID), 36, 3, 0,
            JSON.stringify([{ nloc: 0, itype: '21', nelems: 3, npos: 0, idiv: 0 }]),
        );
        gl.bufferSubData.mockClear();
    });

    it('uploads when the data changed', () => {
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, true, 0);
        expect(gl.bufferSubData).toHaveBeenCalled();
    });

    it('does NOT upload when the data is unchanged', () => {
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, false, 0);
        expect(gl.bufferSubData).not.toHaveBeenCalled();
    });

    it('re-sends only the vertex buffer of an indexed buffer', () => {
        // The indices never change for the life of a buffer (a topology
        // change makes a new one), so an update must not re-send them.
        const IDX = '2';
        store.createBuffer(
            String(IDX), 36, 3, 12,
            JSON.stringify([{ nloc: 0, itype: '21', nelems: 3, npos: 0, idiv: 0 }]),
        );
        gl.bufferSubData.mockClear();
        store.drawBuffer(IDX as never, GL.TRIANGLES, 3, new Float32Array(9),
            new Uint32Array(3), true, 0);
        expect(gl.bufferSubData).toHaveBeenCalledTimes(1);
        expect(gl.bufferSubData.mock.calls[0][0]).toBe(GL.ARRAY_BUFFER);
        expect(gl.drawElements).toHaveBeenCalled();
    });

    it('still draws the buffer it did not re-upload', () => {
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, false, 0);
        expect(gl.drawArrays).toHaveBeenCalled();
    });
});

describe('BufferStore vertex buffer ring', () => {
    let gl: ReturnType<typeof makeGl>;
    let store: BufferStore;
    const ID = '1';
    const ATTRS = JSON.stringify([{ nloc: 0, itype: '21', nelems: 3, npos: 0, idiv: 0 }]);

    /** The vertex buffer each bufferSubData wrote, in call order. */
    const uploadTargets = () => {
        const bound: unknown[] = [];
        let vbo: unknown = null;
        const calls = [...gl.bindBuffer.mock.invocationCallOrder.map((o, i) =>
            ({ o, kind: 'bind', args: gl.bindBuffer.mock.calls[i] })),
            ...gl.bufferSubData.mock.invocationCallOrder.map((o) => ({ o, kind: 'sub', args: [] }))]
            .sort((a, b) => a.o - b.o);
        for (const c of calls) {
            if (c.kind === 'bind' && c.args[0] === GL.ARRAY_BUFFER) vbo = c.args[1];
            if (c.kind === 'sub') bound.push(vbo);
        }
        return bound;
    };

    /** The VAO bound right before each draw call, in call order. */
    const drawnVaos = () => gl.drawArrays.mock.invocationCallOrder.map((o) => {
        let vao: unknown = null;
        gl.bindVertexArray.mock.invocationCallOrder.forEach((b, i) => {
            if (b < o) vao = gl.bindVertexArray.mock.calls[i][0];
        });
        return vao;
    });

    beforeEach(() => {
        gl = makeGl();
        store = new BufferStore();
        store.setContext(gl as never);
    });

    it('writes successive updates into alternating vertex buffers and draws the one written', () => {
        store.createBuffer(ID, 36, 3, 0, ATTRS);
        const draw = (updated: boolean) =>
            store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, updated, 0);
        draw(true);
        draw(false);
        draw(true);
        draw(true);

        const [first, second, third] = uploadTargets();
        expect(first).not.toBe(second);
        expect(third).toBe(first);
        // The drawn VAO changes with every update and stays put without one.
        const [v1, v2, v3, v4] = drawnVaos();
        expect(v2).toBe(v1);
        expect(v3).not.toBe(v1);
        expect(v4).toBe(v1);
    });

    it('keeps a single vertex buffer for a buffer that is never updated', () => {
        store.createBuffer(ID, 36, 3, 0, ATTRS);
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, false, 0);
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, false, 0);
        expect(gl.createBuffer).toHaveBeenCalledTimes(1);
        expect(gl.createVertexArray).toHaveBeenCalledTimes(1);
    });

    it('lets the extra slot read the shared index buffer and deletes every slot', () => {
        store.createBuffer(ID, 36, 3, 12, ATTRS);
        const ibo = gl.createBuffer.mock.results[0].value;
        gl.bindBuffer.mockClear();
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9),
            new Uint32Array(3), true, 0);
        // The new slot's VAO records the same element buffer.
        expect(gl.bindBuffer).toHaveBeenCalledWith(GL.ELEMENT_ARRAY_BUFFER, ibo);
        expect(gl.createBuffer).toHaveBeenCalledTimes(3);  // ibo + two vbos

        store.deleteBuffer(ID as never);
        expect(gl.deleteBuffer).toHaveBeenCalledTimes(3);
        expect(gl.deleteVertexArray).toHaveBeenCalledTimes(2);
    });
});

describe('BufferStore partial updates (attribute blocks)', () => {
    let gl: ReturnType<typeof makeGl>;
    let store: BufferStore;
    const ID = '1';
    // Two vertices in a block layout: 12-byte positions, then 8-byte packed
    // normals, then 4-byte colors (24 bytes per vertex in all)
    const TOTAL = 48;
    const GEOM: [number, number] = [0, 40];
    const COLOR: [number, number] = [40, 48];
    const ATTRS = JSON.stringify([
        { nloc: 0, itype: '21', nelems: 3, npos: 0, idiv: 0, stride: '12' },
        { nloc: 1, itype: '12', nelems: 4, npos: 24, idiv: 0, stride: '8' },
        { nloc: 2, itype: '1', nelems: 4, npos: 40, idiv: 0, stride: '4' },
    ]);

    /** [offset, byteLength] of each bufferSubData, in call order. */
    const uploads = () => gl.bufferSubData.mock.calls.map(
        (c) => [c[1], (c[2] as Uint8Array).byteLength]);

    const update = (range: [number, number]) =>
        store.drawBuffer(ID as never, GL.TRIANGLES, 2, new ArrayBuffer(TOTAL), null, true, 0,
            range[0], range[1] - range[0]);

    beforeEach(() => {
        gl = makeGl();
        store = new BufferStore();
        store.setContext(gl as never);
        store.createBuffer(ID, TOTAL, 2, 0, ATTRS);
    });

    it('gives each attribute its own stride and reads packed normals normalized', () => {
        expect(gl.vertexAttribPointer).toHaveBeenCalledWith(0, 3, gl.FLOAT, false, 12, 0);
        expect(gl.vertexAttribPointer).toHaveBeenCalledWith(
            1, 4, gl.SHORT, true, 8, 24);
    });

    it('uploads only the changed range once the slot holds the rest', () => {
        update(GEOM);  // into the new second slot: everything
        update(GEOM);  // the first slot, re-specified on the first update: everything
        update(GEOM);  // the second slot holds the rest: only the range
        update(GEOM);
        expect(uploads()).toEqual([[0, TOTAL], [0, TOTAL], [0, 40], [0, 40]]);
    });

    it('brings a slot up to date with the ranges it missed', () => {
        update(GEOM);   // slot 1 (all)
        update(COLOR);  // slot 0: all (its contents were dropped on the first update)
        update(GEOM);   // slot 1: the positions, plus the color it missed
        update(GEOM);   // slot 0: up to date except the positions
        expect(uploads()).toEqual([[0, TOTAL], [0, TOTAL], [0, 48], [0, 40]]);
    });
});

describe('BufferStore vertex buffer usage hint', () => {
    let gl: ReturnType<typeof makeGl>;
    let store: BufferStore;
    const ID = '1';
    const ATTRS = JSON.stringify([{ nloc: 0, itype: '21', nelems: 3, npos: 0, idiv: 0 }]);

    /** The usage hint of each ARRAY_BUFFER bufferData, in call order. */
    const vertexUsages = () => gl.bufferData.mock.calls
        .filter((c) => c[0] === GL.ARRAY_BUFFER).map((c) => c[2]);

    beforeEach(() => {
        gl = makeGl();
        store = new BufferStore();
        store.setContext(gl as never);
        store.createBuffer(ID, 36, 3, 12, ATTRS);
    });

    it('keeps a never-updated vertex buffer STATIC_DRAW', () => {
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9),
            new Uint32Array(3), false, 0);
        expect(vertexUsages()).toEqual([GL.STATIC_DRAW]);
        // the index buffer is never rewritten either
        expect(gl.bufferData.mock.calls
            .filter((c) => c[0] === GL.ELEMENT_ARRAY_BUFFER).map((c) => c[2]))
            .toEqual([GL.STATIC_DRAW]);
    });

    it('makes every vertex slot DYNAMIC_DRAW on the first update, and only then', () => {
        const draw = () => store.drawBuffer(ID as never, GL.TRIANGLES, 3,
            new Float32Array(9), new Uint32Array(3), true, 0);
        draw();
        // created STATIC, then the first slot re-specified and the second created DYNAMIC
        expect(vertexUsages()).toEqual([GL.STATIC_DRAW, GL.DYNAMIC_DRAW, GL.DYNAMIC_DRAW]);
        draw();
        draw();
        expect(vertexUsages()).toHaveLength(3);
        expect(gl.createBuffer).toHaveBeenCalledTimes(3);  // ibo + two vbos
    });
});
