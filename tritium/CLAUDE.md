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
| `invokeMethod(name, ...args)` | `Promise<primitive>` | Full round trip — use when result is string/number/boolean |
| `getPropObj(name, cls)` | `ObjProxy` (future) | Same as `invokeMethodObj` |
| `getProp(name)` | `Promise<primitive>` | Full round trip |
| `setProp(name, value)` | `Promise.resolve()` | Fire-and-forget |

In Worker context, `invokeMethodObj`/`invokeMethodVoid`/`getPropObj` fall back to the normal sync path.

### Future ObjProxy and pipelining

`invokeMethodObj`/`getPropObj` return a **future ObjProxy** immediately (`_obj._obj_id = { future: seqno }`). Subsequent calls using that proxy as `thisobj` or an argument are queued as postMessages without waiting for prior results — the Worker resolves futures via `_futureSlot[seqno]` since it processes messages in order.

The first `invokeMethod`/`getProp` call (primitive result) acts as a natural flush point: it awaits the Worker's response, by which time all prior pipelined messages have already been processed.

### Renderer-side: await only when primitive is needed

```typescript
// object returns → no await (future pipelining)
const cmd = cmdMgr.getCmd('load_object');  // ObjProxy (future)
cmd.target_scene = scene;                  // fire-and-forget setProp
cmd.file_path = filePath;                  // fire-and-forget setProp
await cmd.run();                           // void — Promise.resolve(), almost free
const mol = cmd.result_object;             // ObjProxy (future)
mol.name = 'foo';                          // fire-and-forget setProp

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

`BaseWrapper.createWrapper(native_obj)` delegates to `_utils.createWrapper(native_obj)`.

- **Renderer** (`AsyncCueMol.createWrapper`): resolves the `ObjProxy` (future or concrete) → calls `createWrapperImpl` → looks up `wrapper_map[className]` → returns typed subclass. Return type is `Promise<BaseWrapper | null>`.
- **Worker** (`CueMol.createWrapper`): synchronous, returns `BaseWrapper` subclass directly.

```typescript
// strMgr.createHandler returns Promise<BaseWrapper | null> (via createWrapper)
const reader = await strMgr.createHandler(readerName, 0);  // typed wrapper e.g. PDBFileReader
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
