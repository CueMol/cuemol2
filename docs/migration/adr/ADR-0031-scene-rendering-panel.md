# ADR-0031: Scene rendering properties in the Inspector Property tab

- Status: accepted (host E2E pending)
- Date: 2026-06-14
- Mapping rows: [`dialog.property.scene`](../mapping/prop_dlgs.md#dialogpropertyscene)

## Context

Scene-level rendering/display settings — ambient occlusion (GTAO), post-process
anti-aliasing, background colour, CMYK colour proofing — are implemented in C++
(`qsys::Scene`, `Scene.qif`) and drive a working off-screen render pipeline, but
tritium had no curated GUI for them. UXP exposed scene properties only through
the generic property tree dialog. In tritium, selecting the Scene node already
shows an Inspector **Property tab**, but it rendered just the (read-only) Name
plus the `DUMMY_SECTION` "Not implemented yet." placeholder — because
`getRendererPropSections("scene")` returned nothing.

The priority is making AO tunable (radius / intensity / slices / steps) with live
preview. The settings belong where per-target property editing already lives: the
Inspector Property tab (the same place object / renderer / view properties are
edited), NOT a separate left-panel pane (a first attempt built one and was wrong).

## Decision

Surface the scene rendering subset as **curated sections in the Inspector
Property tab**, registered under the `scene` `type_name` — mirroring every
migrated renderer-type page. Four sections in
`components/inspector/SceneRenderingSection.tsx`: Ambient occlusion (`aoEnabled`
+ `aoRadius`/`aoIntensity`/`aoSlices`/`aoSteps` + `aoHalfRes`), Anti-aliasing
(`aa_method` + `aaJitterLevel`), Background (`bgcolor`), Color proofing
(`use_colproof` + `icc_filename` + `icc_intent`). They are registered in
`RENDERER_SECTION_REGISTRY` (`rendererPropSections.tsx`), and `InspectorPanel`
defaults the Scene target to the Property tab (with `PropertiesTab` opening the
Ambient-occlusion section first, since the scene's Basic settings is only a
read-only name).

No new worker service or hook: the generic-properties bridge is already
target-type-agnostic. `resolvePropTarget` (`helpers/resolvePropTarget.ts`)
resolves `nodeType:'scene'` to the Scene wrapper, and `getGenericProps` /
`setGenericProp` drive `scene.getPropsJSON()` / `setProp()` / `resetProp()`. The
sections reuse the shared Row helpers (`RendererCommonSection.tsx`): `NumRow`
gives realtime drag preview + a single undo step per drag via
`useRealtimeDragProp` (preview/commit/abort), `BoolRow` / `MappedEnumRow` /
`ColorRow` / `TextRow` / `NumInputRow` for the rest, and `onSetMany` (one undo
step) to seed the default CMYK profile when colour proofing is enabled with none
set (UXP `toggleSceneColorProofing` parity).

## Consequences

- Enables interactive AO tuning (the original goal) in the established
  property-editing surface; AO sub-controls disable while AO is off.
- No bespoke service/hook/state path — the change is section components + one
  registry entry + the Inspector default-tab tweak. The drag-undo problem is
  solved by the existing `NumRow` / `useRealtimeDragProp` infra.
- `bgcolor` is edited through the generic `ColorRow` (`setProp('bgcolor', hex)`),
  the same path renderer colour rows already use.
- Supersedes the abandoned left-panel `RenderingPane` attempt (reverted).
- The temporary `devRenderOpts.service.ts` console hack is now redundant; removed
  in a follow-up after host verification.
- Known: whether AO/AA property writes refresh the generic-tab on undo/redo, and
  whether `bgcolor`'s `ColorField` string round-trips through `getPropsJSON`
  (ADR-0015 lists color as generic-tree-pending, though renderer `ColorRow`s
  already work), are to be confirmed in host E2E.

## Notes

- Implementation: `components/inspector/SceneRenderingSection.tsx`,
  `components/inspector/rendererPropSections.tsx` (`scene` registry entry),
  `components/inspector/PropertiesTab.tsx` (scene `initialOpen`),
  `components/panels/InspectorPanel.tsx` (`isScene` -> Property-tab default).
- Generic bridge: `worker/server/services/genericProps.service.ts`
  (`getGenericProps`/`setGenericProp`/`setGenericProps`),
  `worker/server/services/helpers/resolvePropTarget.ts` (`case 'scene'`).
- C++ props (`Scene.qif`): `aoEnabled` / `aoRadius` (4.0) / `aoIntensity` (2.2) /
  `aoSlices` (9) / `aoSteps` (3) / `aoHalfRes`; `aa_method` (none/fxaa/smaa) /
  `aaJitterLevel` (0-5); `bgcolor`; `use_colproof` / `icc_filename` /
  `icc_intent`. Each setter calls `setUpdateFlag()` -> live preview. Enum props
  are string ids at runtime. No libcuemol2 rebuild needed.
- Related: [ADR-0015](ADR-0015-generic-property-inspector.md) (the generic
  property inspector + Row-helper infra this builds on; curated-vs-generic split),
  the `dialog.property.object` row (the non-renderer Property-tab analog).
