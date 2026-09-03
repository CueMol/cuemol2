# CLAUDE.md

See the root [`../CLAUDE.md`](../CLAUDE.md) for all guidance, including tritium-specific build, architecture, and testing instructions.

---

## Comment & docstring convention (`react-gui/src/`)

Use JSDoc/TSDoc — a `/** ... */` block placed **immediately before** the
declaration. There is no ESLint enforcement; consistency is by convention.

**File header** (top of file, before imports):

```ts
/**
 * @file <path relative to src>
 * @description <one-paragraph summary of the module's responsibility>
 *
 * <optional extra paragraphs: execution thread, design decisions>
 */
```

**Function / hook / component:**

```ts
/**
 * <1-2 sentence summary of what it does>
 *
 * @param x - <meaning>
 * @returns <meaning>
 * @remarks <optional: caveats, parity notes>
 */
```

Rules:
- Document every exported function / component / hook, plus internal
  helpers whose logic is not self-evident. Trivial one-line functions may
  be skipped.
- Comments are English and ASCII-only (no `─`, `→`, `—`, `…`). Use `--`,
  `->`, `-` and `...`. Section banners: `// --- Section ---`.
- Do not leave migration-process labels (`Phase 5b`, etc.) in committed
  code — they are meaningless once the work lands. Fold any still-useful
  context into the `@description` / `@remarks` prose.

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
└── shared/   # imported from both threads
    ├── calls/   # the renderer <-> worker contract, one slice per domain
    │            #   (scene.ts, anim.ts, ...), assembled in calls/index.ts
    └── ...      # boundary DTOs: result.ts, animTypes.ts, hitTest.ts,
                 #   sceneTreeTypes.ts, fileOpenTypes.ts, mapHeader.ts,
                 #   multiGradPresets.ts, eventConst.ts, renderTypes.ts
```

**A shape both threads name goes in `worker/shared/`**, even when one side
feels like its owner. ESLint enforces the direction (as an error, not a
warning): `worker/server/` may not import from the UI tree at all, and the UI
may not import a worker *service* at runtime. Both directions shipped as real
bugs before the rules existed -- a File Open pane importing
`probeMapHeader.service` pulled worker code expecting `fs` into the renderer
bundle, and the colouring service importing `components/multigrad/` pulled a
components module into the worker bundle.

```
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

| Table | Purpose | Map (in `worker/shared/calls/`) | Dispatch |
|---|---|---|---|
| `_methods` (variadic) | Infrastructure / hot-path events | `MethodMap` (`bindCanvas`, `mouseMove`, …) | `fn.apply(this, args)` (sync) |
| `_methods` (RPC) | ObjProxy bridge (proxy property access) | `RpcMap` (`createObj`, `getProp`, `invokeMethod`, …) | same as above; conceptually distinct |
| `_registered` (single-arg) | Business-logic services | `ServiceMap` (`undo`, `loadObject`, `naviClickAtom`, …) | `Promise.resolve().then(() => fn(ctx, args[0]))` |

Don't migrate `_methods` entries into `_registered` without a concrete benefit — the two tables have different invocation semantics on purpose. New business-logic actions go into a `*.service.ts` file under `server/services/` **and** a row in the matching `worker/shared/calls/<domain>.ts` slice (plus its key in that file's `*_KEYS` list -- `calls/index.test.ts` checks the slices against the services the worker actually registers). Adding the row drives type-checking through `register<K>` and the renderer-side `invokeService<K>` helper.

---

## Common service patterns

### Service results: return `Result`, never throw across the boundary

`worker/shared/result.ts` defines the wire contract for a service outcome:

```ts
type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: FailCode }
// FailCode = 'not-found' | 'invalid-args' | 'unsupported' | 'canceled' | 'io' | 'native'
ok({ objId })             // success (payload optional)
fail('scene not found', 'not-found')
failFrom(e, 'io')         // wrap a caught exception (uses Error.message)
```

- A service **returns** a `Result`; it must not let an exception escape. Wrap
  C++ calls that can throw in `try/catch -> failFrom(e)` (or `safeRead`).
  `WorkerService` still converts an escaped throw into a rejected promise, but
  logs it as a contract violation (`threw instead of returning fail()`): on the
  renderer side a rejection now means "bug or worker crash", never an expected
  failure.
