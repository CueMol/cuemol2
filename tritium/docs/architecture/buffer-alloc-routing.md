# Buffer Allocation Routing (WebGL backend)

## Summary

When the tritium WebGL backend renders a `GpuPrim` (SphereGpuPrim, CylinderGpuPrim, ..), the vertex/index buffer storage is allocated in V8 cage memory and shared between C++ (write side) and JavaScript (GPU upload side) without any CPU-to-CPU memcpy. The C++ renderer writes through `qlib::Array<T>::refer()` directly into a `Napi::ArrayBuffer` backing store, and the same `Napi::ArrayBuffer` is handed to JS `peer.createBuffer` / `peer.drawBuffer` for the WebGL upload.

Before this routing, every buffer paid 2 memcpys (one in `EcBufferRep::create` and one in `EcBufferRep::update`) because V8 sandbox rules prevent the JS side from reading C++ heap pointers directly. After: **0 memcpys per buffer** on the new path; the legacy memcpy branch remains as a fallback when no external storage is attached.

## Why this lives in tritium docs

The interface itself (`DisplayContext::allocBuffer`, `AbstDrawAttrs` storage hooks) is in `libcuemol2` (`src/gfx/`) and is backend-neutral. **The reason this document exists in `tritium/docs/architecture/`** is that the only non-trivial implementation of the interface, and the only motivating use case, is the WebGL backend in `tritium/core/`. The OpenGL backend uses the default impl unchanged. If a second non-WebGL backend ever ships with a similar V8-style constraint, the design here should be revisited; otherwise the rest of `libcuemol2` does not need to know this exists.

## Layers and responsibilities

```
+------------------------------------------------------------------+
| Renderer (e.g., BallStickRenderer in src/modules/molvis/)        |
|   pdc->allocBuffer-driven via GpuPrim::alloc(pdc, n)             |
|   then fills m_pDrawElem->at(i) = ...                            |
+-----------------------------|------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
| GpuPrim subclass (e.g., gfx::SphereGpuPrim)                      |
|   alloc(DisplayContext *pDC, int n):                             |
|     - setAttrSize / setAttrInfo on m_pDrawElem                   |
|     - pDC->allocBuffer(*m_pDrawElem, nvert, nind)                |
|     - setDrawMode                                                |
+-----------------------------|------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
| gfx::DisplayContext::allocBuffer (virtual)                       |
|   default: ada.allocOwnedData(nvert) + allocOwnedIndData(nind)   |
|            -- owning C++ heap; used by OpenGL backend            |
|   WebGL override: see below                                      |
+-----------------------------|------------------------------------+
                              |
       +----------------------+------------------------+
       |                                                |
       v (OpenGL: unchanged)                            v (WebGL)
+--------------------+               +--------------------------------+
| qlib::Array::      |               | ElecDisplayContext::           |
|   allocate(n)      |               |   allocBuffer (V8 ArrayBuffer  |
|   owns C++ heap    |               |   alloc, refer m_data,         |
+--------------------+               |   stash ext handle + finalizer)|
                                     +----------------|---------------+
                                                      v
                                     +--------------------------------+
                                     | AbstDrawAttrs holds:           |
                                     |  - m_data via Array::refer()   |
                                     |  - opaque void* ext handle     |
                                     |  - Finalizer for V8 Persistent |
                                     +----------------|---------------+
                                                      v (at first draw)
                                     +--------------------------------+
                                     | EcBufferRep::create:           |
                                     |  - if ext handle: reuse        |
                                     |    Persistent (no memcpy)      |
                                     |  - else: legacy memcpy path    |
                                     |  - call peer.createBuffer JS   |
                                     +--------------------------------+
```

## Key APIs

### `gfx::DisplayContext::allocBuffer` (`src/gfx/DisplayContext.hpp`)

```cpp
virtual void allocBuffer(AbstDrawAttrs &ada, int nvert, int nind);
```

Pure memory allocation. **Does not read attribute layout** -- it can be called before or after `setAttrInfo` because the byte size is derivable from `ada.getElemSize() = sizeof(ElemType)` alone. `nind == 0` means no index buffer.

