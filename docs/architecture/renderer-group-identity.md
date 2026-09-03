# Renderer identity: the `name` default and name-based group membership

Two structural issues in libcuemol2 that the tritium inspector now guards
against but does not fix. Recorded here so the guard is not mistaken for the
solution, and so the root-cause work has its context ready.

## 1. `name` is declared with a default, and a bare setter leaves it "default"

`property string name => redirect(getName, setName); default name = "";`
(`src/qsys/Renderer.qif`, and the same in `src/qsys/Object.qif`). The
generated wrapper registers `""` as the default, so `getPropsJSON` reports
`hasdefault: true` for every renderer's and object's name, and a generic
property editor offers a "reset to default" that produces a nameless renderer.

The default flag makes it worse. `LDefaultFlagImpl::getDefaultPropFlag`
(`src/qlib/LScrObjects.cpp`) treats a property that was never written
**through the property system** as sitting at its default. `Renderer::setName()`
(`src/qsys/Renderer.hpp`) is a bare member setter, so a renderer named that way
is reported as `isdefault: true` -- the inspector shows a locked "default" name
-- and, because `writeTo2` stamps the default flag on the XML node and
`LDom2OutStream` omits default-flagged nodes, **the name is dropped when the
scene is saved**. Every direct `setName()` call is exposed to this:
`src/modules/importers/PSEFileReader.cpp`, `src/modules/lwview/LWViewerManager.cpp`,
`src/modules/anim/MorphMol.cpp` among others; commit `80e7e7f4` patched one
instance (a pasted preset group) locally.

A name has no meaningful default. The fix is either to drop the `default name`
clause from both qifs (then `hasdefault` is false everywhere -- tritium, UXP and
Python -- and `name` is always serialised) or to have `setName()` clear the flag.
`MolSurfObj.qif` already has its `default name` commented out.

## 2. Group membership is resolved by name

A renderer belongs to a `RendGroup` when its `group` string equals the group's
`name` (`RendGroup.cpp isGroupMember`, `Object::getGroupedRendListJSON`, and on
the tritium side `worker/server/services/helpers/groupChildren.ts` and the
rename cascade in `worker/server/services/props/write.ts`). Consequences:

- A rename has to rewrite every member's `group` string in the same transaction,
  and any path that changes the name without the cascade (a reset, a script, an
  empty or duplicate name) orphans the members: they keep `group="<old name>"`,
  vanish from the scene tree, and keep drawing.
- A nameless group matches every ungrouped leaf renderer of its object, so its
  `center` / `has_center` -- evaluated by every `getPropsJSON` dump -- walk all of
  their atoms; before `80e7e7f4` the group matched itself and `hasCenter()`
  recursed until the stack overflowed, which is the freeze reported from the
  Generic tab's "default" checkbox.
- Uniqueness of group names within an object rests on write-time checks
  (`helpers/rendGroup.ts checkGroupAssignment`, the rename guard in `write.ts`),
  not on the model.

### Direction: resolve membership by UID at run time, keep names on the wire

`qlib::uid_t` is assigned per process and is not persisted, and `.qsc` files
and the scripting API (`rend.group = "grp1"`) are name-based throughout
(`timeRefName`, `startcam`, animation targets follow the same convention). So
the change that keeps compatibility is:

- keep the `group` string property for files and scripts;
- give each renderer a run-time `m_grpUID`, resolved from the name when the
  object finishes loading, when a renderer is attached, and when `group` is
  written (deferred, since a group may follow its members in the file);
- test membership by UID; on save, write the current name of the resolved group;
- then a rename touches only the group's `name` (members follow, undo restores
  one property), and empty / duplicate names cannot orphan anything;
- still enforce unique group names per object at write time (a file cannot
  express two groups with the same name), re-resolve after paste / clone, and
  optionally add a persisted stable group id later (an extra attribute old
  readers ignore).

## What the tritium guard does (and does not) cover

The 2026-09 inspector change keeps `name` / `sel` out of every reset path with
one shared key set (`worker/shared/genericProps.ts NON_RESETTABLE_KEYS`): the
parser reports them without a default, the worker refuses a reset before any
transaction, and the Generic tab's "default" checkbox stays disabled. It also
keeps the inspector on its tab across a rename and re-seeds the Name field. It
does not change C++: the qif default, the bare setter's flag, the name-based
membership and the nameless-group scan are all still there, reachable from
scripts and older files.

Related: [ADR-0015](../migration/adr/ADR-0015-generic-property-inspector.md)
(generic property inspector), `src/qsys/RendGroup.cpp`, `src/qsys/Object.cpp`.
