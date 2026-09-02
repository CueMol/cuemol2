/**
 * @file features/inspector/AnimElementInspector.tsx
 * @description Detail editor for a selected animation element, shown in the
 * right InspectorPanel (the `animElement` target). The bespoke-branch peer of
 * `RenderSettingsEditor`: it self-fetches its data via the `animDetail`
 * services (the generic property bridge cannot target an `AnimObj`).
 *
 * Labels and per-type layout mirror the UXP animobj property dialog
 * (`uxp_gui/.../anim/animobj-common-proppage.xul`) so the migration is
 * recognisable: Quadric, Rotation angle, the "Spin axis" combobox + "(x, y, z)"
 * vector, Target camera / renderers / opacity / MorphMol, the combined
 * "Direction angle", etc. The UXP numslider widgets map to `DragNumericField`;
 * the spin-axis components (plain number boxes in UXP, not sliders) map to the
 * catalog `NumberCell`. The slide direction is the exception: a whole-degree
 * bearing reads as a typed / stepped value, so it uses the catalog stepper
 * (`SliderField` with `slider={false}`) beside its cardinal presets.
 *
 * Identity is the stable `uid`. The component refetches on every SEM_ANIM event
 * (the payload carries no uid, so it always re-resolves), reports the element
 * name/type up via `onHeaderChange`, and signals `onGone` when the element is
 * deleted. Drafted numeric/text fields commit once on release; an `editingRef`
 * gate keeps an in-progress edit from being clobbered by a refetch and is
 * cleared on element switch so a new element always re-seeds its form.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FieldSection,
  Field,
  TextField,
  TimeField,
  SelectField,
  DragNumericField,
  SliderField,
  NumberCell,
  SwitchField,
  SegmentField,
} from "@renderer/h3-kit/form";
import { GenericTab } from "./GenericTab";
import { InspectorResetAllButton } from "./InspectorResetAllButton";
import { useAnimGenericProps } from "@renderer/features/inspector/anim/useAnimGenericProps";
import { useAnimTimingDrag, type TimingWriteOpts } from "@renderer/features/inspector/anim/useAnimTimingDrag";
import type { AsyncCueMol } from "@renderer/worker/client/AsyncCueMol";
import type {
  AnimElementDetail,
  AnimElementFail,
  AnimElementPropKey,
  AnimRendererOption,
  AnimCameraOption,
  AnimMolOption,
  AnimTimingMs,
  SetAnimElementPropArgs,
} from "@renderer/worker/server/services/anim/anim.service";
import { SEM_ANIM, SEM_OBJECT, SEM_RENDERER, SEM_CAMERA, SEM_ANY } from "@renderer/event";
import { useCueMolEventListener } from "@renderer/hooks/cuemol/useCueMolEventListener";
import { useShowErrorAlert } from "@renderer/dialogs/ErrorAlertDialogProvider";
import { EVENT_BURST_DEBOUNCE_MS } from "@renderer/utils/timing";

interface AnimElementInspectorProps {
  cm: AsyncCueMol | null;
  sceneId: number;
  uid: number;
  /** The element no longer exists (deleted) -- the inspector should close. */
  onGone: (sceneId: number) => void;
  /** Report the element name/type so the inspector header can show them. */
  onHeaderChange: (name: string, type: string) => void;
}
import {
  TYPE_LABEL,
  axisPreset,
  buildTimeRefOptions,
  detailToForm,
  fmtAxis,
  legacyStartNote,
  wrapAngle,
  type FormState,
} from "@renderer/features/inspector/anim/animElementForm";

/**
 * Per-element detail editor (right InspectorPanel `animElement` branch).
 */