- `Fail.error` is required, so `tsc` flags any bare `{ ok: false }`.
- Renderer callers branch on `res.ok` (`if (!res.ok) showErrorAlert(res.error)`),
  and on `res.code === 'canceled'` where a user cancel must stay silent.
- Keep a failure-side payload (`Ok<A> | (Fail & B)`) as a documented exception
  only (e.g. `GetMtzColumnInfoResult`); by default `Fail` carries no data.

### View → Scene → Object

```typescript
const view = ctx.sceMgr.getView(viewId) as GUIView;
if (!view) return fail('view not found', 'not-found');
const scene = view.getScene();
const mol = scene.getObject(objId) as MolCoord;
if (!mol) return fail('object not found', 'not-found');
```

Renderers: `scene.getRenderer(rendId)` or `mol.getRendererByType(type)` / `mol.getRendererByNameType(name, type)`. `scene.getRenderer` returns the same wrapper for both regular renderers and renderer groups (RendGroup extends Renderer in C++).

### Selection (`mol.sel`)

Use `server/services/helpers/makeSel.ts` to compile a selection string:

```typescript
const sel = makeSel(ctx, selStr, scene.uid);  // returns SelCommand | null
if (!sel) return fail('invalid selection', 'invalid-args');
mol.sel = sel;
```

Auto-create the `*selection` renderer before assigning:

```typescript
if (!mol.getRendererByType('*selection')) mol.createRenderer('*selection');
```

### Wrapper duck-typing

Many C++ methods exist only on specific subclasses (e.g. `fitView` is on `MolCoord` but not on `Object`; `has_center` / `getCenter` are on `Renderer` but may throw for some renderer types). Generated TS wrapper types do not reflect the runtime subclass. Probe with `in` / `typeof` before calling, matching the UXP `'fitView' in target` pattern:

```typescript
if (typeof (obj as unknown as Record<string, unknown>).fitView === 'function') {
    (obj as unknown as MolCoord).fitView(view, false);
}
```

Wrap property reads that may throw in a small `safeRead` helper rather than letting the service crash — getters can throw `"Property X is read only"` or `"Method not found"` for missing-on-subclass cases.

### Nested (dot-path) properties: read through them, never write through them

`getProp('a.b')` / `setProp('a.b', v)` reach C++ `LPropSupport::getNestedProperty` /
`setNestedProperty`, whose `NestedPropHandler` has two non-obvious limits:

- When a segment of the path does not resolve (unknown property, not an object, null) it
  **falls back to the root object silently** with the full dotted name, so a typo becomes a
  write to an unknown root property that fails quietly instead of loudly.
- A by-value `object<Foo>` property (no `$`) is returned as a copy: a nested write lands on
  the copy, not on the object.

Rule: to write into a child object, get it once (`const child = parent.getProp('block')`,
a smart-pointer property, so the same C++ object) and call plain `setProp` / `resetProp` /
`getProp` / `getPropsJSON` on it. Keep dotted keys as TS-side map keys only. The generic
property inspector's dot-path writes are the one accepted exception (its rows come from
`getPropsJSON`, so every path exists). See `docs/architecture/scene-app-data.md`.

### Scene-content JSON schemas (C++ source of truth)

The worker side typically reads scene contents via JSON-returning methods. Their shapes are stable and worth knowing:

| API | Shape | Notes |
|---|---|---|
| `scene.getSceneDataJSON()` | `[sceneNode, ...objectNodes]` flat array | Scene element has `type: ""`, object element has C++ class name. **Does not include cameras or styles.** |
| Object's `rends` field in the above | array of renderers / groups | Groups are distinguished by the presence of a `childNodes` array (regular renderers omit that field). |
| `scene.getCameraInfoJSON()` | `[{ name, vis_size, src }, ...]` | Cameras are owned by the scene but **not** in `getSceneDataJSON`. |
| `StyleMgr.getStyleNamesJSON(sceneId)` | `[{ name }, ...]` | Style sets are owned by `StyleManager` service, not the scene. |

