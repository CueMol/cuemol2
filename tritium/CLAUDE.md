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

Services live in `react-gui/src/renderer/worker/services/*.service.ts` and are auto-registered via `import.meta.glob` at worker startup (`services/index.ts`).

### Two registration patterns

**Single-service** (one function per file):

```typescript
import type { WorkerContext } from '../types/WorkerContext';

export const name = 'methodName';

export interface MethodNameArgs { ... }

export default function methodName(ctx: WorkerContext, args: MethodNameArgs): Result {
    // All C++ wrapper calls are synchronous here — no await
}
```

**Multi-service** (multiple functions in one file, used when actions are tightly related):

```typescript
export const services = {
    actionOne,
    actionTwo,
    actionThree,
};
```

`index.ts` checks for `services` first, then falls back to `name + default`. Use the multi-service pattern when grouping related operations avoids duplicating imports and internal helpers (e.g. `naviTool.service.ts`, `naviCtxtMenu.service.ts`).

Async functions are accepted in both patterns; `WorkerService.invoke` wraps the return value in `Promise.resolve()`.

### WorkerContext

| Field | Type | Contents |
|-------|------|----------|
| `ctx.svc` | `WorkerService` | Full service instance — call `ctx.svc.addView(id, dpr)`, `ctx.svc.createCppObj('ClassName')`, etc. |
| `ctx.sceMgr` | `SceneManager` | Scene/view creation and lookup |
| `ctx.cmdMgr` | `CmdMgr` | Command objects (`getCmd`, `run`) |
| `ctx.strMgr` | `StreamManager` | `getInfoJSON2`, `createHandler` — already the singleton |
| `ctx.styleMgr` | `StyleManager` | Style management |

### Two dispatch paths in WorkerService

| Path | When to use | Args convention |
|------|-------------|-----------------|
| `_methods` | Infrastructure, high-frequency events (`getProp/setProp/invokeMethod`, mouse/wheel, `bindCanvas`) | Positional: `apply(this, args)` |
| `_registered` (services) | Business logic with multi-step C++ operations | Single object: `args[0]` is the payload struct |

Don't migrate `_methods` entries to services unless there's a concrete benefit (IPC reduction or cleaner caller code).

---

## Common service patterns

### View → Scene → Object access

The standard chain inside a service:

```typescript
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';

const view = ctx.sceMgr.getView(viewId) as GUIView;
if (!view) return { ok: false };
const scene = view.getScene();
const mol = scene.getObject(objId) as MolCoord;
if (!mol) return { ok: false };
```

Renderers are looked up on the scene (`scene.getRenderer(rendId)`) or on an object (`mol.getRendererByType(type)` / `mol.getRendererByNameType(name, type)`) — both inherited from the `Object` wrapper.

### Creating C++ objects

Use `ctx.svc.createCppObj('ClassName')` and cast to the appropriate wrapper type:

```typescript
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
const pos = ctx.svc.createCppObj('Vector') as Vector;
pos.set3(x, y, z);
```

### Selection (`mol.sel`) operations

`mol.sel` getter returns `MolSelection` (has `.toString()`). The setter accepts `MolSelection`. `SelCommand extends MolSelection`, so a compiled `SelCommand` can be assigned directly.

Use `helpers/makeSel.ts` to create and compile a `SelCommand`:

```typescript
import { makeSel } from './helpers/makeSel';

// compile a selection string
const sel = makeSel(ctx, selStr, scene.uid);  // returns SelCommand | null
if (!sel) return { ok: false };
mol.sel = sel;

// empty selection (unselect) — pass '' to skip compile
const emptySel = makeSel(ctx, '', scene.uid);
mol.sel = emptySel!;
```

Before assigning `mol.sel`, auto-create the `*selection` renderer so the selection is visible in the viewport:

```typescript
function autoCreateSelRend(mol: MolCoord): void {
    const selRend = mol.getRendererByType('*selection');
    if (!selRend) mol.createRenderer('*selection');
}
```

### Typical selection-mutation service

