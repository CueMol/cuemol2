import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The status bar reads everything it shows from its owners; the test drives
// the busy flag through the mocked hook.
const busyState = vi.hoisted(() => ({ busy: false }));
vi.mock("../hooks/useCueMolBusy", () => ({ useCueMolBusy: () => busyState.busy }));
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
});

function renderStatusBar(busy: boolean) {
    busyState.busy = busy;
    act(() => {
        root.render(React.createElement(StatusBar));
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

    it("switches from Ready to Busy on re-render", () => {
        renderStatusBar(false);
        expect(container.textContent).toContain("Ready");
        renderStatusBar(true);
        expect(container.textContent).toContain("Busy");
    });

    it("switches from Busy to Ready on re-render", () => {
        renderStatusBar(true);
        expect(container.textContent).toContain("Busy");
        renderStatusBar(false);
        expect(container.textContent).toContain("Ready");
    });
});
