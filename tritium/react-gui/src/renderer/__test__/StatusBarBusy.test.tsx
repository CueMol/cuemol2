/**
 * @file __test__/StatusBarBusy.test.tsx
 * @description The status bar's Ready / Busy indicator.
 *
 * The flag reaches the bar through `useCueMolBusy`, so the mock here holds
 * it in React state and hands the test its setter: that is how it changes in
 * production, and -- unlike re-rendering the parent -- it is a path
 * `React.memo` does not stand in the way of.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const busyState = vi.hoisted(() => ({
    initial: false,
    set: null as ((busy: boolean) => void) | null,
}));
vi.mock("../hooks/useCueMolBusy", async () => {
    const { useState } = await import("react");
    return {
        useCueMolBusy: () => {
            const [busy, setBusy] = useState(busyState.initial);
            busyState.set = setBusy;
            return busy;
        },
    };
});
vi.mock("../hooks/useBusyCursor", () => ({ useBusyCursor: () => undefined }));
vi.mock("../state/statusMessage", () => ({ useStatusMessage: () => null }));
vi.mock("../contexts/ActiveToolContext", () => ({
    useActiveToolDef: () => ({ id: "navigate", label: "Navigate", shortcut: "V", icon: "tool.navigate" }),
}));

import { StatusBar } from "../components/StatusBar";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
    busyState.set = null;
});

/** Mount the bar with the worker idle or busy. */
function renderStatusBar(busy: boolean) {
    busyState.initial = busy;
    act(() => {
        root.render(React.createElement(StatusBar));
    });
}

/** Flip the worker's busy flag the way the real subscription does. */
function setBusy(busy: boolean) {
    act(() => {
        busyState.set!(busy);
    });
}

describe("StatusBar - busy flag", () => {
    it("shows 'Ready' when the worker is idle", () => {
        renderStatusBar(false);
        expect(container.textContent).toContain("Ready");
        expect(container.textContent).not.toContain("Busy");
    });

    it("shows 'Busy' while the worker is processing", () => {
        renderStatusBar(true);
        expect(container.textContent).toContain("Busy");
        expect(container.textContent).not.toContain("Ready");
    });

    it("switches from Ready to Busy when the worker picks up work", () => {
        renderStatusBar(false);
        expect(container.textContent).toContain("Ready");
        setBusy(true);
        expect(container.textContent).toContain("Busy");
    });

    it("switches from Busy to Ready when the worker goes idle", () => {
        renderStatusBar(true);
        expect(container.textContent).toContain("Busy");
        setBusy(false);
        expect(container.textContent).toContain("Ready");
    });
});
