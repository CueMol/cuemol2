# CLAUDE.md

See the root [`../CLAUDE.md`](../CLAUDE.md) for all guidance, including tritium-specific build, architecture, and testing instructions.

---

## Worker directory layout (`renderer/worker/`)

The directory is split by execution thread:

```
renderer/worker/
├── client/   # runs in renderer thread (UI-side facade)
│   ├── AsyncCueMol.ts, WorkerTransport.ts, ObjProxy.ts, ...
│   └── apis/   # AsyncCueMol method groups (lifecycleApi, viewApi, ...)
├── server/   # runs in Web Worker thread
│   ├── worker_launcher.ts (entry), WorkerService.ts, gfx_manager.ts
│   └── services/   # *.service.ts auto-registered by import.meta.glob
└── shared/   # imported from both threads (ObjTuple, gestureAxes)
```

**Rule of thumb**: file location determines execution thread. `client/` code talks to the worker via the typed helpers `transport.invokeService<K>` / `invokeMethod<K>` / `invokeRpc<K>` (or the low-level `invokeWorker` escape hatch). `server/services/*.service.ts` runs synchronously inside the Web Worker.

The Worker entry URL in `client/WorkerTransport.ts` resolves to `../server/worker_launcher.ts` and is auto-detected by Vite — no `electron.vite.config.ts` change is needed when files move within these subdirs.

---

## Wrapper calling conventions

TypeScript wrappers (`tritium/core/src/wrappers/`) all extend `BaseWrapper`. **The same wrapper class behaves differently depending on context.**

| Context | `_wrapped` | Calls |
|---------|------------|-----------------------|
| Worker thread (`server/services/*.service.ts`) | Native C++ addon object | **Synchronous** — no `await` |
| Renderer thread (`client/AsyncCueMol`, React) | `ObjProxy` (IPC proxy) | **Asynchronous** — `Promise<T>` at runtime |

```typescript
// Worker (sync)
const scene = ctx.sceMgr.getScene(sceneId);
const cmd = ctx.cmdMgr.getCmd('load_object') as LoadObjectCommand;
cmd.target_scene = scene;  // pass wrapper directly — setter unwraps internally
cmd.run();
const mol = cmd.result_object as MolCoord;
```

If you find yourself chaining multiple `await` calls on C++ wrappers in the renderer, write a worker-side service instead — each `await` is one IPC round-trip.

### `WorkerService` method naming (worker side)

Method names on `ctx.svc` are categorised by purpose:

| Category | Example | Returns | Used by |
|---|---|---|---|
| Sync helper (public) | `ctx.svc.createObj(name)`, `ctx.svc.getService(name)` | `BaseWrapper` | service code |
| RPC handler (private) | `_rpcCreateObj`, `_rpcGetService`, `_rpcInvokeMethod` | `ObjTuple` | dispatch table only (called from renderer over postMessage) |
| Internal transport util | `toObjTuple`, `lookupNativeByObjTuple` | varies | `WorkerService` internals |

The `_rpc` prefix means **never call directly from service code** — use the public sync helper instead. The dispatch-table string keys (`'createObj'`, `'getService'`, …) are unchanged for backward compatibility.

The renderer/worker pair is symmetric:

| Renderer (async) | Worker (sync) |
|---|---|
| `cm.createObj(name)` → `Promise<BaseWrapper>` | `ctx.svc.createObj(name)` → `BaseWrapper` |
| `cm.getService(name)` → `Promise<BaseWrapper>` | `ctx.svc.getService(name)` → `BaseWrapper` |

To create a new C++ object in a service: `ctx.svc.createObj('ClassName') as TheWrapper`.

---

## Worker service module system

Services live in `react-gui/src/renderer/worker/server/services/*.service.ts` and are auto-registered via `import.meta.glob` at startup.

All service files use the **multi-service pattern**:

```ts
function actionOne(ctx, args) { ... }
function actionTwo(ctx, args) { ... }
export const services = { actionOne, actionTwo };
```

A single-action file simply exports `services = { actionOne }`. `services/index.ts` registers every entry of `services` it finds and skips files that don't export it.

### WorkerContext

| Field | Contents |
|-------|----------|
| `ctx.svc` | `WorkerService` — `addView`, `createObj`, `getService` |
| `ctx.sceMgr` | Scene/view creation and lookup |
| `ctx.cmdMgr` | Command objects (`getCmd`, `run`) |
| `ctx.strMgr` | `StreamManager` — `getInfoJSON2`, `createHandler` |
| `ctx.styleMgr` | Style management |

### `_methods` vs `_registered`

`WorkerService` has two dispatch tables, intentionally kept separate, plus an RPC handler table:

