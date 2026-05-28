# C++ Scripting Bridge

How libcuemol2 exposes C++ objects to external script environments.
This document covers the metaclass protocol that lets a single generic
wrapper (per bridge) drive any C++ object without per-class glue code.

## Scope

libcuemol2 is consumed from two scripting hosts:

| Host        | Bridge                                      | Source location              |
|-------------|---------------------------------------------|------------------------------|
| UXP GUI     | XPCOM `XPCObjWrapper`                       | `uxp_gui/cuemol2/components/molwidget/XPCObjWrapper.cpp` |
| tritium     | Node.js N-API `Wrapper`                     | `tritium/core/cxx_src/wrapper.cpp` |

Both treat each native object as opaque and dispatch methods by name.
Neither maintains per-class C++ code. The protocol described below is
how that works.

## Metaclass macros

Every class reachable from script declares one of two macros in its
header and pairs it with a `*_IMPL` macro in its `.cpp`. Definitions
live in `src/qlib/mcutils.hpp` and (for the wrapper-generated half)
`src/qlib/LWrapper.hpp`.

| Header macro    | Declares                                                  | When to use                                            |
|-----------------|-----------------------------------------------------------|--------------------------------------------------------|
| `MC_DYNCLASS`   | `getClassObj()`, `regClass()`, `unregClass()`, `getClassObjS()` (all virtual / static)            | Class is reachable from script but has no scripted surface of its own. |
| `MC_SCRIPTABLE` | Everything `MC_DYNCLASS` declares **plus** `getPropertyImpl`, `setPropertyImpl`, `getPropSpecImpl`, `getPropNames`, `hasMethod`, `invokeMethod`, `getScrClassObj`, `implements` | Class has its own scripted properties or methods (defined in a `.qif`). |

`MC_SCRIPTABLE` is a strict superset (its first line is `MC_DYNCLASS;`).

| Implementation macro       | Generates                                                        | Where it lives          |
|----------------------------|------------------------------------------------------------------|-------------------------|
| `MC_DYNCLASS_IMPL(F,N,T)`  | `getClassObj`, `getClassObjS`, `regClass`, `unregClass`          | The class's own `.cpp`. |
| `MC_INVOKE_IMPL2(C,W)`     | All `MC_SCRIPTABLE` virtual overrides, including `getScrClassObj` | The auto-generated `<class>_wrap.cpp` produced by `mcwrapgen3.pl` from the `.qif`. |

`MC_INVOKE_IMPL2` is therefore emitted **only for `MC_SCRIPTABLE`
classes** -- because only those classes have a `.qif`, and the `.qif`
is what makes `mcwrapgen3.pl` emit the `_wrap.cpp`.

## `getClassObj()` vs `getScrClassObj()`

Two virtuals look similar but have different contracts.

- **`getClassObj()`** returns the runtime (most-derived) class object.
  Every `MC_DYNCLASS_IMPL` defines its own non-inheriting override.
  Stable answer: "what class did `new` allocate?"

- **`getScrClassObj()`** returns the **nearest `MC_SCRIPTABLE`
  ancestor**'s class object. Declared pure-virtual on
  `qlib::LScriptable`. The only override in the codebase is the one
  emitted by `MC_INVOKE_IMPL2`, and it returns the wrapper class's own
  class object. So:

  - For an `MC_SCRIPTABLE` class, `getScrClassObj() == getClassObj()`.
  - For an `MC_DYNCLASS`-only class, there is no local override, so
    virtual dispatch falls through to the nearest ancestor that has
    one -- i.e. the nearest scripted parent.

Example: `xtal::XplorMapReader` is `MC_DYNCLASS` and inherits from
`qsys::ObjReader`, which is `MC_SCRIPTABLE`.

```
xplorMapReader.getClassObj()    -> XplorMapReader's class object  (name "XplorMapReader")
xplorMapReader.getScrClassObj() -> ObjReader's class object        (name "ObjReader")
```

The two methods can disagree, and **for scripting bridges that
disagreement is intentional**.

## Bridge contract

External bridges must surface the **scripted** class name, not the
runtime class name, to script:

```cpp
// In the bridge wrapper that exposes getClassName() to script:
const qlib::LClass *pCls = pNativeObj->getScrClassObj();   // not getClassObj()
return pCls->getClassName();
```

Why:

1. Script-side wrapper tables are keyed by class objects that only
   exist for `MC_SCRIPTABLE` classes. An `MC_DYNCLASS`-only leaf has
   no entry, so a runtime-name lookup misses.
