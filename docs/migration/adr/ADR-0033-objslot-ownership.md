# ADR-0033: ObjProxyBridge `_objSlot` ownership and lifetime

- Status: accepted (design-out -- bridge removed; leak no longer reachable)
- Date: 2026-06-16
- Mapping rows: (none -- worker-bridge infra; tracked by refactoring plan T15 / PR-A)

## Decision (2026-06-16)

**The leak was designed out, not bounded.** Neither Option A
(`FinalizationRegistry` + `releaseObj` RPC) nor Option B (scene-scoped
eviction) was implemented. Instead the renderer-side `ObjProxy` bridge was
removed outright: the only renderer holder of an `ObjProxy` was converted to a
numeric-id `drainLogMessages` service, and the `ObjProxy` bridge plus the
`ObjProxyBridge._objSlot` translation table were deleted.

Rationale: an audit of renderer-side `ObjProxy` usage found **exactly one
callsite** (`useLogEvent`) and **zero service contracts that require holding a
native object** across the worker boundary. With no remaining consumer that
needs an `ObjProxy`, the entire bridge -- and therefore the unbounded
`_objSlot` table that was the leak site -- has no reason to exist. Removing it
eliminates the leak at the source rather than capping a table that should not
be there at all.

Consequently Option A's `FinalizationRegistry` machinery (and its slot_id-reuse
generation stamp, non-deterministic GC timing, and aliasing-fan-out caveats)
was unnecessary: there is nothing left to register, release, or generation-
stamp. The analysis below is retained as the record of *why* the slot model was
unsound and why removing it (rather than patching its lifetime) was the correct
resolution.

## Context

The renderer never holds a native C++ object directly. It holds an
`ObjTuple` (`{_obj_id, _class_name}`) and routes every property read / write /
method call to the worker, which translates the tuple back to the native
object. The translation table is `ObjProxyBridge._objSlot`
(`react-gui/src/renderer/worker/server/objProxyBridge.ts:18`):

- `toObjTuple(obj)` (`:104`) computes `slot_id = obj.toObjID()` and, if the
  slot is new, stores `_objSlot[slot_id] = obj` -- where `obj` is the N-API
  `Wrapper` object returned by the native addon.
- `lookupNativeByObjTuple(tuple)` (`:123`) reads `_objSlot[tuple._obj_id]`
  back.

There is **no delete / dispose / release / evict / FinalizationRegistry /
WeakRef anywhere** in the bridge, in `ObjProxy.ts`, or in `ObjectFactory.ts`.
Every distinct native object the renderer ever touches -- every renderer,
selection, residue iterator, command result, transient `MolCoord`, vector,
color -- is stored permanently. The table only grows. This is the unbounded
`_objSlot` leak.

### What the slot id actually is (C++ source of truth)

`toObjID` (`tritium/core/cxx_src/wrapper.cpp:48`) returns
`format("0x%llx", reinterpret_cast<unsigned long long>(this))` -- the **heap
address of the N-API `Wrapper` instance**, not a counter.

- **slot_id is NOT monotonic.** It is a raw pointer. After a `Wrapper` is
  freed, the allocator can hand the same address to a future `Wrapper`,
  so slot ids are **reused** over the process lifetime.
- **A native object can own many slots.** `Wrapper::createWrapper`
  (`wrapper.cpp:614`) allocates a **fresh** `Wrapper` (`ctor->New({})`)
  every time a property read or method return yields an object
  (`lvarToNapiValue` LT_OBJECT path, `:406-409`). Two reads of the same
  C++ object produce two `Wrapper` instances with two distinct addresses
  and therefore two slots, all aliasing one `LScriptable*`.

### Why the slot pins the native (the ownership constraint)

`Wrapper::~Wrapper` (`wrapper.cpp:18`) calls `m_pWrapped->destruct()`.
For a copy-able object (`LSimpleCopyScrObject::destruct`,
`src/qlib/LScriptable.cpp:41`) that is `delete this` -- the native object is
freed when its `Wrapper` is GC'd. So:

- While a `Wrapper` is pinned in `_objSlot`, it never gets GC'd, `~Wrapper`
  never runs, and the native object is never `destruct()`-ed. The leak is
  therefore a **native** leak, not merely a JS-map leak.
- `LSingletonScrObject::destruct` (`:66`) is a **no-op**; singleton services
  (`StyleManager`, `StreamManager`, scene/view managers) are intentionally
  long-lived, so pinning them is harmless -- but also means we must never
  blindly `destruct()` them.
