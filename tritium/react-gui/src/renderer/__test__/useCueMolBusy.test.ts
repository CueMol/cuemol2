import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useCueMolBusy } from "../hooks/useCueMolBusy";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mock useCueMol ---

type BusyCallback = (busy: boolean) => void;

let mockIsBusy: boolean;
let subscribeBusyImpl: (cb: BusyCallback) => () => void;

vi.mock("../hooks/useCueMol", () => ({
    useCueMol: () => ({
        cueMolReady: true,
        cm: {
            isBusy: () => mockIsBusy,
            subscribeBusy: (cb: BusyCallback) => subscribeBusyImpl(cb),
        },
    }),
}));

// --- renderHook helper ---

function makeRenderHook<T>(useHookFn: () => T) {
    let result!: T;
    let root!: Root;
    const container = document.createElement("div");
    document.body.appendChild(container);

    function TestComponent() {
        result = useHookFn();
        return null;
    }

    act(() => {
        root = createRoot(container);
        root.render(React.createElement(TestComponent));
    });

    return {
        get result() { return result; },
        unmount() {
            act(() => { root.unmount(); });
            document.body.removeChild(container);
        },
    };
}

describe("useCueMolBusy", () => {
    let registeredCallback: BusyCallback | null = null;
    let unsubscribeSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        registeredCallback = null;
        unsubscribeSpy = vi.fn();
        mockIsBusy = false;
        subscribeBusyImpl = (cb) => {
            registeredCallback = cb;
            return unsubscribeSpy;
        };
    });

    it("is false initially when cm.isBusy() is false", () => {
        const { result, unmount } = makeRenderHook(() => useCueMolBusy());
        expect(result).toBe(false);
        unmount();
    });

    it("schedules a 150ms rising-edge timer when subscribeBusy notifies busy", () => {
        const { result, unmount } = makeRenderHook(() => useCueMolBusy());

        // Hook is mounted; spy on setTimeout now so React internals aren't captured
        const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

        mockIsBusy = true;
        act(() => { registeredCallback!(true); });

        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150);
        expect(result).toBe(false); // busy state has not changed yet (delay pending)

        setTimeoutSpy.mockRestore();
        unmount();
    });

    it("does not schedule another timer if one is already pending", () => {
        const { result: _result, unmount } = makeRenderHook(() => useCueMolBusy());

        const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

        mockIsBusy = true;
        act(() => { registeredCallback!(true); }); // first call — schedules
        act(() => { registeredCallback!(true); }); // second call — should be ignored

        expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

        setTimeoutSpy.mockRestore();
        unmount();
    });

    it("cancels the pending timer (clearTimeout) when subscribeBusy notifies not-busy", () => {
        const { result, unmount } = makeRenderHook(() => useCueMolBusy());

        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

        // Schedule rising-edge timer
        mockIsBusy = true;
        act(() => { registeredCallback!(true); });

        // Cancel before it fires
        mockIsBusy = false;
        act(() => { registeredCallback!(false); });

        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(result).toBe(false); // timer was cancelled; busy never became true

        clearTimeoutSpy.mockRestore();
        unmount();
    });

    it("calls unsubscribe on unmount", () => {
        const { unmount } = makeRenderHook(() => useCueMolBusy());
        expect(unsubscribeSpy).not.toHaveBeenCalled();
        unmount();
        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    });
});
