# CLAUDE.md

See the root [`../CLAUDE.md`](../CLAUDE.md) for all guidance, including tritium-specific build, architecture, and testing instructions.

---

## Wrapper / Core call conventions

### Dual-mode wrappers: same class, two contexts

Auto-generated wrapper classes (`tritium/core/src/wrappers/*.ts`) work in two distinct contexts via `BaseWrapper._wrapped` polymorphism:

| Context | `_wrapped` | Behavior |
|---|---|---|
| **Renderer thread** (via `ObjProxy`) | `ObjProxy` instance | Each call → `postMessage` round trip to Worker |
| **Worker thread** (via `WorkerService`) | C++ `Wrapper` Napi::Object | Each call → direct C++ invocation, synchronous |

The same generated wrapper code runs in both contexts unchanged. Worker-side wrappers are always synchronous — never `await` them.

### Three call variants (Renderer path)

`BaseWrapper` exposes three method variants; the right one depends on the C++ return type:

| Variant | Return | Behavior |
|---|---|---|
| `invokeMethodObj(name, cls, ...args)` | `ObjProxy` (future) | Fires postMessage immediately, no await needed |
| `invokeMethodVoid(name, ...args)` | `Promise.resolve()` | Fire-and-forget |
| `invokeMethod(name, ...args)` | `Promise<any>` | Full round trip — primitives and polymorphic object returns |
| `getPropObj(name, cls)` | `ObjProxy` (future) | Same as `invokeMethodObj` |
| `getProp(name)` | `Promise<any>` | Full round trip — primitives and polymorphic object returns |
| `setProp(name, value)` | `Promise.resolve()` | Fire-and-forget |

In Worker context, `invokeMethodObj`/`invokeMethodVoid`/`getPropObj` fall back to the normal sync path.

### Polymorphic base class dispatch

mcwrapgen automatically selects the fast or slow path based on the C++ return type:

- **Slow path** (`invokeMethod`/`getProp`): used when the return type is a **polymorphic base class** — any class `X` that appears as `extends X` in some `runtime_class` or `abstract_class` declaration across the project's `.qif` files. The Worker performs a full round trip and returns the actual subclass name, so `createWrapper` instantiates the correct typed wrapper.
- **Fast path** (`invokeMethodObj`/`getPropObj`): used when the return type is a **leaf class** (no subclasses extend it). The Renderer gets a future ObjProxy immediately without waiting for the Worker.

Common polymorphic classes: `Command`, `Object`, `Renderer`, `InOutHandler`. Common leaf classes: `Scene`, `Matrix`, `LScrObject`.

No manual annotation is needed — mcwrapgen scans all `.qif` files at wrapper generation time.

### Future ObjProxy and pipelining

`invokeMethodObj`/`getPropObj` return a **future ObjProxy** immediately (`_obj._obj_id = { future: seqno }`). Subsequent calls using that proxy as `thisobj` or an argument are queued as postMessages without waiting for prior results — the Worker resolves futures via `_futureSlot[seqno]` (evicted after a window of 256 seqnos) since it processes messages in order.

The first `invokeMethod`/`getProp` call (primitive result or polymorphic object) acts as a natural flush point: it awaits the Worker's response, by which time all prior pipelined messages have already been processed.

### Renderer-side: await rules

```typescript
// Command is polymorphic → slow path → must await to get the concrete subclass wrapper
const cmd = await cmdMgr.getCmd('load_object');
cmd.target_scene = scene;   // fire-and-forget setProp
cmd.file_path = filePath;   // fire-and-forget setProp
await cmd.run();            // void → Promise.resolve(), near-instant

// Object is polymorphic → slow path → must await for actual subclass (e.g. MolCoord)
const mol = await cmd.result_object;
mol.name = 'foo';           // fire-and-forget setProp

// Scene is a leaf class → fast path → no await needed
const scene = sceMgr.getScene(scene_id);  // ObjProxy (future), usable immediately

// primitive → must await (real round trip)
const className: string = await mol.getClassName();
```

### Worker-side: always synchronous

```typescript
// Worker context: all calls are direct C++ invocations
const scene = this._sceMgr!.getScene(scene_id);  // returns wrapper directly
const cmd = cmdMgr.getCmd('load_object');          // synchronous
cmd.run();                                          // synchronous, no await
const mol = (cmd as any).result_object;            // synchronous property access
```

### createWrapper flow

`BaseWrapper.createWrapper(input)` delegates to `_utils.createWrapper(input)`.

- **Renderer** (`AsyncCueMol.createWrapper`): accepts either `ObjProxy` (sync, from fast path) or `Promise<ObjProxy>` (async, from slow path). Resolves to the typed subclass via `wrapper_map[className]`. Returns `BaseWrapper` synchronously for fast-path input; returns `Promise<BaseWrapper>` for slow-path input.
- **Worker** (`CueMol.createWrapper`): always synchronous, returns `BaseWrapper` subclass directly.

Callers on the Renderer side must `await` the result when the called method uses the slow path (polymorphic return type):

```typescript
// slow path (polymorphic) → createWrapper returns Promise → must await
const reader = await strMgr.createHandler(readerName, 0);  // e.g. PDBFileReader

// fast path (leaf class) → createWrapper returns BaseWrapper synchronously → no await
const scene = sceMgr.createScene();  // Scene wrapper, usable immediately
```

### Reader wrapper hierarchy

```
InOutHandler  — setPath(path): void
  └─ ObjReader  — createDefaultObj(): any, attach/detach/read
       └─ PDBFileReader, CCP4MapReader, MTZ2MapReader, ... (format-specific props)
```

`createHandler(name, 0)` returns the concrete reader subclass. Use `(reader as any).setPath(...)` if the TypeScript return type is `any`.

### searchCompatibleRendererNames

`Object.searchCompatibleRendererNames()` returns a comma-separated string of renderer type names compatible with that object type. Filter out:
- Names starting with `*` (internal/special renderers like `*selection`)
- Test-only names: `ms2test`, `symm`

```typescript
rendTypesStr.split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.charAt(0) !== '*' && !FILTER_SET.has(s));
```

### getService vs createHandler

- `cm.getService('StreamManager')` — returns a singleton service wrapper (cached in C++ layer); cast to specific type with `as StreamManager`
- `strMgr.createHandler(name, category)` — creates a new reader/writer handler (category 0 = obj reader); returned wrapper is the concrete reader class