- `View` / `Scene` are **not destroyed by `removeView`** (CLAUDE.md, "the C++
  `View` / `Scene` objects are not destroyed by `removeView`; that is a
  separate future concern"). Closing a tab calls `removeMolTab` +
  `cm.removeView` (`App.tsx:164-167`) but leaves the native View/Scene alive
  on purpose.

**Ownership constraint, stated precisely:** a slot may be deleted (allowing
`~Wrapper -> destruct`) only once **no renderer-side `ObjProxy` can still
address it**. There is no per-object refcount on the renderer side today:
`ObjProxy` instances (`ObjProxy.ts:33`) are created freely (in
`ObjectFactory.createObj` / `getService`, and in `ObjProxy.getProp` /
`invokeMethod` whenever a reply carries an `ObjTuple`) and dropped by normal
JS GC with **no disposal hook**. Nothing on the renderer signals "this tuple
is dead". This is the gap the leak fix must close.

## Analysis (candidate models considered, then superseded)

> **Outcome:** Neither option below was adopted. See **Decision (2026-06-16)**
> at the top -- the bridge was removed outright, so no ownership model was
> needed. The two candidates are retained as the record of what was evaluated
> and why a lifetime patch was avoided.

This section originally recorded the analysis and two candidate ownership
models so the lead could choose one with the user. The two candidate models
from the T15 plan were:

### Option A -- `FinalizationRegistry` + `releaseObj(slotId)` RPC

Register each renderer-side `ObjProxy` with a `FinalizationRegistry` keyed by
its `slot_id`. When the proxy is GC'd, the registry callback sends a new
`releaseObj(slotId)` RPC to the worker; `ObjProxyBridge` deletes that slot
(`delete this._objSlot[slotId]`), dropping the last reference to the N-API
`Wrapper` so `~Wrapper -> destruct` can run.

- Pros: bounded table that tracks actual renderer liveness; no scene-lifetime
  assumption; works uniformly for transient objects (the bulk of the leak --
  residue iterators, command results, transient mols).
- Cons / risks:
  - **Non-deterministic GC timing.** `FinalizationRegistry` callbacks fire
    "sometime after" collection, never synchronously and not guaranteed at
    all before exit. Tests must assert that the **release-RPC fires** when a
    proxy is explicitly unregistered/dropped, never assert on GC timing.
  - **slot_id is a reused pointer (see Context).** A `releaseObj` for a freed
    slot id could arrive *after* the allocator has reissued that same address
    to a new live `Wrapper`, deleting a slot that now belongs to a different
    object -> early `~Wrapper destruct` of a live native. Mitigation:
    generation-stamp the slot (store `{obj, gen}`, carry `gen` in the
    `ObjTuple`, and ignore a `releaseObj` whose `gen` does not match), or
    only release when the renderer holds exactly one proxy for that id.
  - **Aliasing fan-out.** Because one native object can hold many slots
    (many `Wrapper`s), releasing one slot does not free the native if another
    slot still pins a different `Wrapper` over the same `LScriptable*`. That
    is *safe* (no early destruct) but means the table shrinks slot-by-slot,
    not object-by-object.
  - New wire surface: a `releaseObj` row in `RpcMap` plus a worker handler.

### Option B -- scene-scoped lifetime (evict on `removeView` / scene close)

Tag each slot with the scene/view it was minted under and evict the whole
group when that view is removed (`WorkerService.removeView`,
`WorkerService.ts:343`) or the scene is closed.

- Pros: fully deterministic, no GC dependency, no slot_id-reuse race within a
  generation, easy to test (close a view -> assert its slots are gone).
- Cons / risks:
  - **Conflicts with intentional C++ lifetimes.** `View` / `Scene` are
    deliberately *not* destroyed by `removeView` (CLAUDE.md). Evicting +
    `destruct`-ing scene-scoped slots on tab close would `delete` native
    objects the C++ side still considers live -> use-after-free.
  - **Does not bound the common case.** The dominant leak source is
    *transient* objects created mid-session that are not naturally scene-
    scoped and outlive nothing in particular; scene-close eviction leaves
    them until the scene closes (and many sessions never close their scene).
  - Requires threading a scene/view id into every `toObjTuple` mint site,
    which several call paths (singletons, class-registry probes) do not have.

## Consequences

This ADR does not change behavior -- it pins the analysis so the leak fix is
made against an explicit ownership contract rather than ad hoc. Whichever
option lands, PR-A touches the render-init hot path, so the acceptance gate is
`task run_tritium` reaching `bindCanvas` -> `shader program created OK`
unchanged, plus the leak-baseline test below.

### Recommendation

**Option A (`FinalizationRegistry` + `releaseObj` RPC), with a generation
stamp on the slot**, gated on user/lead sign-off.

Rationale grounded in the code:
- The leak is dominated by *transient* native objects (every `getProp` /
  `invokeMethod` that returns an object mints a new `Wrapper` -> slot). Only
  a liveness-tracking model bounds that; Option B leaves transients pinned
  until scene close.
- Option B's eviction is unsafe against the intentional long-lived
  `View`/`Scene` and the no-op singleton `destruct`, and it cannot tag the
  singleton / class-probe mint sites with a scene id.
- The generation stamp directly neutralizes the slot_id-reuse aliasing risk
  that is otherwise Option A's sharpest failure mode.

Singletons (`getService`) and the long-lived `View`/`Scene` should be
**excluded from release** (never `delete this._objSlot[...]` for them, or pin
them in a separate never-evicted table), since their `destruct` is either a
no-op or must not run on tab close.

### Test strategy

- **Release-RPC wire test (not GC timing).** In the existing
  `objProxyBridge.test.ts` style, drive an explicit `releaseObj(slotId)` and
  assert the slot is deleted and a subsequent `lookupNativeByObjTuple`
  returns `null` (current "unknown slot" path,
  `objProxyBridge.test.ts:62-68` already pins that null behavior). On the
  renderer side, assert that unregistering/dropping an `ObjProxy` enqueues an
  `invokeRpc('releaseObj', slotId)` -- never assert that GC fired.
- **Bounded-table leak-baseline test.** Mint N objects through the bridge,
  release them, assert the slot table size returns to its baseline (e.g. the
  set of pinned singletons), proving the delete path is wired. This is the
  regression gate against a future change silently dropping the release.
- **Generation-mismatch test.** Mint a slot, free it, mint a new object that
  reuses the same id with a higher generation, then deliver a stale
  `releaseObj` for the old generation and assert it is **ignored** (the live
  slot survives). This pins the anti-aliasing guard.

## Notes

- Leak site: `react-gui/src/renderer/worker/server/objProxyBridge.ts:18`
  (`_objSlot` decl), `:111-113` (write in `toObjTuple`), `:129-133`
  (read in `lookupNativeByObjTuple`). No delete path exists.
- slot_id is a `Wrapper` pointer: `tritium/core/cxx_src/wrapper.cpp:48-66`
  (`toObjID`), not monotonic, reused after free.
- Each object return mints a fresh `Wrapper`:
  `tritium/core/cxx_src/wrapper.cpp:614-623` (`createWrapper`),
  `:406-409` (`lvarToNapiValue` LT_OBJECT).
- `~Wrapper -> destruct`: `tritium/core/cxx_src/wrapper.cpp:18-24`;
  copy-able `destruct = delete this` at `src/qlib/LScriptable.cpp:41-47`;
  singleton `destruct` no-op at `:66-68`.
- Renderer proxy lifecycle (no disposal hook today):
  `react-gui/src/renderer/worker/client/ObjProxy.ts:33` (ctor, freely
  created), `ObjectFactory.ts:45-118` (createObj / getService / wrap).
- View/Scene not destroyed by `removeView`: CLAUDE.md
  ("OffscreenCanvas / WebGL lifecycle constraints"); renderer cleanup at
  `react-gui/src/renderer/App.tsx:164-167`, worker
  `WorkerService.removeView` at `WorkerService.ts:343`.
- Existing degrade-detection test: `objProxyBridge.test.ts` (slot round-trip,
  unknown-slot null). Extend, do not weaken, when wiring the release path.

### Known issues (carried into PR-A)

- **FinalizationRegistry non-determinism.** Release fires "eventually" after
  GC and may never fire before process exit; never a synchronous or
  guaranteed signal. Tests pin the RPC, not collection.
- **slot_id reuse after free.** A freed `Wrapper` address can be reissued to a
  later `Wrapper`; a late `releaseObj` for the old id can alias a new live
  object and trigger an early `~Wrapper destruct`. Generation stamp required.
- **Aliasing fan-out.** One native `LScriptable*` may hold multiple `Wrapper`
  slots; releasing one does not free the native while another slot pins it
  (safe, but the table shrinks slot-wise, not object-wise).
- **Singleton / long-lived exclusion.** Services and `View`/`Scene` must be
  excluded from release or their no-op / deferred `destruct` semantics break.

### Open question for the lead/user (RESOLVED 2026-06-16)

Originally: choose the ownership model (Option A vs Option B). **Resolved by
removing the bridge** -- the audit showed a single renderer `ObjProxy`
callsite (`useLogEvent`) and no object-essential service contract, so neither
ownership model was needed. With the `ObjProxy` bridge and `_objSlot` deleted,
there is no native `destruct`/`delete` timing question left to sign off on.