When mirroring UXP behaviour where a single tree view shows scene + cameras + styles, the worker side must call all three APIs and synthesise the combined structure; never assume one JSON covers everything.

### IDs are not URLs

The numeric `ID` returned in the JSON shapes above is a C++ `qlib::uid_t`. Treat it as opaque — never invent negative or large values for "virtual" UI rows except via clearly-marked synthesisers (see `buildCameraRoot` / `buildStyleRoot` in `sceneTreeTypes.ts`). Real C++ uids are non-negative.

---

## CueMol event framework

CueMol has its own event manager (`qlib::ScrEventManager`, exposed as `cuemol.evtMgr` in UXP). C++ scenes fire events when objects, renderers, cameras, styles, or properties change. Subscribing keeps renderer state in sync **without polling** and is the only correct way to react to changes made outside the current call path (e.g. a PDB load triggered by another tab, an undo/redo, or a script).

### Subscribing from the renderer

`AsyncCueMol` exposes `addEventListener` / `removeEventListener` that bridge to the worker-side `qlib::ScrEventManager`. Pattern (see `hooks/useLogEvent.ts`, `hooks/useSceneTree.ts`):

```ts
import { SEM_SCENE, SEM_OBJECT, SEM_RENDERER, SEM_CAMERA, SEM_STYLE, SEM_ANY } from '../event'

useEffect(() => {
    if (!cm || sceneId === undefined) return
    let cbid: number | null = null
    let cancelled = false
    ;(async () => {
        const id = await cm.addEventListener(
            '',                                                  // category string ('log' for log events, '' for source-uid match)
            SEM_SCENE | SEM_OBJECT | SEM_RENDERER | SEM_CAMERA | SEM_STYLE,  // source-type bitmask (OR-combine)
            SEM_ANY,                                             // event-type filter (or SEM_ADDED / SEM_REMOVING / SEM_PROPCHG / SEM_CHANGED)
            sceneId,                                             // source uid scope (use scene.uid; SEM_ANY for global)
            (args) => {
                if (cancelled) return
                // args has: { evtType, srcUID, obj: { ... }, method?, ... }
                handleEvent(args)
            },
        )
        if (cancelled) cm.removeEventListener(id).catch(() => {})
        else cbid = id
    })()
    return () => {
        cancelled = true
        if (cbid !== null) cm.removeEventListener(cbid).catch(() => {})
    }
}, [cm, sceneId])
```

### Constants

All filter constants are exported from `renderer/event.ts`:

| Group | Constants |
|---|---|
| Source category bitmask | `SEM_LOG` `SEM_INDEV` `SEM_SCENE` `SEM_OBJECT` `SEM_RENDERER` `SEM_VIEW` `SEM_CAMERA` `SEM_STYLE` `SEM_ANIM` `SEM_EXTND` |
| Event type | `SEM_ADDED` `SEM_REMOVING` `SEM_PROPCHG` `SEM_CHANGED` `SEM_OTHER` |
| Wildcard | `SEM_ANY` (-1) — matches any source type **and** any event type depending on which argument it's passed as |

### Event payload (`args`)

| Field | Meaning |
|---|---|
| `args.evtType` | One of `SEM_ADDED` / `SEM_REMOVING` / `SEM_PROPCHG` / `SEM_CHANGED` |
| `args.srcUID` | The uid of the firing scene / object |
| `args.obj` | Event-specific payload object |
| `args.obj.target_uid` | The uid of the affected object / renderer (used by ADDED / REMOVING / PROPCHG) |
| `args.obj.propname` | Property name on PROPCHG (e.g. `"name"`, `"visible"`, `"locked"`, `"group"`) |
| `args.method` | Some events carry a method label (`"cameraRemoving"`, `"styleRemoving"`, `"sceneAllCleared"`, `"sceneLoaded"`) |

The UXP reference is `uxp_gui/cuemol2/base/content/workspace_panel.js` `_attachScene`.

### Debouncing event bursts

