import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderText } from '../worker/server/textRender';

/**
 * Degrade-detection test for renderText -- the OffscreenCanvas text
 * rasteriser extracted from WorkerService in Phase 2. Pins the 4-byte
 * width alignment and the write-back contract (tr.width / tr.resize /
 * tr.setDataFromRGBA).
 */

interface Ctx2D {
    font: string;
    textBaseline: string;
    fillStyle: string;
    measureText: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    getImageData: ReturnType<typeof vi.fn>;
}

/** Install an OffscreenCanvas stub whose 2D context reports `textWidth`. */
function stubOffscreenCanvas(textWidth: number): Ctx2D {
    const ctx: Ctx2D = {
        font: '',
        textBaseline: '',
        fillStyle: '',
        measureText: vi.fn(() => ({ width: textWidth })),
        fillText: vi.fn(),
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
        })),
    };
    class OffscreenCanvasStub {
        constructor(public width: number, public height: number) {}
        getContext(): Ctx2D {
            return ctx;
        }
    }
    vi.stubGlobal('OffscreenCanvas', OffscreenCanvasStub);
    return ctx;
}

function makeTr() {
    return {
        text: 'hi',
        font: '12px sans-serif',
        height: 5,
        width: 0,
        resize: vi.fn(),
        setDataFromRGBA: vi.fn(),
    };
}

type RenderTextCm = Parameters<typeof renderText>[0];
const callRenderText = (cm: object, trNative: unknown): void =>
    renderText(cm as unknown as RenderTextCm, trNative);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('renderText', () => {
    it('rounds the bitmap width up to a 4-byte boundary', () => {
        stubOffscreenCanvas(10); // ceil(10)=10, 10%4=2 -> width 12
        const tr = makeTr();
        const ba = { __byteArray: true };
        const cm = { createWrapper: vi.fn(() => tr), fromTypedArray: vi.fn(() => ba) };

        callRenderText(cm, { __native: true });

        expect(tr.width).toBe(12);
        expect(tr.resize).toHaveBeenCalledWith(12 * 5);
        expect(tr.setDataFromRGBA).toHaveBeenCalledWith(ba);
    });

    it('leaves an already-aligned width unchanged', () => {
        stubOffscreenCanvas(8); // 8%4=0 -> width stays 8
        const tr = makeTr();
        const cm = { createWrapper: vi.fn(() => tr), fromTypedArray: vi.fn(() => ({})) };

        callRenderText(cm, {});

        expect(tr.width).toBe(8);
        expect(tr.resize).toHaveBeenCalledWith(8 * 5);
    });

    it('feeds the rasterised RGBA buffer through cm.fromTypedArray', () => {
        stubOffscreenCanvas(12); // already aligned -> width 12
        const tr = makeTr();
        const cm = {
            createWrapper: vi.fn(() => tr),
            fromTypedArray: vi.fn((_view: unknown) => ({})),
        };

        callRenderText(cm, {});

        // 12 (width) x 5 (height) x 4 (RGBA) bytes.
        const fed = cm.fromTypedArray.mock.calls[0][0] as Uint8Array;
        expect(fed).toBeInstanceOf(Uint8Array);
        expect(fed.byteLength).toBe(12 * 5 * 4);
    });
});