| Table | Purpose | Map (in `worker/shared/WorkerCalls.ts`) | Dispatch |
|---|---|---|---|
| `_methods` (variadic) | Infrastructure / hot-path events | `MethodMap` (`bindCanvas`, `mouseMove`, …) | `fn.apply(this, args)` (sync) |
| `_methods` (RPC) | ObjProxy bridge (proxy property access) | `RpcMap` (`createObj`, `getProp`, `invokeMethod`, …) | same as above; conceptually distinct |
| `_registered` (single-arg) | Business-logic services | `ServiceMap` (`undo`, `loadObject`, `naviClickAtom`, …) | `Promise.resolve().then(() => fn(ctx, args[0]))` |

Don't migrate `_methods` entries into `_registered` without a concrete benefit — the two tables have different invocation semantics on purpose. New business-logic actions go into a `*.service.ts` file under `server/services/` **and** a row in `ServiceMap`. Adding the row drives type-checking through `register<K>` and the renderer-side `invokeService<K>` helper.

---

## Common service patterns

### View → Scene → Object

```typescript
const view = ctx.sceMgr.getView(viewId) as GUIView;
if (!view) return { ok: false };
const scene = view.getScene();
const mol = scene.getObject(objId) as MolCoord;
if (!mol) return { ok: false };
```

Renderers: `scene.getRenderer(rendId)` or `mol.getRendererByType(type)` / `mol.getRendererByNameType(name, type)`.

### Selection (`mol.sel`)

Use `server/services/helpers/makeSel.ts` to compile a selection string:

```typescript
const sel = makeSel(ctx, selStr, scene.uid);  // returns SelCommand | null
if (!sel) return { ok: false };
mol.sel = sel;
```

Auto-create the `*selection` renderer before assigning:

```typescript
if (!mol.getRendererByType('*selection')) mol.createRenderer('*selection');
```

---

## Undo/Redo transaction

Wrap scene-mutating services with `withUndoTxn` from `server/services/withUndoTxn.ts`:

```typescript
return withUndoTxn(scene, 'Label', () => { /* mutations */ return result; });
```

- **Don't wrap**: read-only services, `createNewSceneAndView` (no UndoManager yet).
- **Nested txns are safe**: inner `startUndoTxn` inside an active outer txn is silently absorbed.
- **Never call from renderer**: undo txn APIs must only run inside worker services.
- **Executing undo/redo**: Cmd+Z / Shift+Cmd+Z → `IPC.MENU_UNDO` / `IPC.MENU_REDO` → `CmdId.Undo` / `CmdId.Redo`.

---

## IPC patterns

All channel name constants live in `shared/ipcChannels.ts` (`IPC` object). The contract — request/response shapes for invoke channels and payload types for push channels — lives in `shared/ipcContract.ts` as the `InvokeChannels` / `PushChannels` maps. The preload script (`preload/index.ts`) exposes a single typed pair via `contextBridge`:

```ts
window.electronAPI.invoke<C>(channel: C, ...args): Promise<InvokeRes<C>>
window.electronAPI.onPush<C>(channel: C, callback): () => void   // returns unsubscribe
```

`invoke` is for renderer→main request/reply; `onPush` is for main→renderer notifications.

### Adding a new invoke channel

1. Add the channel constant to `shared/ipcChannels.ts`.
2. Add a row to `InvokeChannels` in `shared/ipcContract.ts`: `[IPC.MY_ACTION]: { req: MyPayload; res: MyResult }`.
3. Register the handler in `main/ipcHandlers.ts` via the typed `handleInvoke` wrapper:
   ```ts
   handleInvoke(IPC.MY_ACTION, (_event, payload) => doSomethingInMain(mainWindow, payload))
   ```
4. Call from renderer: `await window.electronAPI.invoke(IPC.MY_ACTION, payload)` — `payload` and the resolved value are typed by the map.

For `req: void` channels, `invoke(IPC.X)` works with no second arg (variadic-tuple `InvokeArgs<C>`).

### Adding a new push channel

1. Add the channel constant + a row to `PushChannels`.
2. Send from main: `mainWindow.webContents.send(IPC.X, payload)`.
3. Subscribe from renderer: `window.electronAPI.onPush(IPC.X, (payload) => ...)`. The callback is typed; `void`-payload channels take a `() => void` callback.

### Native context menus

Use `Menu.buildFromTemplate()` + `menu.popup({ window, x, y, callback })` in the main process. See `main/naviContextMenu.ts` for a complete example. The `click` handler on each item runs **before** `callback`, enabling a `Promise<action | null>` pattern returned through `IPC.NAVI_CTX_SHOW`.

### Generic-dispatch design pattern (cross-process)

The same shape recurs in every renderer↔(other-thread) boundary:

