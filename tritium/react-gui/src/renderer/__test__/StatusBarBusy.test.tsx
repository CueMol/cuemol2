import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
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
    act(() => {
        root.render(
            React.createElement(StatusBar, { busy }),
        );
    });
}

describe("StatusBar - busy prop", () => {
    it("shows 'Ready' when busy is false", () => {
        renderStatusBar(false);
        expect(container.textContent).toContain("Ready");
        expect(container.textContent).not.toContain("Busy");
    });

    it("shows 'Busy' when busy is true", () => {
        renderStatusBar(true);
        expect(container.textContent).toContain("Busy");
        expect(container.textContent).not.toContain("Ready");
    });

    it("switches from Ready to Busy on re-render", () => {
        renderStatusBar(false);
        expect(container.textContent).toContain("Ready");

        act(() => {
            root.render(React.createElement(StatusBar, { busy: true }));
        });
        expect(container.textContent).toContain("Busy");
    });

    it("switches from Busy to Ready on re-render", () => {
        renderStatusBar(true);
        expect(container.textContent).toContain("Busy");

        act(() => {
            root.render(React.createElement(StatusBar, { busy: false }));
        });
        expect(container.textContent).toContain("Ready");
    });

    it("shows 'Ready' when busy prop is omitted", () => {
        act(() => {
            root.render(React.createElement(StatusBar, {}));
        });
        expect(container.textContent).toContain("Ready");
    });
});
