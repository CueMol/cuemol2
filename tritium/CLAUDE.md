# CLAUDE.md

See the root [`../CLAUDE.md`](../CLAUDE.md) for all guidance, including tritium-specific build, architecture, and testing instructions.

---

## AsyncCueMol / Worker calling conventions

### Wrapper methods return Promises at runtime

TypeScript wrapper classes (in `tritium/core/src/wrappers/`) declare return types as plain values (e.g., `string`, `void`, `any`), but **all methods actually return `Promise<T>` at runtime** because they route through `ObjProxy.invokeMethod` which is `async`.

When calling wrapper methods from `AsyncCueMol.ts`, always `await` them and cast as needed:

```typescript
// TypeScript says string, runtime gives Promise<string>
const infoJson = await (strMgr.getInfoJSON2() as unknown as Promise<string>);

// TypeScript says void, runtime gives Promise<void>
await (reader.setPath(filePath) as unknown as Promise<void>);
```

### createWrapper flow

`BaseWrapper.createWrapper(prom)` delegates to `AsyncCueMol.createWrapper(Promise<ObjProxy>)` which calls `createWrapperImpl` → looks up `wrapper_map[className]` → returns the typed subclass. Return type is `Promise<BaseWrapper | null>`.

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