| Boundary | Map file | Generic dispatcher |
|---|---|---|
| renderer ↔ main | `shared/ipcContract.ts` (`InvokeChannels` / `PushChannels`) | `electronAPI.invoke<C>` / `onPush<C>` |
| renderer ↔ Web Worker | `worker/shared/WorkerCalls.ts` (`ServiceMap` / `MethodMap` / `RpcMap`) | `cm.invokeService<K>` / `invokeMethodTyped<K>` / `invokeRpc<K>` |
| renderer-internal command bus | `commands/CommandMap.ts` | `useCommands().dispatch<K>` / `useRegisterCommand<K>` |

Workflow when adding a feature: (1) add a row to the relevant map; (2) implement the producer side (`handleInvoke`, `*.service.ts`, `useRegisterCommand`); (3) call from the consumer side. The compiler walks both sides for you.

Variadic-tuple trick for `void` args (used in all three): `type Args<K> = X extends void ? [] : [X]` so `dispatch(id)` works for void-args entries while non-void requires the payload.

---

## OffscreenCanvas / WebGL lifecycle constraints

`MolViewPane` (`react-gui/src/renderer/components/panes/MolViewPane.tsx`) calls `canvas.transferControlToOffscreen()` to hand the canvas to the Web Worker. This API has hard constraints:

- **One-shot per canvas element** — calling it a second time throws `InvalidStateError`.
- **After transfer, the renderer thread cannot read canvas pixels** — the Worker owns the context.
- **`GfxManager._canvas` has no unbind path** — once `bindCanvas()` is called, the OffscreenCanvas is held for the Worker's lifetime.

**Design rules that follow from these constraints:**

- `MolViewPane` must **stay mounted from its first render until app exit**. `ContentPane.tsx` uses an `everHadMolViewRef` flag so that the component is never unmounted even when all molview tabs are closed. Unmounting would destroy the canvas DOM and make re-binding impossible.
- Adding a new view (new scene tab) uses `addView()` (via `createNewSceneAndView.service.ts`), **not** `bindCanvas()`. `bindCanvas()` is the one-time WebGL init that also transfers the OffscreenCanvas; `addView()` attaches a new C++ View to the already-bound canvas.
- Closing a molview tab must call both `removeMolTab(viewId)` and `cm.removeView(viewId)`. Skipping these leaks `MolTabState` entries and leaves the Worker `bound_views` and view loop running indefinitely.

**Clean-up responsibility** (wired in `App.tsx` via `useTabManager({ onMolViewClose })`):
1. `removeMolTab(viewId)` — removes the entry from `MolTabState`
2. `cm.removeView(viewId)` — stops the view loop and removes from Worker `bound_views`

Note: the C++ `View` / `Scene` objects are not destroyed by `removeView`; that is a separate future concern.

---

## react-gui Tests (`tritium/react-gui/`)

```bash
cd tritium/react-gui && npm test    # vitest run
```

Tests use **Vitest + jsdom**. Files go in `src/renderer/__test__/*.test.{ts,tsx}`. No `@testing-library/react` — use `createRoot` + `act()` directly, following the pattern in `useActiveTool.test.ts`. Common helpers (`makeRenderHook`, `mountTree`, `setupElectronAPI`, `flushPromises`) live in `__test__/helpers/testHarness.tsx`.

### Required mocks

Always add when a test imports `AsyncCueMol` or any component/hook that uses `useCueMol`:

```ts
vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));
// If the component/hook calls useCueMol():
vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: false, cm: null }),
}));
```

To mock `window.electronAPI`, use the helper (matches the post-B `invoke` / `onPush` shape):

```ts
import { setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

beforeEach(() => { api = setupElectronAPI() })
afterEach(() => { teardownElectronAPI() })
// To route a specific channel, override:
//   setupElectronAPI({ invoke: vi.fn((c, p) => c === IPC.X ? mockX(p) : Promise.resolve()) })
```

`setupElectronAPI` returns the mock object so you can assert on `api.invoke.mock.calls` directly.

### `import React` is required at vitest runtime

Vitest's JSX transform uses the **classic** runtime even when production (electron-vite) uses automatic JSX. Files containing JSX MUST `import React from 'react'`; if React isn't otherwise referenced, add `void React` after the import to silence `noUnusedLocals` without removing the runtime-required identifier.

### Stabilizing callbacks in effect deps

A callback prop recreated on every render (e.g. `getActiveSceneInfo: () => ({ ... })`) will retrigger a `useEffect` whose dep list includes it, which in a tab-switch fetch can race with state set by user-action callbacks (the fetch resolves *after* the user click and overwrites the new value). When an effect needs to *read* a callback but should not *re-run* on its identity change, capture it via a ref:

```ts
const cbRef = useRef(callback)
cbRef.current = callback
useEffect(() => {
  // ... use cbRef.current() instead of callback ...
}, [/* identity-stable deps only */])
```

