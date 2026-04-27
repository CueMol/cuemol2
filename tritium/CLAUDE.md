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

TypeScript types declare plain values, but at runtime every call through `ObjProxy` is async. Always `await`, casting with `asAsync()` when the declared type is not `Promise`:

```typescript
// TypeScript declares string, runtime gives Promise<string>
const infoJson = await asAsync(strMgr.getInfoJSON2());

// TypeScript declares void, runtime gives Promise<void>
await asAsync((reader as any).setPath(filePath));
```

Prefer moving multi-step C++ logic to a worker-side service rather than chaining many `await` calls in `AsyncCueMol`.

### Passing wrappers as arguments

Setters and method parameters that accept a wrapper call `arg.wrapped` internally to extract the raw C++ object. Just pass the wrapper directly — no manual unwrapping needed:

```typescript
cmd.target_scene = scene;    // setter does: this.setProp('target_scene', scene.wrapped)
cmd.target_object = mol;
coloring.append(sel, color); // invokeMethod receives sel.wrapped, color.wrapped
```

### createWrapper in renderer context

`AsyncCueMol.createWrapper(Promise<ObjProxy>)` resolves the promise, looks up `wrapper_map[className]`, and returns `Promise<BaseWrapper | null>`:

```typescript
const reader = await strMgr.createHandler(readerName, 0);  // concrete subclass e.g. PDBFileReader
```

---

## Other API notes

### getService vs createHandler

- `cm.getService('StreamManager')` — singleton service (cached in C++); cast with `as StreamManager`
- `strMgr.createHandler(name, 0)` — creates a new reader/writer (category 0 = obj reader); returns concrete subclass

### Reader wrapper hierarchy

```
InOutHandler  — setPath(path): void
  └─ ObjReader  — createDefaultObj(): any, attach/detach/read
       └─ PDBFileReader, CCP4MapReader, MTZ2MapReader, ... (format-specific props)
```

### searchCompatibleRendererNames

`Object.searchCompatibleRendererNames()` returns a comma-separated string. Filter out names starting with `*` (internal) and test-only names (`ms2test`, `symm`).