A single high-level operation (PDB load, scene load, paste, undo) fires **many** events in quick succession. If the listener triggers an expensive refetch / re-render per event, the UI jitters. Coalesce them with `useCueMolEventListener({ debounceMs: EVENT_BURST_DEBOUNCE_MS })` (`renderer/lib/timing.ts`; never a local `30`). An event that must not open or consume a debounce window (e.g. a `ui_collapsed` PROPCHG) goes through the listener's `filter`, which runs before the debounce.

### Fetch + auto-refresh: `useLiveFetch` (hooks/cuemol/)

A panel hook that fetches from the worker and refetches on scene events uses `useLiveFetch({ cm, initial, fallback, fetch, fetchDeps, listeners })` instead of hand-rolling `useState` + `refetch` + `useEffect` + listener. It owns the **stale-fetch guard**: a fetch that resolves after a newer one started is dropped, so switching A -> B can never end with A's late result on screen. For a one-off async result outside `useLiveFetch`, take a token from `useStaleGuard()` (`hooks/react/useStaleGuard.ts`) and check `isCurrent(token)` before applying the result. Never write a `tokenRef` / `let cancelled` guard by hand.

### Where a hook goes

A hook lives with whatever **owns** it, and `hooks/` is only for the ones nothing owns:

| | |
|---|---|
| Used by one component | Next to that component (its feature directory). Most hooks are this: 48 of the 71 have a single consumer -- they are that component's implementation, not shared code. |
| Shared, needs React only | `hooks/react/` -- ESLint rejects any import of CueMol, IPC, `@shared`, `@main` or a feature from here, which is what keeps the name true. |
| Shared, talks to the CueMol worker | `hooks/cuemol/` -- the React binding layer over `worker/client` (`useCueMol`, `useCueMolEventListener`, `useLiveFetch`, `useMolEditCommit`). |
| Owns app state / chrome / dialogs | `state/`, `shell/`, `dialogs/` respectively, not `hooks/`. |

Do not add a hook directly under `hooks/`: pick the owner, or one of the two groups above. A plain (non-hook) helper follows the same rule and lands in `utils/` only when nothing owns it.

### When to use the event manager (vs alternatives)

- **Use the event manager** when state on the renderer must stay in sync with C++ state that any code path (worker service, undo, IPC) may mutate. This is the only path that catches mutations originating outside the current call.
- **Use service-result refetch** when you know exactly which mutation just happened and can refresh once on success. Acceptable for one-shot operations but does not catch concurrent mutations.
- **Never poll** for scene-state changes.

### Cleanup is mandatory

`cm.addEventListener` holds the callback on the worker side until `removeEventListener` is called. Forgetting cleanup leaks listeners across scene switches and causes "ghost" handlers to fire on stale state. Always return a cleanup function from `useEffect`, and guard the async-resolve-after-unmount race with a `cancelled` flag (see template above).

---

## Undo/Redo transaction

Wrap scene-mutating services with a helper from `server/services/withUndoTxn.ts`:

```typescript
// Default: body returns a Result; Fail or throw -> rollback, Ok -> commit.
return undoTxnResult(scene, 'Label', () => {
    if (!something) return fail('...', 'invalid-args');
    /* mutations */
    return ok({ ... });
});

// Only for a body that always mutates and cannot fail short of throwing.
return withUndoTxn(scene, 'Label', () => { /* mutations */ return result; });
```

- **Prefer `undoTxnResult`**. C++ `UndoManager::commitTxn` clears the redo stack
  even for an *empty* transaction, so a `withUndoTxn` body that bails out early
  without mutating silently kills the user's Redo. `undoTxnResult` rolls back
  on a `Fail` return, which touches neither stack.
- `withUndoTxn` rethrows; the caller is responsible for translating the throw.
  Keep it for bodies that unconditionally mutate.

- **Don't wrap**: read-only services, `createNewSceneAndView` (no UndoManager yet), `loadScene` (a whole-scene load is not an edit -- wrapping it captures the object-registration records and leaves a bogus undo entry; UXP `qsc-io.readSceneFile` / C++ `LoadSceneCommand::run()` run outside any txn so the records are discarded and the stack stays empty).
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
| renderer ↔ Web Worker | `worker/shared/calls/` (`ServiceMap` / `MethodMap` / `RpcMap`) | `cm.invokeService<K>` / `invokeMethodTyped<K>` / `invokeRpc<K>` |
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
- Closing a molview tab removes the tab record **and** calls `cm.removeView(viewId)`, in that order, after the save prompt. Skipping the second leaves the Worker `bound_views` and view loop running indefinitely.