```typescript
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

function naviCtxSelect(ctx: WorkerContext, args: NaviCtxSelectArgs): { ok: boolean } {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!view) return { ok: false };
    const scene = view.getScene();
    const mol = scene.getObject(args.objId) as MolCoord;
    if (!mol) return { ok: false };

    withUndoTxn(scene, 'Select atom(s)', () => {
        const selRend = mol.getRendererByType('*selection');
        if (!selRend) mol.createRenderer('*selection');
        const sel = makeSel(ctx, args.selStr, scene.uid);
        if (sel) mol.sel = sel;
    });
    return { ok: true };
}
```

---

## Undo/Redo transaction

Edit services that mutate scene state wrap their body with `withUndoTxn` from `services/withUndoTxn.ts`:

```typescript
import { withUndoTxn } from './withUndoTxn';

export default function myService(ctx: WorkerContext, args: MyArgs): Result {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return withUndoTxn(scene, 'Human-readable label', () => {
        // scene mutations here
        return result;
    });
}
```

**When to wrap**: services that add/remove objects, create/delete renderers, or otherwise mutate scene state.

**When NOT to wrap**: read-only services, `createNewSceneAndView` (fresh scene has no UndoManager yet), pure infrastructure services.

**Nested txns are safe**: `UndoManager` tracks `m_nTxnNestLevel`. An inner `startUndoTxn` inside an active outer txn increments the counter and returns — the inner txn is silently absorbed. Services that call helpers which also use `withUndoTxn` work correctly without coordination.

**Multiple sequential txns**: call `withUndoTxn` multiple times in one service to produce independent undo steps.

**Never call from renderer**: `startUndoTxn`/`commitUndoTxn`/`rollbackUndoTxn` must only run inside worker services.

**Executing undo/redo**: `cm.undo(scene_id)` / `cm.redo(scene_id)` dispatch to the `undo` / `redo` worker services. Depth `0` = one undo step. Cmd+Z / Shift+Cmd+Z sends `IPC.MENU_UNDO` / `IPC.MENU_REDO` from main → renderer → `CmdId.Undo` / `CmdId.Redo`.

---

## react-gui Tests (`tritium/react-gui/`)

```bash
cd tritium/react-gui
npm test    # vitest run
```

Tests use **Vitest + jsdom**. Files go in `src/renderer/__test__/*.test.{ts,tsx}`. No `@testing-library/react` — use `createRoot` + `act()` directly, following the pattern in `useActiveTool.test.ts`.

### Mocking AsyncCueMol and useCueMol in tests

`AsyncCueMol.ts` imports `@cuemol/core/src/wrappers/wrapper-loader`, which glob-imports all wrappers including `Object.ts`. This file shadows the global `Object` and causes `Object.defineProperty is not a function`. Always add these mocks when a test file imports `AsyncCueMol` **or** a component that uses `useCueMol`:

```ts
vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));
```

For components that call `useCueMol()`, mock the hook directly so the component renders without requiring a `CueMolProvider`:

```ts
vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: false, cm: null }),
}));
```

### React 18 + fake timers

`vi.useFakeTimers()` does **not** reliably flush `setState` called from timer callbacks via `act()` in jsdom + React 18 concurrent mode. To test `setTimeout`-based hook behavior:

- **Spy after mounting** — install the spy on `globalThis.setTimeout` after `makeRenderHook()` so React internals during mount are not captured.

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
| `invokeWorkerWithTransfer` | Yes (Promise) | No — used only by `bindCanvas` |
| `resized`, `onMouseEvent`, `onWheelEvent`, `onGestureEvent` | No (fire-and-forget) | No |

### getService from renderer

`cm.getService('ClassName')` is a thin IPC call for ad-hoc singleton access. Prefer dedicated `AsyncCueMol` methods or worker services over chaining `getService` + further method calls.

In services, use `ctx.strMgr`, `ctx.sceMgr`, etc. directly; never call `getService` inside a service.

### Auto-generated wrapper enum properties

Properties declared as `enum` in `.qif` files are typed as `number` in the generated TypeScript wrappers, but the C++ scripting layer accepts and returns **strings** at runtime (e.g. `stereoMode: 'none' | 'para' | 'cross' | 'hardware'`). Cast to bypass the incorrect declaration:

```typescript
sut.stereoMode = 'none' as unknown as number;
expect(sut.stereoMode as unknown as string).toBe('none');
```

Do not change the generated wrapper files to fix this — they are overwritten at build time.