### `gfx::AbstDrawAttrs` storage hooks (`src/gfx/AbstDrawAttrs.hpp`)

The base class declares four allocation virtuals and an opaque-handle + finalizer pair:

| Hook | Purpose |
|------|---------|
| `allocOwnedData(int)` / `allocOwnedIndData(int)` | Owning C++ heap. Default `allocBuffer` impl routes here. |
| `setDataRef(void*, int)` / `setIndDataRef(void*, int)` | External (non-owning) storage. Template subclass calls `qlib::Array::refer()`. |
| `getExtDataHandle()` / `setExtDataHandle(void*)` (and Ind variant) | Opaque backend-specific pointer (e.g., `Napi::ObjectReference *`). Layered as `void *` so gfx stays N-API-free. |
| `setDataFinalizer(std::function<void()>)` (and Ind variant) | Called from `AbstDrawAttrs::~AbstDrawAttrs` to release the external resource (e.g., Persistent reset + delete). |

### Template specializations (`src/gfx/DrawAttrArray.hpp`, `DrawAttrElems.hpp`)

Each override calls `qlib::Array<T>::allocate` (owning) or `qlib::Array<T>::refer` (external) with the correctly typed pointer. `qlib::Array::refer` was already in `qlib` (`src/qlib/Array.hpp:139`) and is also used by `services.cpp::fromTypedArray()`, so the lifetime pattern matches one already proven in the codebase.

## WebGL implementation (`tritium/core/cxx_src/`)

### `ElecDisplayContext::allocBuffer`

```cpp
// ElecDisplayContext.cpp
Napi::ArrayBuffer vert_ab = Napi::ArrayBuffer::New(env, nvert * ada.getElemSize());
auto *pVertRef = new Napi::ObjectReference();
pVertRef->Reset(vert_ab, 1);              // strong ref; prevents V8 GC
ada.setDataRef(vert_ab.Data(), nvert);    // m_data refers into V8 backing store
ada.setExtDataHandle(pVertRef);           // for EcBufferRep::create to fetch
ada.setDataFinalizer([pVertRef]() {       // released when AbstDrawAttrs dies
    pVertRef->Reset();
    delete pVertRef;
});
// (same for index buffer when nind > 0)
```

If the view is not bound (no peer object), falls back to owning C++ heap so non-GUI code paths (tests, headless) keep working.

### `EcBufferRep::create` / `update`

`create` (`tritium/core/cxx_src/EcBufferRep.cpp`) keeps the existing JS `peer.createBuffer` call (attribute JSON + GPU buffer allocation on the JS side) **unchanged**. Only the line that grabs the V8 ArrayBuffer reference is forked:

```cpp
if (auto *pVertRef = static_cast<Napi::ObjectReference *>(data.getExtDataHandle())) {
    m_arrayBufRef = Napi::Persistent(pVertRef->Value().As<Napi::Object>());
} else {
    // legacy: allocate new ArrayBuffer and memcpy from data.getData()
    Napi::Object array_buf = createBuffer(env, data.getData(), buffer_size);
    m_arrayBufRef = Napi::Persistent(array_buf);
}
```

`update` skips `copyToBuffer` entirely when `getExtDataHandle() != nullptr`, since the renderer's writes to `m_data` already landed in the V8 ArrayBuffer backing store. Only `m_bDataUpdated = true` is flipped so the next `peer.drawBuffer` call sees the dirty flag.

The legacy `copyToBuffer` path is kept as a fallback, not as a shim. It is reached only if a future caller allocates a `DrawAttrArray` directly (e.g., a unit test using owning allocation, or non-allocBuffer code paths).

## Lifetime