`hooks/useActiveViewState.ts` uses this pattern for `getActiveSceneInfo`.

### React 18 + fake timers

`vi.useFakeTimers()` does **not** reliably flush `setState` from timer callbacks via `act()`. Instead, spy after mounting and either assert scheduling or capture + manually invoke the callback:

```ts
let timerCb: (() => void) | null = null;
vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: any) => { timerCb = cb; return 0 as any; });
// mount hook...
act(() => { timerCb!(); });
```

### Worker-service tests with wrapper setter spying

Worker services often assign values to C++ wrapper setters (`(rend as MolRenderer).sel = sel`, `mol.name = ...`, `cmd.target_object = mol`). To pin this contract in vitest without a real native addon, mock the wrapper as a plain object literal whose accessor records the assignment:

```ts
const setSel = vi.fn()
const rend = {
  get sel() { return undefined },
  set sel(v: unknown) { setSel(v) },
}
// ...later...
expect(setSel).toHaveBeenCalledWith(expectedValue)  // or .not.toHaveBeenCalled()
```

`vi.mock('../worker/server/services/helpers/<name>', () => ({ ... }))` stubs cross-helper dependencies (`makeSel`, `molPostProc`, `getDefaultStyleName`, …) so the test isolates the service under test. For services exported as plain functions (not via the `services` object), import them directly after the mocks:

```ts
vi.mock('../worker/server/services/helpers/makeSel', () => ({ makeSel: vi.fn(() => ({ __sel: true })) }))
import { setupRenderer } from '../worker/server/services/setupRenderer.service'
```

Use this when pinning a cross-layer invariant (e.g. "field X gates whether wrapper Y is touched"). See `__test__/setupRendererService.test.ts` for a four-case example covering true/false toggle, special-value short-circuit, and class-name short-circuit.

---

## Other API notes

### AsyncCueMol dispatch summary

Prefer the typed helpers (`invokeService`, `invokeMethodTyped`, `invokeRpc`) — they pin the args/result shape against `WorkerCalls.ts`. The untyped `invokeWorker` is a low-level escape hatch that returns the raw response array tail.

| Method | Maps to | Awaits | Pending count |
|--------|---------|--------|---------------|
| `invokeService<K>(name, args)` | `ServiceMap[K]` | Yes | Yes |
| `invokeMethodTyped<K>(name, ...args)` | `MethodMap[K]` | Yes | Yes |
| `invokeRpc<K>(name, ...args)` | `RpcMap[K]` (used by `ObjProxy`) | Yes | Yes |
| `invokeWorker(method, ...args)` | none — raw transport | Yes | Yes — `isBusy()` / `subscribeBusy()` |
| `invokeWorkerWithTransfer` | raw transport with transferable | Yes | No — used only by `bindCanvas` |
| `resized`, `onMouseEvent`, `onWheelEvent`, `onGestureEvent` | direct `postMessage` | No (fire-and-forget) | No |

### getService from renderer

`cm.getService('ClassName')` is a thin IPC call. Prefer dedicated `AsyncCueMol` methods or worker services. Never call `getService` inside a worker service — use `ctx.strMgr`, `ctx.sceMgr`, etc.

### Auto-generated wrapper enum properties

Properties declared as `enum` in `.qif` files are typed as `number` but the C++ layer accepts/returns **strings** at runtime. Cast to bypass:

```typescript
sut.stereoMode = 'none' as unknown as number;
expect(sut.stereoMode as unknown as string).toBe('none');
```

Do not edit generated wrapper files — they are overwritten at build time.

---

## Per-dialog factory pattern

`hooks/useDialogFactory.tsx` exports `createDialogHook<TArgs, TResult>({ render, name })` which returns a `Provider` and `useShow` pair. Each dialog gets its own provider file under `components/dialogs/XxxDialogProvider.tsx` (or `components/.../XxxDialogProvider.tsx` for nested groups), and `contexts/DialogContext.tsx` mounts them as a composite.

```tsx
// components/dialogs/AboutDialogProvider.tsx
import React from 'react'
import { AboutDialog } from './AboutDialog'
import { createDialogHook } from '../../hooks/useDialogFactory'
void React  // required by classic JSX runtime in vitest

export const { Provider: AboutDialogProvider, useShow: useShowAboutDialog } =
  createDialogHook<void, void>({
    name: 'AboutDialog',
    render: ({ visible, resolve }) => (
      <AboutDialog visible={visible} onClose={() => resolve()} />
    ),
  })
```

Caller side:

```ts
const showAbout = useShowAboutDialog()  // (args) => Promise<result>
await showAbout()
```

The render-prop maps the dialog's existing `onConfirm`/`onCancel`/`onClose` props to a single `resolve(result)` call. Existing `Xxx.tsx` dialog components do **not** need to change — only the provider wrapper.
