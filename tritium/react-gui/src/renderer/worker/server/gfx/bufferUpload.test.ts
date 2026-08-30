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
    TRIANGLES: 4,
};

function makeGl() {
    return {
        ...GL,
        FLOAT: 0x1406,
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

    it('still draws the buffer it did not re-upload', () => {
        store.drawBuffer(ID as never, GL.TRIANGLES, 3, new Float32Array(9), null, false, 0);
        expect(gl.drawArrays).toHaveBeenCalled();
    });
});