```
AbstDrawElem (owned by GpuPrim / Renderer)
   |
   |-- m_data (qlib::Array<T>, refer mode -- m_bOwn = false)
   |    `-- points into vert_ab's V8 backing store
   |
   |-- m_dataFinalizer (std::function<void()>)
   |    `-- closure captures pVertRef (Napi::ObjectReference *)
   |
   `-- m_pVBORep (gfx::VBORep *, owned)
        `-- EcBufferRep, holds m_arrayBufRef (Napi::Persistent of same ArrayBuffer)

Destruction order (when the AbstDrawElem dies):
   1. ~AbstDrawElem -> delete m_pVBORep -> ~EcBufferRep
      -> m_arrayBufRef.Reset() (one strong ref released)
      -> JS peer.deleteBuffer called
   2. ~AbstDrawAttrs (base of AbstDrawElem) runs finalizer
      -> pVertRef->Reset() (last strong ref released)
      -> delete pVertRef
   3. V8 GC eligible for vert_ab's backing store
```

The pattern mirrors `services.cpp::fromTypedArray()` (`tritium/core/cxx_src/services.cpp:559-587`), which goes the other direction (TypedArray -> qlib::LByteArray).

## What this design intentionally does NOT do

- **No new VBORep timing.** `DisplayContext::drawElem` still creates the `VBORep` lazily on first draw via `createVBORep` (existing path). An alternative we considered -- eager VBORep creation in `allocBuffer` with a new `VBORep::isInitialized` / `initialize` virtual pair -- was rejected because (a) it forced changes in the OpenGL path for no benefit and (b) it conflicted with the WebGL design of keeping `bind()` / `unbind()` as no-ops (JS-call reduction). Keeping VBORep timing unchanged means `EcBufferRep::create` still bundles `gl.createBuffer + gl.bindBuffer + gl.bufferData` into one JS call, matching the prior behaviour.
- **No buffer attribute layout coupling at alloc time.** Some GpuPrim subclasses (`LineGpuPrim`, `TrigGpuPrim`) configure attribute layout lazily on first `draw` via `setupAttrs()`. `allocBuffer` is byte-size-only so this lazy pattern is untouched.
- **No `bufferSubData` for dynamic updates yet.** `EcBufferRep::update` only flips `m_bDataUpdated`; the JS side that interprets that flag and calls `gl.bufferSubData` is not implemented. Static buffers work fully. When dynamic updates ship, no C++ changes should be needed -- the JS layer just reads the existing `m_arrayBufRef` and dispatches `gl.bufferSubData`.

## Key files

| File | Role |
|------|------|
| `src/gfx/AbstDrawAttrs.hpp` | Storage hooks + opaque ext handle + Finalizer |
| `src/gfx/DrawAttrArray.hpp` / `DrawAttrElems.hpp` | Template specialisations (`refer` / `allocate`) |
| `src/gfx/DisplayContext.hpp` / `.cpp` | `allocBuffer` interface + default OpenGL impl |
| `tritium/core/cxx_src/ElecDisplayContext.cpp` | WebGL `allocBuffer` override |
| `tritium/core/cxx_src/EcBufferRep.cpp` | `create` (Persistent reuse) + `update` (memcpy skip) |
| `src/qlib/Array.hpp` | `refer(int, T*)` + `setOnDestroy` (existing, used by the WebGL routing as well as `services.cpp::fromTypedArray`) |
| `src/tests/gfx/test_gpuprim.cpp` | Wire-form / contract tests (`DrawAttrArrayWireForm`, `AbstDrawAttrsStorage`, `DisplayContextAllocBuffer`) |

## Adding a new GpuPrim subclass

1. Inherit from `gfx::GpuPrim`. Declare an `alloc(DisplayContext *pDC, ...)` (signature depends on the geometry kind).
2. In `alloc`, create the `DrawAttrArray` / `DrawAttrElems`, call `setAttrSize` / `setAttrInfo` for each attribute, then call `pDC->allocBuffer(*m_pDrawElem, nvert, nind)`. Set `drawMode`, `numInstances` etc. after `allocBuffer` -- order does not matter to `allocBuffer` itself.
3. Renderer (the caller of `XXXGpuPrim::alloc`) must have a `DisplayContext *` in scope -- typically passed in via the caller's `display(pdc)` chain.
4. No tritium-side code needs to change. WebGL routing kicks in automatically because `ElecDisplayContext::allocBuffer` is what `pDC->allocBuffer` resolves to.