export const AnimElementInspector: React.FC<AnimElementInspectorProps> = ({
  cm,
  sceneId,
  uid,
  onGone,
  onHeaderChange,
}) => {
  const [detail, setDetail] = useState<AnimElementDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [options, setOptions] = useState<{
    renderers: AnimRendererOption[];
    cameras: AnimCameraOption[];
    mols: AnimMolOption[];
  }>({ renderers: [], cameras: [], mols: [] });
  // Spin-axis combobox mode (null = derive from the current vector). A user's
  // explicit pick persists until the element changes, so editing a Cartesian
  // vector to a unit value does not snap the mode back to a locked axis.
  const [axisMode, setAxisMode] = useState<string | null>(null);
  // Active tab: the bespoke per-type editor ("properties") or the full generic
  // property table ("generic"), mirroring the renderer node inspector.
  const [mode, setMode] = useState<"properties" | "generic">("properties");
  // Why the last Relative-to write was refused (shown under the field).
  const [refError, setRefError] = useState<string | null>(null);
  // Why the element could not be loaded at all (shown instead of "Loading...").
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped after a rejected timing commit so Start / Duration re-mirror the
  // committed span, which such a failure leaves numerically unchanged.
  const [timingEpoch, setTimingEpoch] = useState(0);

  const cmRef = useRef(cm);
  cmRef.current = cm;
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;
  const onHeaderRef = useRef(onHeaderChange);
  onHeaderRef.current = onHeaderChange;

  // A refused write that is not a validation message under a field goes
  // through the app's standard error alert.
  const showErrorAlert = useShowErrorAlert();
  const showErrorAlertRef = useRef(showErrorAlert);
  showErrorAlertRef.current = showErrorAlert;
  const reportError = useCallback((message: string) => {
    void showErrorAlertRef.current({ title: "Animation element", message });
  }, []);
  const onErrorRef = useRef(reportError);
  onErrorRef.current = reportError;

  const {
    genericEntries, genericLoading, refetchGeneric,
    handleGenericSet, handleGenericReset, handleResetAll, canResetAll,
  } = useAnimGenericProps({ cmRef, sceneIdRef, uidRef, onGoneRef, onErrorRef });

  // Drop a stale response that resolves after a newer fetch/commit.
  const fetchToken = useRef(0);
  // Drop a stale target-options response (rapid scene / scene-tree changes).
  const optionsToken = useRef(0);
  // True while a draft (numeric/text) field is mid-edit -- blocks re-seed.
  const editingRef = useRef(false);

  // The last adopted detail, for re-seeding the form after a refused write.
  const detailRef = useRef<AnimElementDetail | null>(null);

  const adopt = useCallback((d: AnimElementDetail) => {
    detailRef.current = d;
    setDetail(d);
    setRefError(null);
    setLoadError(null);
    onHeaderRef.current(d.common.name, TYPE_LABEL[d.common.type] ?? "Animation element");
  }, []);

  /**
   * One failure policy. Only `gone` closes the inspector: the element left
   * the manager. Anything else keeps it open -- a refused Relative-to write
   * is shown under that field, a refused timing write re-mirrors the fields
   * and alerts, any other refused write re-seeds the form from the last
   * detail and alerts, and a failed load says so in place of "Loading...".
   */
  const handleFailure = useCallback(
    (res: AnimElementFail, ctx: "refetch" | "commit" | "timing", prop?: AnimElementPropKey) => {
      const sid = sceneIdRef.current;
      if (res.gone) {
        onGoneRef.current(sid);
        return;
      }
      if (ctx === "refetch") {
        if (!detailRef.current) setLoadError(res.error);
        else console.warn("getAnimElementDetail failed:", res.error);
        return;
      }
      if (prop === "timeRefName") {
        setRefError(res.error);
        return;
      }
      if (ctx === "timing") {
        setTimingEpoch((e) => e + 1);
        reportError(res.error);
        return;
      }
      const d = detailRef.current;
      if (d) setForm(detailToForm(d));
      reportError(res.error);
    },
    [reportError],
  );

  const refetch = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    const u = uidRef.current;
    if (!c) return;
    const token = ++fetchToken.current;
    c.invokeService("getAnimElementDetail", { sceneId: sid, uid: u })
      .then((res) => {
        if (token !== fetchToken.current) return;
        if (!res.ok) {
          handleFailure(res, "refetch");
          return;
        }
        adopt(res.detail);
      })
      .catch((e: unknown) => console.warn("getAnimElementDetail failed:", e));
  }, [adopt, handleFailure]);

  /** Refetch the full generic property list (generic tab). */
  // SEM_ANIM keeps both views in sync. The generic table is refetched in both
  // modes: the mode bar's Reset-all button derives its enabled state from
  // genericEntries, so they must stay live on the Properties tab too.
  const handleAnimEvent = useCallback(() => {
    refetch();
    refetchGeneric();
  }, [refetch, refetchGeneric]);

  // Fetch on mount + element/scene change.
  useEffect(() => {
    // Clear any latched edit flag from the previously inspected element. If a
    // prior interaction ended without committing (e.g. an out-of-range release),
    // a stale editingRef would block the re-seed effect below and strand the
    // newly selected element on "Loading..." forever.
    editingRef.current = false;
    setAxisMode(null);
    detailRef.current = null;
    setDetail(null);
    setForm(null);
    setRefError(null);
    setLoadError(null);
    refetch();
  }, [sceneId, uid, refetch]);

  // Keep in sync with C++-side edits (incl. delete, via SEM_ANY).
  useCueMolEventListener({
    cm,
    enabled: !!cm,
    category: "",
    srcMask: SEM_ANIM,
    evtMask: SEM_ANY,
    scopeId: sceneId,
    handler: handleAnimEvent,
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
  });

  // Re-seed the draft when detail changes, unless a field is mid-edit.
  useEffect(() => {
    if (detail && !editingRef.current) setForm(detailToForm(detail));
  }, [detail]);

  // Target dropdown options (renderers / cameras / mols).
  const refetchOptions = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c) return;
    const token = ++optionsToken.current;
    c.invokeService("getAnimTargetOptions", { sceneId: sid })
      .then((res) => {
        if (token !== optionsToken.current) return;
        if (res?.ok) {
          setOptions({ renderers: res.renderers, cameras: res.cameras, mols: res.mols });
        }
      })
      .catch(() => {
        /* dropdowns stay empty */
      });
  }, []);
  // Fetch on mount + scene change.
  useEffect(() => {
    refetchOptions();
  }, [cm, sceneId, refetchOptions]);
  // Keep the lists in sync when the scene's renderers / objects / cameras are
  // added / removed / renamed in the Explorer (the multi-renderer checklist
  // and the camera / mol selects all read from these options).
  useCueMolEventListener({
    cm,
    enabled: !!cm,
    category: "",
    srcMask: SEM_OBJECT | SEM_RENDERER | SEM_CAMERA,
    evtMask: SEM_ANY,
    scopeId: sceneId,
    handler: refetchOptions,
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
  });

  // (Re)fetch the generic list on element change -- in both modes, since the
  // mode bar's Reset-all enabled state reads it (see handleAnimEvent).
  useEffect(() => {
    refetchGeneric();
  }, [sceneId, uid, refetchGeneric]);

  /** Write one prop; adopt the returned (re-resolved) detail. */
  const commit = useCallback(
    (prop: AnimElementPropKey, value: SetAnimElementPropArgs["value"]) => {
      editingRef.current = false;
      const c = cmRef.current;
      const sid = sceneIdRef.current;
      const u = uidRef.current;
      if (!c) return;
      const token = ++fetchToken.current;
      c.invokeService("setAnimElementProp", { sceneId: sid, uid: u, prop, value })
        .then((res) => {
          if (token !== fetchToken.current) return;
          if (!res.ok) {
            handleFailure(res, "commit", prop);
            return;
          }
          if (res.detail) adopt(res.detail);
        })
        .catch((e: unknown) => console.warn("setAnimElementProp failed:", e));
    },
    [adopt, handleFailure],
  );

  /**
   * Write the `timing` pair in one of the drag modes. A preview neither
   * advances the fetch token nor adopts anything: its response carries no
   * detail (that is not "gone"), and it must not invalidate a refetch that a
   * SEM_ANIM event started meanwhile. Commit / abort adopt the returned
   * detail like any other write.
   */
  const writeTiming = useCallback(
    (value: AnimTimingMs, opts: TimingWriteOpts) => {
      const c = cmRef.current;
      const sid = sceneIdRef.current;
      const u = uidRef.current;
      if (!c) return;
      const preview = opts.mode === "preview";
      const token = preview ? 0 : ++fetchToken.current;
      return c
        .invokeService("setAnimElementProp", {
          sceneId: sid,
          uid: u,
          prop: "timing",
          value,
          mode: opts.mode,
          original: opts.original,
        })
        .then((res) => {
          if (preview) {
            if (!res.ok && res.gone) onGoneRef.current(sid);
            return;
          }
          if (token !== fetchToken.current) return;
          if (!res.ok) {
            handleFailure(res, "timing");
            return;
          }
          if (res.detail) adopt(res.detail);
        })
        .catch((e: unknown) => console.warn("setAnimElementProp (timing) failed:", e));
    },
    [adopt, handleFailure],
  );

  const timing = useAnimTimingDrag({
    committed: detail ? { startMs: detail.common.startMs, endMs: detail.common.endMs } : null,
    write: writeTiming,
    resyncKey: timingEpoch,
  });

  const setField = useCallback((patch: Partial<FormState>) => {
    editingRef.current = true;
    setForm((f) => (f ? { ...f, ...patch } : f));
  }, []);

  /** Adopt the fresh generic list returned by a write (token-gated). */
  // Properties / Generic switcher, shown above the body in both modes.
  const modeBar = (
    <div className="inspector-mode-bar mode-bar">
      <SegmentField
        value={mode}
        onValueChange={(v) => setMode(v as "properties" | "generic")}
        options={[
          { label: "Properties", value: "properties" },
          { label: "Generic", value: "generic" },
        ]}
      />
      {/* Available in both modes (they edit the same properties), matching
          InspectorPanel's mode bar. */}
      <InspectorResetAllButton
        canResetAll={canResetAll}
        onResetAll={handleResetAll}
      />
    </div>
  );

  if (mode === "generic") {
    return (
      <>
        {modeBar}
        <div className="inspector-body">
          <GenericTab
            entries={genericEntries}
            loading={genericLoading}
            onSetValue={handleGenericSet}
            onResetValue={handleGenericReset}
          />
        </div>
      </>
    );
  }

  if (!detail || !form) {
    return (
      <>
        {modeBar}
        <div className="inspector-empty">
          {loadError ? `Could not load element: ${loadError}` : "Loading..."}
        </div>
      </>
    );
  }

  const t = detail.typeProps;
  const type = detail.common.type;
  const axis = { x: t.axisX ?? 0, y: t.axisY ?? 0, z: t.axisZ ?? 0 };
  // UXP parity: the x/y/z boxes are editable only in Cartesian mode.
  const axisSel = axisMode ?? axisPreset(axis.x, axis.y, axis.z);
  const axisEditable = axisSel === "cart";

  /** Write one axis component, keeping the other two; near-zero keeps the old vector. */
  const commitAxisComp = (key: "x" | "y" | "z", s: string) => {
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return;
    const v = { ...axis, [key]: n };
    if (Math.hypot(v.x, v.y, v.z) < 1e-6) return; // near-zero: keep old
    commit("axis", v);
  };
  const onAxisPreset = (p: string) => {
    setAxisMode(p);
    if (p === "cart") return; // enable manual editing; keep the current vector
    const v = p === "x" ? { x: 1, y: 0, z: 0 } : p === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    commit("axis", v);
  };

  // ShowHide/Slide can target several renderers; `rend` is a comma-joined list
  // of bare names (C++ RendPropAnim splits on ',').
  const rendSet = new Set(
    (t.rend ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const toggleRend = (name: string) => {
    const next = new Set(rendSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    commit("rend", [...next].join(","));
  };

  const timeRef = buildTimeRefOptions(detail.common, detail.siblings);
  const startNote = legacyStartNote(detail.common.startMs);

  return (
    <>
      {modeBar}
      <div className="inspector-body anim-inspector">
      <FieldSection title="Common settings">
        <Field label="Name">
          <TextField
            value={form.name}
            onChange={(v) => setField({ name: v })}
            onBlur={() => commit("name", form.name)}
          />
        </Field>
        <Field label="Disabled" inline>
          <SwitchField
            checked={detail.common.disabled}
            onChange={(c) => commit("disabled", c)}
          />
        </Field>
        {/* Candidates that cannot be chosen (they would close a cycle, carry
            a duplicate name, or do not resolve) stay listed but disabled, and
            a reference that no longer exists is shown as such rather than as
            "(absolute)". A refused write is explained under the field. */}
        <Field label="Relative to">
          <SelectField
            value={detail.common.timeRefName}
            onChange={(v) => commit("timeRefName", v)}
          >
            <option value="">(absolute)</option>
            {timeRef.options.map((o) => (
              <option key={o.key} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </SelectField>
          {timeRef.dangling !== null && (
            <div className="anim-field-note is-warning type-caption">
              Reference "{timeRef.dangling}" no longer exists; choose (absolute) or another element.
            </div>
          )}
          {refError !== null && (
            <div className="anim-field-note is-error type-caption" role="alert">
              {refError}
            </div>
          )}
        </Field>
        {/* Start / Duration preview live (the strip follows) and commit one
            undo step on release; see useAnimTimingDrag. The Start field's
            floor follows a legacy negative offset so an interaction that
            changes nothing cannot lift it to zero (the display floors at 0;
            the note states the stored value). */}
        <Field label="Start time">
          <TimeField {...timing.start} min={Math.min(0, detail.common.startMs)} />
          {startNote !== null && (
            <div className="anim-field-note is-warning type-caption">{startNote}</div>
          )}
        </Field>
        <Field label="Duration">
          <TimeField {...timing.duration} min={0} />
        </Field>
        <Field label="Quadric">
          <DragNumericField
            value={form.quadricPct}
            min={0}
            max={50}
            step={5}
            decimals={0}
            unit="%"
            onChange={(v) => setField({ quadricPct: v })}
            onRelease={(v) => commit("quadric", v / 100)}
          />
        </Field>
      </FieldSection>

      {type === "SimpleSpin" && (
        <FieldSection title="SimpleSpin settings">
          <Field label="Rotation angle">
            <DragNumericField
              value={form.angle}
              min={0}
              max={360}
              step={5}
              decimals={0}
              unit="°"
              onChange={(v) => setField({ angle: v })}
              onRelease={(v) => commit("angle", wrapAngle(v))}
            />
          </Field>
          <Field label="Spin axis">
            <div className="anim-axis-row">
              <SelectField fill={false} value={axisSel} onChange={onAxisPreset}>
                <option value="x">X axis</option>
                <option value="y">Y axis</option>
                <option value="z">Z axis</option>
                <option value="cart">Cartesian</option>
              </SelectField>
              <span className="anim-axis-paren">(</span>
              <NumberCell value={fmtAxis(axis.x)} onCommit={(s) => commitAxisComp("x", s)} disabled={!axisEditable} aria-label="Axis X" />
              <span className="anim-axis-paren">,</span>
              <NumberCell value={fmtAxis(axis.y)} onCommit={(s) => commitAxisComp("y", s)} disabled={!axisEditable} aria-label="Axis Y" />
              <span className="anim-axis-paren">,</span>
              <NumberCell value={fmtAxis(axis.z)} onCommit={(s) => commitAxisComp("z", s)} disabled={!axisEditable} aria-label="Axis Z" />
              <span className="anim-axis-paren">)</span>
            </div>
          </Field>
        </FieldSection>
      )}

      {type === "CamMotion" && (
        <FieldSection title="CamMotion settings">
          <Field label="Target camera">
            <SelectField value={t.endcam ?? ""} onChange={(v) => commit("endcam", v)}>
              <option value="">(none)</option>
              {options.cameras.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Ignore rotation" inline>
            <SwitchField checked={!!t.ignorerotate} onChange={(c) => commit("ignorerotate", c)} />
          </Field>
          <Field label="Ignore center" inline>
            <SwitchField checked={!!t.ignorecenter} onChange={(c) => commit("ignorecenter", c)} />
          </Field>
          <Field label="Ignore zoom" inline>
            <SwitchField checked={!!t.ignorezoom} onChange={(c) => commit("ignorezoom", c)} />
          </Field>
          <Field label="Ignore slab" inline>
            <SwitchField checked={!!t.ignoreslab} onChange={(c) => commit("ignoreslab", c)} />
          </Field>
        </FieldSection>
      )}

      {(type === "ShowHideAnim" || type === "SlideInOutAnim") && (
        <FieldSection title={type === "ShowHideAnim" ? "Show/Hide settings" : "Slide in/out settings"}>
          <Field label="Target renderers">
            <div className="anim-rend-list">
              {options.renderers.length === 0 ? (
                <span className="anim-rend-empty type-row">(no renderers)</span>
              ) : (
                options.renderers.map((r) => (
                  <label key={`${r.objName}/${r.name}`} className="anim-rend-row type-row">
                    <input
                      type="checkbox"
                      className="anim-rend-check"
                      checked={rendSet.has(r.name)}
                      onChange={() => toggleRend(r.name)}
                    />
                    <span className="anim-rend-name">
                      {r.objName}/{r.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </Field>
          {type === "SlideInOutAnim" && (
            <Field label="Direction angle">
              <div className="anim-dir-row">
                {/* A whole-degree bearing: typed or stepped, not dragged --
                    the cardinal presets beside it are what a coarse sweep is
                    for. */}
                <SliderField
                  label="Direction angle"
                  hideLabel
                  slider={false}
                  value={form.direction}
                  min={0}
                  max={360}
                  step={1}
                  unit="°"
                  onCommit={(v) => {
                    setField({ direction: v });
                    commit("direction", v);
                  }}
                />
                <SelectField
                  fill={false}
                  value={String(form.direction)}
                  onChange={(v) => {
                    const n = Number(v);
                    setForm((f) => (f ? { ...f, direction: n } : f));
                    commit("direction", n);
                  }}
                >
                  <option value="0">Left</option>
                  <option value="90">Up</option>
                  <option value="180">Right</option>
                  <option value="270">Down</option>
                </SelectField>
              </div>
            </Field>
          )}
          {type === "SlideInOutAnim" && (
            <Field label="Distance">
              <DragNumericField
                value={form.distance}
                min={0}
                max={2}
                step={0.1}
                decimals={1}
                unit="W/2"
                onChange={(v) => setField({ distance: v })}
                onRelease={(v) => commit("distance", v)}
              />
            </Field>
          )}
          <Field label="Show/Hide">
            <SelectField value={t.hide ? "true" : "false"} onChange={(v) => commit("hide", v === "true")}>
              <option value="false">Show</option>
              <option value="true">Hide</option>
            </SelectField>
          </Field>
          {type === "ShowHideAnim" && (
            <>
              <Field label="Fade" inline>
                <SwitchField checked={!!t.fade} onChange={(c) => commit("fade", c)} />
              </Field>
              <Field label="Target opacity">
                <DragNumericField
                  value={form.tgtAlpha}
                  min={0}
                  max={1}
                  step={0.1}
                  decimals={1}
                  onChange={(v) => setField({ tgtAlpha: v })}
                  onRelease={(v) => commit("tgtAlpha", v)}
                />
              </Field>
            </>
          )}
        </FieldSection>
      )}

      {type === "MolAnim" && (
        <FieldSection title="MolAnim settings">
          <Field label="Target MorphMol">
            <SelectField value={t.mol ?? ""} onChange={(v) => commit("mol", v)}>
              <option value="">(none)</option>
              {options.mols.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Start value">
            <DragNumericField
              value={form.startValue}
              min={0}
              max={1}
              step={0.1}
              decimals={2}
              onChange={(v) => setField({ startValue: v })}
              onRelease={(v) => commit("startValue", v)}
            />
          </Field>
          <Field label="End value">
            <DragNumericField
              value={form.endValue}
              min={0}
              max={1}
              step={0.1}
              decimals={2}
              onChange={(v) => setField({ endValue: v })}
              onRelease={(v) => commit("endValue", v)}
            />
          </Field>
        </FieldSection>
      )}
      </div>
    </>
  );
};