**Tab ownership** lives in `state/workspace/` (`WorkspaceProvider`). One record per tab carries both the view and the scene, so `useActiveScene()` reads `activeSceneId` / `activeMolViewId` off the same record in the same render -- they can never disagree by a frame. The provider owns the two lifecycle effects (`cm.activateView` for the visible molview; `cm.removeView` inside `closeTab`), and `WorkspaceProvider.test.tsx` pins "activated once per activation, removed exactly once per close". Do not call `removeView` from anywhere else. Readers pick the slice they need: `useWorkspaceDispatch()` (stable, never re-renders), `useWorkspaceTabs()` (the strip), `useActiveScene()` (scene / view ids only).

Note: the C++ `View` / `Scene` objects are not destroyed by `removeView`; that is a separate future concern.

### Worker-thread rAF vs message-handler tasks (GL call timing)

The Web Worker owns the GL context for its whole lifetime (`GfxManager._canvas` has no unbind path, above), so a GL call is legal from **any** Worker task, not only from the rAF callback. Message-handler / service tasks already call GL directly in production: `WorkerService.resized()` runs a full `drawScene` synchronously, `GfxManager.activateView()` issues a redraw, and `exportImage.service.ts` renders to an FBO + `readPixels`. None of these run inside rAF and all are correct -- the safety comes from the context being held, not from being in rAF.

What the rAF callback owns is **present**: one tick runs `cuemol.performIdleTasks()` then `checkAndUpdateScenes()` (`ViewLoopController`), in that order, and re-schedules itself unconditionally. Consequences:

- To ask for a redraw, set `Scene::setUpdateFlag()` (a single bool the rAF loop polls); do not drive `drawScene` yourself from an event handler.
- Timer-driven state changes (AnimMgr playback -> `fireAtomsMoved`) run inside `performIdleTasks()`, so they are drawn in the **same** tick. UI-driven changes (message-handler `setProp`) run outside rAF, so they are drawn on the **next** tick (up to one frame later).
- A per-frame GL upload should be **deferred to `display()`** (guarded by a dirty flag), not done in the event handler that detected the change. `objectChanged()` can fire N times in one task (e.g. drag preview writes `setProp` repeatedly), but the draw coalesces to once per frame; deferring the upload to `display()` makes it coalesce the same way and guarantees it runs inside the tick with a `DisplayContext` in hand. The CPK2Renderer coordinate-texture path (`m_bCoordDirty`) is the reference for this.

Also note the "runs synchronously inside the Web Worker" wording under *Worker directory layout* (`server/services/*.service.ts`): "synchronously" means "does not `await` the C++ wrapper", not "runs inside the rAF tick". Services are dispatched as `Promise.resolve().then(...)` message-handler microtasks (`WorkerService`), i.e. outside rAF.

---

## react-gui Tests (`tritium/react-gui/`)

```bash
cd tritium/react-gui && npm test    # vitest run
```

**必要最低限にする** (root `CLAUDE.md` の「テスト方針」)。既に 390 ファイル / 3700 件以上あり、
これ以上の増加は開発コストに直結する。1 機能につき数件、契約 (wire 形式・fallback・txn 粒度・
ループ防止) を pin するものだけを書き、forwarding や見た目のテストは書かない。

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

To mock `window.electronAPI`, use the typed `invoke` / `onPush` helper:

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

### Worker-service tests: use the harness (`renderer/worker/testing/`)

`@renderer/worker/testing` (test files only -- ESLint rejects it elsewhere) provides fake wrapper objects and a `WorkerContext` factory, so a service test does not hand-roll `makeCtx` / `makeScene` / accessor spies:

```ts
import { fakeObject, fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'

const log: string[] = []                              // ordered mutation log
const scene = fakeScene({ uid: 100, views: [fakeView({ uid: 7 })], log })
const mol = fakeObject({ className: 'MolCoord', scene, log })
const { ctx, cmdMgr } = makeWorkerCtx({ scenes: [scene] })

setupRenderer(ctx, mol as unknown, opts)              // service under test

const rend = mol.renderers[0]                          // what createRenderer attached
expect(rend.sets.sel).toHaveBeenCalledWith(sel)        // accessor-write spy
expect(log).toEqual(['mol.createRenderer(simple)', 'rend.name=simple1', 'rend.applyStyles(DefaultStyle)'])
expect(scene.undo.committed).toEqual(['Label'])       // undo bookkeeping
expect(cmdMgr.getCmd).not.toHaveBeenCalled()          // manager spies
```

- `fakeRenderer` / `fakeObject` / `fakeView` / `fakeCamera` / `fakeScene` mirror the wrapper shapes structurally: accessor writes are spied (`fake.sets.<prop>`) and readable back, mutating methods are `vi.fn`s (override with `mol.createRenderer.mockReturnValueOnce(null)`), and `scene.getSceneDataJSON()` / `getCameraInfoJSON()` are synthesised in the C++ shapes below (groups via `childNodes`) so tests never hand-write those documents.
- `makeWorkerCtx({ scenes, readers, readerInfo, cmds, styleNames, createObj, getService })` resolves the fakes through `sceMgr` / `strMgr` / `cmdMgr` / `styleMgr` / `svc`; unknown commands and `createObj` throw with a hint, so a missing fake fails loudly.
- Members a service needs that the fakes lack go in `extra` (or add them to the fake when a second test needs them). New service tests use the harness; existing hand-rolled fixtures are migrated when their test is next touched.

### Worker-service tests with wrapper setter spying (one-off shapes)

For a wrapper the harness does not model, mock it as a plain object literal whose accessor records the assignment (this is what the harness does internally):

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

### アプリを自動操作する E2E (Playwright `_electron` 等) の終了処理

シーンに変更があるとアプリ終了が確認ダイアログで**ブロックする**。main が `win.on('close')` を preventDefault して `IPC.WINDOW_CLOSE_REQUEST` を送り、renderer が全タブを walk して `ConfirmCloseTabDialog` (Cancel / Don't Save / Save) を出すため。放置すると人手の応答待ちで止まる (main 側 watchdog の強制 close は 10 秒後)。

自動終了させるには: このダイアログは **native ではなく renderer 側の Blueprint Dialog** なので、`app.close()` を await せずに走らせつつ `.bp5-dialog button` から `Don't Save` を探してクリックし (タブ数だけ繰り返す)、`page.evaluate` が投げたら閉じたと判定する。保険として最後に `app.process().kill('SIGKILL')`。

---

## Other API notes

### AsyncCueMol dispatch summary

Prefer the typed helpers (`invokeService`, `invokeMethodTyped`, `invokeRpc`) — they pin the args/result shape against `worker/shared/calls/`. The untyped `invokeWorker` is a low-level escape hatch that returns the raw response array tail.

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

---

## Blueprint pitfalls

### `Tree` indentation comes from a depth-keyed class

`@blueprintjs/core` indents nested tree rows via `.bp5-tree-node-content-<depth>` (depth 0 = 0px, depth 1 = 23px, depth 2 = 46px, …). The flat selector `.bp5-tree-node-content { padding-left: ... }` has higher specificity than the depth-keyed selector and silently flattens the whole hierarchy.

```css
/* WRONG — flattens all depths to 4px */
.scene-tree .bp5-tree-node-content { padding-left: 4px; }

/* CORRECT — put the inset on the container, let Blueprint own per-depth padding */
.scene-tree { padding: 2px 0 2px 4px; }
.scene-tree .bp5-tree-node-content { padding-right: 6px; /* no padding-left */ }
```

Same applies anywhere depth-keyed Blueprint classes encode visual structure — never override the parent CSS rule that Blueprint uses to thread state through descendants.

### `minimal` / `small` Button props are deprecated in v5

Blueprint v5 deprecated the boolean props in favour of `variant`/`size`. We currently still use the deprecated form throughout to avoid touching every button; new components may use either. Lint shows `TS6385` warnings on the deprecated form — ignorable for now, but flag the wholesale migration as a separate task before adding many new buttons.
