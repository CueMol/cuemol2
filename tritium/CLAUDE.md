# CLAUDE.md

See the root [`../CLAUDE.md`](../CLAUDE.md) for all guidance, including tritium-specific build, architecture, and testing instructions.

---

## Wrapper calling conventions

TypeScript wrappers (`tritium/core/src/wrappers/`) all extend `BaseWrapper`, which holds a `_wrapped` object and a `_utils` helper. **The same wrapper class behaves differently depending on which context it runs in.**

| Context | `_wrapped` | All method/prop calls |
|---------|------------|-----------------------|
| Worker thread (`WorkerService`, `services/*.service.ts`) | Native C++ object (addon) | **Synchronous** — no `await` |
| Renderer thread (`AsyncCueMol`, React) | `ObjProxy` (IPC proxy) | **Asynchronous** — return `Promise<T>` at runtime |

### Worker-side: fully synchronous

No `await`. Wrapper methods that return objects call `this.createWrapper(result)` internally, so the returned value is already a typed wrapper:

```typescript
const scene = ctx.sceMgr.getScene(sceneId);           // returns Scene wrapper (sync)
const cmd = ctx.cmdMgr.getCmd('load_object') as LoadObjectCommand;
cmd.target_scene = scene;                              // setProp (sync)
cmd.run();
const mol = cmd.result_object as MolCoord;             // getProp, returns wrapped MolCoord
```

To create a new C++ object in a service: `ctx.svc.createCppObj('ClassName')` (returns a typed `BaseWrapper`).

### Renderer-side: all methods return Promise at runtime

TypeScript types declare plain values, but at runtime every call through `ObjProxy` is async. Always `await`. When the declared type is not `Promise`, cast with `asAsync()` from `asyncUtils.ts`.

If you find yourself chaining multiple `await` calls on C++ wrappers in the renderer, that is a signal to write a worker-side service instead. Each `await` is one IPC round-trip; a service collapses N calls into 1.

### Passing wrappers as arguments

Setters and method parameters that accept a wrapper call `arg.wrapped` internally to extract the raw C++ object. Just pass the wrapper directly — no manual unwrapping needed:

```typescript
cmd.target_scene = scene;    // setter does: this.setProp('target_scene', scene.wrapped)
cmd.target_object = mol;
coloring.append(sel, color); // invokeMethod receives sel.wrapped, color.wrapped
```

---

## Worker service module system

Services live in `react-gui/src/renderer/worker/services/*.service.ts` and are auto-registered via `import.meta.glob` at worker startup — adding a new file is sufficient.

### Service structure

```typescript
import type { WorkerContext } from '../types/WorkerContext';

export const name = 'methodName';           // must match invokeWorker('methodName', args) call

export interface MethodNameArgs { ... }     // single object payload

export default function methodName(ctx: WorkerContext, args: MethodNameArgs): Result {
    // All C++ wrapper calls are synchronous here — no await
}
```

Async functions are also accepted; `WorkerService.invoke` wraps the return value in `Promise.resolve()`.

### WorkerContext

| Field | Type | Contents |
|-------|------|----------|
| `ctx.svc` | `WorkerService` | Full service instance — call `ctx.svc.addView(id, dpr)` etc. to reach gfx_mgr |
| `ctx.sceMgr` | `SceneManager` | Scene/view creation and lookup |
| `ctx.cmdMgr` | `CmdMgr` | Command objects (`getCmd`, `run`) |
| `ctx.strMgr` | `StreamManager` | `getInfoJSON2`, `createHandler` — **already the singleton; no need to call `getService` inside a service** |
| `ctx.styleMgr` | `StyleManager` | Style management |

### Two dispatch paths in WorkerService

| Path | When to use | Args convention |
|------|-------------|-----------------|
| `_methods` | Infrastructure, high-frequency events (`getProp/setProp/invokeMethod`, mouse/wheel, `bindCanvas`) | Positional: `apply(this, args)` |
| `_registered` (services) | Business logic with multi-step C++ operations | Single object: `args[0]` is the payload struct |

Don't migrate `_methods` entries to services unless there's a concrete benefit (IPC reduction or cleaner caller code).

---

## react-gui Tests (`tritium/react-gui/`)

```bash
cd tritium/react-gui
npm test    # vitest run
```

Tests use **Vitest + jsdom**. Files go in `src/renderer/__test__/*.test.{ts,tsx}`. No `@testing-library/react` — use `createRoot` + `act()` directly, following the pattern in `useActiveTool.test.ts`.

### Mocking AsyncCueMol in tests

`AsyncCueMol.ts` imports `@cuemol/core/src/wrappers/wrapper-loader`, which glob-imports all wrappers including `Object.ts`. This file shadows the global `Object` and causes `Object.defineProperty is not a function`. Always add these mocks when a test file imports `AsyncCueMol`:

```ts
vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));
```

### React 18 + fake timers

`vi.useFakeTimers()` does **not** reliably flush `setState` called from timer callbacks via `act()` in jsdom + React 18 concurrent mode. To test `setTimeout`-based hook behavior:

- **Spy after mounting** — install the spy on `globalThis.setTimeout` after `makeRenderHook()` so React internals during mount are not captured:

```ts
const { result, unmount } = makeRenderHook(() => useMyHook());
const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
// now trigger the code path that calls setTimeout
```

- **Test scheduling, not execution** — verify `setTimeout` was called with the right delay rather than trying to run the callback and observe state changes:

```ts
expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150);
expect(result).toBe(false); // state unchanged yet
```

- **Manual callback execution** — when you need to observe the state change, capture the callback in the mock and fire it inside `act()`:

```ts
let timerCb: (() => void) | null = null;
vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: any) => {
    timerCb = cb; return 0 as any;
});
// mount hook...
act(() => { timerCb!(); }); // fires callback; React flushes inside act
expect(result).toBe(true);
```

---

## Other API notes

### AsyncCueMol dispatch summary

| Method | Response awaited | Counted as pending |
|--------|------------------|--------------------|
| `invokeWorker` | Yes (Promise) | Yes — `isBusy()` / `subscribeBusy()` |
| `invokeWorkerWithTransfer` | Yes (Promise) | No — used only by `bindCanvas` (one-time canvas transfer at view init) |
| `resized`, `onMouseEvent`, `onWheelEvent`, `onGestureEvent` | No (fire-and-forget) | No |

### getService from renderer

`cm.getService('ClassName')` is a thin IPC call for ad-hoc singleton access (e.g. `MsgLog`, `SceneManager`). Prefer dedicated `AsyncCueMol` methods or worker services over chaining `getService` + further method calls — the chain becomes multiple IPC round-trips.

In services, use `ctx.strMgr`, `ctx.sceMgr`, etc. directly; never call `getService` inside a service.

### Reader wrapper hierarchy

```
InOutHandler  — setPath(path): void
  └─ ObjReader  — createDefaultObj(): Object, attach/detach/read
       └─ PDBFileReader, CCP4MapReader, MTZ2MapReader, ... (format-specific props)
```

`strMgr.createHandler(name, 0)` creates a new reader (category 0 = obj reader) and returns the concrete subclass.
