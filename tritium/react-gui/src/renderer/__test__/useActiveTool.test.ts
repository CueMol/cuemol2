import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useActiveTool } from "@renderer/features/molview/useActiveTool";

// Required for React's act() checks in test environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal renderHook without @testing-library/react
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
    get result() {
      return result;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    },
  };
}

function fireKeydown(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }));
  });
}

let hookHandle: ReturnType<typeof makeRenderHook<ReturnType<typeof useActiveTool>>>;

beforeEach(() => {
  hookHandle = makeRenderHook(() => useActiveTool());
});

afterEach(() => {
  hookHandle.unmount();
});

describe("useActiveTool", () => {
  it("initial activeTool is 'navigate'", () => {
    expect(hookHandle.result.activeTool).toBe("navigate");
  });

  it("setActiveTool updates activeTool", () => {
    act(() => {
      hookHandle.result.setActiveTool("rectSelect");
    });
    expect(hookHandle.result.activeTool).toBe("rectSelect");
  });

  it("keydown 'N' activates navigate", () => {
    act(() => {
      hookHandle.result.setActiveTool("rectSelect");
    });
    fireKeydown("N");
    expect(hookHandle.result.activeTool).toBe("navigate");
  });

  it("keydown lowercase 'n' also activates navigate", () => {
    act(() => {
      hookHandle.result.setActiveTool("rectSelect");
    });
    fireKeydown("n");
    expect(hookHandle.result.activeTool).toBe("navigate");
  });

  it("keydown 'N' with ctrlKey is ignored", () => {
    act(() => {
      hookHandle.result.setActiveTool("rectSelect");
    });
    fireKeydown("N", { ctrlKey: true });
    expect(hookHandle.result.activeTool).toBe("rectSelect");
  });

  it("keydown 'N' with metaKey is ignored", () => {
    act(() => {
      hookHandle.result.setActiveTool("rectSelect");
    });
    fireKeydown("N", { metaKey: true });
    expect(hookHandle.result.activeTool).toBe("rectSelect");
  });

  it("unregistered key 'q' does nothing", () => {
    fireKeydown("q");
    expect(hookHandle.result.activeTool).toBe("navigate");
  });

  it("unmount removes the keydown listener", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    hookHandle.unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
    // Re-mount so afterEach.unmount() doesn't fail on already-unmounted root
    hookHandle = makeRenderHook(() => useActiveTool());
  });
});

describe("useActiveTool -- focus guard", () => {
  it("keydown while INPUT is focused does nothing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    // Dispatch on the focused element so e.target is the input (bubbles to window)
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "B", bubbles: true }));
    });
    document.body.removeChild(input);
    expect(hookHandle.result.activeTool).toBe("navigate");
  });

  it("keydown while TEXTAREA is focused does nothing", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    act(() => {
      textarea.focus();
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "B", bubbles: true }));
    });
    document.body.removeChild(textarea);
    expect(hookHandle.result.activeTool).toBe("navigate");
  });
});
