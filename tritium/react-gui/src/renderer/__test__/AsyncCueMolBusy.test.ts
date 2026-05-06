import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock core wrappers to prevent @cuemol/core/src/wrappers/Object.ts from
// overriding the global Object (causing "Object.defineProperty is not a function")
vi.mock("@cuemol/core/src/wrappers/wrapper-loader", () => ({ wrapper_map: {} }));
vi.mock("@cuemol/core/src/BaseWrapper", () => ({
    BaseWrapper: class { constructor() {} },
}));

// MockWorker must be set up before AsyncCueMol is instantiated in each test.
let capturedWorker: MockWorker | null = null;

class MockWorker {
    onmessage: ((ev: MessageEvent) => any) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor(_url: any) { capturedWorker = this; }

    // Simulate a worker response: [method, seqno, ok, ...results]
    respond(method: string, seqno: number, ok: boolean, ...result: any[]) {
        this.onmessage?.({ data: [method, seqno, ok, ...result] } as MessageEvent);
    }
}

// Extract [method, seqno] from the nth postMessage call
function getSentSeq(n = 0): [string, number] {
    const payload = capturedWorker!.postMessage.mock.calls[n][0] as any[];
    return [payload[0] as string, payload[1] as number];
}

import { AsyncCueMol } from "../worker/client/AsyncCueMol";

describe("AsyncCueMol - busy tracking", () => {
    let cm: AsyncCueMol;

    beforeEach(() => {
        capturedWorker = null;
        vi.stubGlobal("Worker", MockWorker);
        cm = new AsyncCueMol();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("isBusy() returns false initially", () => {
        expect(cm.isBusy()).toBe(false);
    });

    it("isBusy() returns true while invokeWorker is pending", () => {
        cm.invokeWorker("testMethod");
        expect(cm.isBusy()).toBe(true);
    });

    it("isBusy() returns false after worker responds with success", async () => {
        const promise = cm.invokeWorker("testMethod");
        const [method, seqno] = getSentSeq();
        capturedWorker!.respond(method, seqno, true, "ok");
        await promise;
        expect(cm.isBusy()).toBe(false);
    });

    it("isBusy() returns false after worker responds with failure", async () => {
        const promise = cm.invokeWorker("testMethod").catch(() => {});
        const [method, seqno] = getSentSeq();
        capturedWorker!.respond(method, seqno, false, "error message");
        await promise;
        expect(cm.isBusy()).toBe(false);
    });

    it("stays busy until the last of multiple concurrent requests completes", async () => {
        const p1 = cm.invokeWorker("method1");
        const p2 = cm.invokeWorker("method2");
        const [m1, s1] = getSentSeq(0);
        const [m2, s2] = getSentSeq(1);

        expect(cm.isBusy()).toBe(true);

        capturedWorker!.respond(m1, s1, true);
        await p1;
        expect(cm.isBusy()).toBe(true); // still one pending

        capturedWorker!.respond(m2, s2, true);
        await p2;
        expect(cm.isBusy()).toBe(false);
    });

    it("subscribeBusy callback is called with true when first request starts", () => {
        const listener = vi.fn();
        cm.subscribeBusy(listener);

        cm.invokeWorker("testMethod");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(true);
    });

    it("subscribeBusy callback is called with false when last pending request completes", async () => {
        const listener = vi.fn();
        cm.subscribeBusy(listener);

        const promise = cm.invokeWorker("testMethod");
        const [method, seqno] = getSentSeq();
        capturedWorker!.respond(method, seqno, true);
        await promise;

        expect(listener).toHaveBeenCalledWith(false);
    });

    it("subscribeBusy fires true only once for multiple concurrent requests", () => {
        const listener = vi.fn();
        cm.subscribeBusy(listener);

        cm.invokeWorker("method1");
        cm.invokeWorker("method2");

        // true should fire only on the first request (0->1 transition)
        const trueCalls = listener.mock.calls.filter(([v]) => v === true);
        expect(trueCalls).toHaveLength(1);
    });

    it("unsubscribe stops the callback from being called", () => {
        const listener = vi.fn();
        const unsubscribe = cm.subscribeBusy(listener);
        unsubscribe();

        cm.invokeWorker("testMethod");
        expect(listener).not.toHaveBeenCalled();
    });
});
