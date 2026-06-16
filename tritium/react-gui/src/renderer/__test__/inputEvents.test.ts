import { describe, it, expect, vi } from 'vitest';
import {
    makeModif,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleGesture,
    handleWheel,
} from '../worker/server/inputEvents';

/**
 * Degrade-detection test for the Worker input-event handlers extracted
 * from WorkerService in Phase 2. Pins the DOM->CueMol modifier-bit mapping
 * and the gesture scale constants -- both are easy to silently regress.
 */

/** Fake GUIView capturing the `on*` drive calls. */
function makeView() {
    return {
        onMouseDown: vi.fn(),
        onMouseUp: vi.fn(),
        onMouseMove: vi.fn(),
        onGesture: vi.fn(),
        onWheel: vi.fn(),
    };
}
type View = ReturnType<typeof makeView>;
/** The handlers take a GUIView; the structural fake is sufficient. */
const asView = (v: View): Parameters<typeof handleMouseDown>[0] =>
    v as unknown as Parameters<typeof handleMouseDown>[0];

describe('inputEvents.makeModif', () => {
    it('maps DOM button bits to CueMol bits (middle/right swapped)', () => {
        expect(makeModif({ buttons: 1 })).toBe(1); // left
        expect(makeModif({ buttons: 4 })).toBe(2); // DOM middle(4) -> CueMol 2
        expect(makeModif({ buttons: 2 })).toBe(4); // DOM right(2)  -> CueMol 4
        expect(makeModif({ buttons: 7 })).toBe(7); // all three
    });
    it('adds ctrl(+32) and shift(+64)', () => {
        expect(makeModif({ buttons: 0, ctrlKey: true })).toBe(32);
        expect(makeModif({ buttons: 0, shiftKey: true })).toBe(64);
        expect(makeModif({ buttons: 1, ctrlKey: true, shiftKey: true })).toBe(97);
    });
});

describe('inputEvents pointer handlers', () => {
    it('handleMouseDown drives onMouseDown with coords + modifier', () => {
        const v = makeView();
        handleMouseDown(asView(v), {
            buttons: 1, offsetX: 10, offsetY: 20, screenX: 30, screenY: 40,
        });
        expect(v.onMouseDown).toHaveBeenCalledWith(10, 20, 30, 40, 1);
    });

    it('handleMouseUp uses event.button (not buttons) for the button bit', () => {
        const v = makeView();
        // button index 2 -> CueMol bit 4; + ctrl(32) -> 36
        handleMouseUp(asView(v), {
            button: 2, ctrlKey: true,
            offsetX: 1, offsetY: 2, screenX: 3, screenY: 4,
        });
        expect(v.onMouseUp).toHaveBeenCalledWith(1, 2, 3, 4, 36);
    });

    it('handleMouseMove drives onMouseMove with the modifier', () => {
        const v = makeView();
        handleMouseMove(asView(v), {
            buttons: 2, offsetX: 5, offsetY: 6, screenX: 7, screenY: 8,
        });
        expect(v.onMouseMove).toHaveBeenCalledWith(5, 6, 7, 8, 4);
    });
});

describe('inputEvents.handleGesture scale constants', () => {
    const base = { offsetX: 1, offsetY: 2, screenX: 3, screenY: 4 };
    it('pinch (axisID 6) scales delta by 3.2', () => {
        const v = makeView();
        handleGesture(asView(v), { ...base, axisID: 6, delta: 10 });
        expect(v.onGesture).toHaveBeenCalledWith(1, 2, 3, 4, 0, 6, 32);
    });
    it('rotate (axisID 7) scales delta by -16', () => {
        const v = makeView();
        handleGesture(asView(v), { ...base, axisID: 7, delta: 10 });
        expect(v.onGesture).toHaveBeenCalledWith(1, 2, 3, 4, 0, 7, -160);
    });
    it('other axes pass delta through unscaled', () => {
        const v = makeView();
        handleGesture(asView(v), { ...base, axisID: 3, delta: 10 });
        expect(v.onGesture).toHaveBeenCalledWith(1, 2, 3, 4, 0, 3, 10);
    });
});

describe('inputEvents.handleWheel', () => {
    it('drives onWheel with deltaX/deltaY and alt(+128) modifier', () => {
        const v = makeView();
        handleWheel(asView(v), {
            altKey: true,
            offsetX: 1, offsetY: 2, screenX: 3, screenY: 4,
            deltaX: 5, deltaY: 6,
        });
        expect(v.onWheel).toHaveBeenCalledWith(1, 2, 3, 4, 128, 5, 6);
    });
});