2. Method dispatch goes through the funcMap chain (next section), so
   wrapping at an ancestor class still reaches every override on the
   leaf via C++ virtual dispatch.
3. Properties and method specs are defined on the scripted ancestor;
   the leaf adds nothing new -- by construction, since the leaf chose
   `MC_DYNCLASS` over `MC_SCRIPTABLE`.

Bridge implementations:

| Bridge   | Location                                                       | Key line                                            |
|----------|----------------------------------------------------------------|-----------------------------------------------------|
| UXP      | `uxp_gui/cuemol2/components/molwidget/XPCObjWrapper.cpp`       | `m_pWrapped->getScrClassObj()->getClassName()`      |
| tritium  | `tritium/core/cxx_src/wrapper.cpp` `Wrapper::getClassName`     | `pScObj->getScrClassObj()->getClassName()`          |

Historically tritium called `getClassObj()` directly and broke for
`XplorMapReader`. The fix is to mirror UXP.

## Method dispatch (funcMap chain)

`MC_INVOKE_IMPL2` routes `invokeMethod` through the auto-generated
wrapper class (`Foo_wrap`):

```cpp
// MC_INVOKE_IMPL2 -- inside Foo_wrap.cpp
bool Foo::invokeMethod(const LString &name, LVarArgs &args) {
  return Foo_wrap::getInstance()->invokeMethod(this, name, args);
}
```

Each `_wrap` class owns a funcMap that chains to its parent wrapper's
funcMap; lookup walks the chain until the method is found. The `this`
pointer is the leaf instance, so when the funcMap entry calls into a
C++ method, the **virtual function table** picks up subclass overrides
even when the call originated from a parent's `_wrap`.

Result: wrapping an `MC_DYNCLASS` leaf at its `MC_SCRIPTABLE`
ancestor's TypeScript / JS wrapper still reaches the leaf's behavior.

## Worked example: `XplorMapReader`

`XplorMapReader` is `MC_DYNCLASS`-only; it has no `.qif` because it
needs no scripted properties or methods beyond what `ObjReader`
provides. Calling `StreamManager.createHandler("xplormap", 0)` from
tritium proceeds as follows:

1. C++ returns an `xtal::XplorMapReader*`.
2. tritium's N-API wrapper computes the class name to expose to JS:
   `pScObj->getScrClassObj()->getClassName()`. Virtual dispatch lands
   on `ObjReader::getScrClassObj()` (the only override in the chain
   for this hierarchy), which returns `ObjReader`'s class object.
   Result: `"ObjReader"`.
3. JS does `wrapper_map["ObjReader"]`, finds the auto-generated
   `ObjReader` TS wrapper, and instantiates it around the
   `XplorMapReader*` handle.
4. Caller drives `setPath`, `createDefaultObj`, etc. on the wrapper.
   Each call routes through `invokeMethod`, walks the `ObjReader_wrap`
   funcMap, and dispatches to the C++ `XplorMapReader::createDefaultObj`
   override via virtual call.

If the bridge had called `getClassObj()->getClassName()`, step 2 would
return `"XplorMapReader"`, the `wrapper_map` lookup would miss, and
the bridge would need an explicit parent-class table on the JS side
to recover. That regression is what motivated this document.

## Adding a new C++ class

| Need                                                  | Use            | Side effects                                                                  |
|-------------------------------------------------------|----------------|-------------------------------------------------------------------------------|
| Reachable from script, no own scripted surface        | `MC_DYNCLASS`  | No `.qif`. Script sees instances as the nearest scripted ancestor.            |
| Adds scripted properties or methods                   | `MC_SCRIPTABLE`| Write a `.qif`. `mcwrapgen3.pl` emits `_wrap.cpp/hpp` and TS / JS wrappers. |

In either case the class must:

- Inherit (directly or transitively) from `qlib::LScriptable`.
- Register at module init via `regClass()` and unregister via
  `unregClass()` -- typically wired from `moduleloader_<mod>.cpp`.

## Related files

- `src/qlib/mcutils.hpp` -- `MC_DYNCLASS`, `MC_SCRIPTABLE`, `MC_DYNCLASS_IMPL`
- `src/qlib/LWrapper.hpp` -- `MC_INVOKE_IMPL2`
- `src/qlib/LScriptable.hpp` -- base `getScrClassObj` declaration
- `src/qlib/ClassRegistry.hpp` -- class object registration
- `src/python/make_es6_wrapper_table.py` -- tritium `wrapper_map` generator
- `tritium/core/cxx_src/wrapper.cpp` -- tritium bridge
- `uxp_gui/cuemol2/components/molwidget/XPCObjWrapper.cpp` -- UXP bridge
