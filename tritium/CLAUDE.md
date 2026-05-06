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

**Rule of thumb**: file location determines execution thread. `client/` code talks to the worker via `transport.invokeWorker(...)`. `server/services/*.service.ts` runs synchronously inside the Web Worker.

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

`WorkerService` has two dispatch tables, intentionally kept separate:

| Table | Purpose | Examples | Dispatch |
|---|---|---|---|
| `_methods` (`ServiceMethod`) | Infrastructure, hot-path events, RPC handlers | `bindCanvas`, `mouseMove`, `_rpcCreateObj`, `_rpcInvokeMethod` | `fn.apply(this, args)` (sync) |
| `_registered` (`ServiceFn`) | Business-logic services | `undo`, `loadObject`, `sceneBgColor`, `naviClickAtom` | `Promise.resolve().then(() => fn(ctx, args[0]))` |

Don't migrate `_methods` entries into `_registered` without a concrete benefit — the two tables have different invocation semantics on purpose. New business-logic actions go into a `*.service.ts` file under `server/services/`.

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

All channel name constants live in `shared/ipcChannels.ts` (`IPC` object). Types live in `shared/ipcTypes.ts`. The preload script (`preload/index.ts`) exposes them via `contextBridge` as `window.electronAPI`.

### Invoke channel that returns a value (renderer → main → renderer)

For UI operations that need a result from the main process (e.g., a native menu selection), use `ipcMain.handle` returning a Promise:

```typescript
// main/ipcHandlers.ts
ipcMain.handle(IPC.MY_ACTION, (_event, payload: MyPayload) =>
  doSomethingInMain(mainWindow, payload),
)

// main/myFeature.ts — wrap non-blocking APIs in a Promise
export function doSomethingInMain(win: BrowserWindow, payload: MyPayload): Promise<Result | null> {
  return new Promise((resolve) => {
    let chosen: Result | null = null
    // e.g. Menu.popup — click handler runs before callback (close)
    menu.popup({ window: win, callback: () => resolve(chosen) })
  })
}

// preload/index.ts
myAction: (payload: MyPayload) => ipcRenderer.invoke(IPC.MY_ACTION, payload),

// renderer
const result = await window.electronAPI.myAction(payload)
```

### Native context menus

Use `Menu.buildFromTemplate()` + `menu.popup({ window, x, y, callback })` in the main process. See `main/naviContextMenu.ts` for a complete example. The `click` handler on each item runs **before** `callback`, enabling a `Promise<action | null>` pattern.

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

Tests use **Vitest + jsdom**. Files go in `src/renderer/__test__/*.test.{ts,tsx}`. No `@testing-library/react` — use `createRoot` + `act()` directly, following the pattern in `useActiveTool.test.ts`.

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

To mock `window.electronAPI` (jsdom: `window === globalThis`):

```ts
beforeEach(() => {
    (window as any).electronAPI = { showNaviContextMenu: vi.fn() };
});
```

### React 18 + fake timers

`vi.useFakeTimers()` does **not** reliably flush `setState` from timer callbacks via `act()`. Instead, spy after mounting and either assert scheduling or capture + manually invoke the callback:

```ts
let timerCb: (() => void) | null = null;
vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: any) => { timerCb = cb; return 0 as any; });
// mount hook...
act(() => { timerCb!(); });
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

`cm.getService('ClassName')` is a thin IPC call. Prefer dedicated `AsyncCueMol` methods or worker services. Never call `getService` inside a worker service — use `ctx.strMgr`, `ctx.sceMgr`, etc.

### Auto-generated wrapper enum properties

Properties declared as `enum` in `.qif` files are typed as `number` but the C++ layer accepts/returns **strings** at runtime. Cast to bypass:

```typescript
sut.stereoMode = 'none' as unknown as number;
expect(sut.stereoMode as unknown as string).toBe('none');
```

Do not edit generated wrapper files — they are overwritten at build time.
