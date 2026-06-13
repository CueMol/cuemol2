/**
 * @file components/inspector/AnimElementInspector.tsx
 * @description Detail editor for a selected animation element, shown in the
 * right InspectorPanel (the `animElement` target). The bespoke-branch peer of
 * `RenderSettingsEditor`: it self-fetches its data via the `animDetail`
 * services (the generic property bridge cannot target an `AnimObj`).
 *
 * Identity is the stable `uid`. The component refetches on every SEM_ANIM event
 * (the payload carries no uid, so it always re-resolves), reports the element
 * name/type up via `onHeaderChange`, and signals `onGone` when the element is
 * deleted. Numeric fields commit once on release (the write service has no
 * preview/abort mode); an `editingRef` gate keeps an in-progress drag from being
 * clobbered by a refetch.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FieldSection,
  Field,
  TextField,
  SelectField,
  NumericField,
  SwitchField,
} from "../../h3-kit/form";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import type {
  AnimElementDetail,
  AnimElementPropKey,
  AnimRendererOption,
  AnimCameraOption,
  AnimMolOption,
  SetAnimElementPropArgs,
} from "../../worker/server/services/animDetail.service";
import { SEM_ANIM, SEM_ANY } from "../../event";
import { useCueMolEventListener } from "../../hooks/useCueMolEventListener";

interface AnimElementInspectorProps {
  cm: AsyncCueMol | null;
  sceneId: number;
  uid: number;
  /** The element no longer exists (deleted) -- the inspector should close. */
  onGone: (sceneId: number) => void;
  /** Report the element name/type so the inspector header can show them. */
  onHeaderChange: (name: string, type: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  SimpleSpin: "Simple spin",
  CamMotion: "Camera motion",
  ShowHideAnim: "Show / Hide",
  SlideInOutAnim: "Slide",
  MolAnim: "Mol morphing",
  NoopAnimObj: "No operation",
  unknown: "Animation element",
};

/** Draft of the numeric / text fields (controlled while editing). */
interface FormState {
  name: string;
  quadricPct: number;
  startMs: number;
  durationMs: number;
  angle: number;
  axisX: number;
  axisY: number;
  axisZ: number;
  tgtAlpha: number;
  direction: number;
  distance: number;
  startValue: number;
  endValue: number;
}

function detailToForm(d: AnimElementDetail): FormState {
  const c = d.common;
  const t = d.typeProps;
  return {
    name: c.name,
    quadricPct: c.quadric * 100,
    startMs: c.startMs,
    durationMs: c.endMs - c.startMs,
    angle: t.angle ?? 0,
    axisX: t.axisX ?? 0,
    axisY: t.axisY ?? 0,
    axisZ: t.axisZ ?? 0,
    tgtAlpha: t.tgtAlpha ?? 1,
    direction: t.direction ?? 0,
    distance: t.distance ?? 1,
    startValue: t.startValue ?? 0,
    endValue: t.endValue ?? 1,
  };
}

/** Normalize an angle into [0, 360] by wrapping (UXP parity, not clamping). */
function wrapAngle(a: number): number {
  let v = a;
  while (v < 0) v += 360;
  while (v > 360) v -= 360;
  return v;
}

/** Which axis preset (if any) the current vector matches. */
function axisPreset(x: number, y: number, z: number): string {
  if (x === 1 && y === 0 && z === 0) return "x";
  if (x === 0 && y === 1 && z === 0) return "y";
  if (x === 0 && y === 0 && z === 1) return "z";
  return "cart";
}

const RENDER_MULTI = "__multiple__";

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
  // Drop a stale response that resolves after a newer fetch/commit.
  const fetchToken = useRef(0);
  // True while a draft (numeric/text) field is mid-edit -- blocks re-seed.
  const editingRef = useRef(false);

  const adopt = useCallback((d: AnimElementDetail) => {
    setDetail(d);
    onHeaderRef.current(d.common.name, TYPE_LABEL[d.common.type] ?? "Animation element");
  }, []);

  const refetch = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    const u = uidRef.current;
    if (!c) return;
    const token = ++fetchToken.current;
    c.invokeService("getAnimElementDetail", { sceneId: sid, uid: u })
      .then((res) => {
        if (token !== fetchToken.current) return;
        if (!res || res.gone || !res.detail) {
          onGoneRef.current(sid);
          return;
        }
        adopt(res.detail);
      })
      .catch((e: unknown) => console.warn("getAnimElementDetail failed:", e));
  }, [adopt]);

  // Fetch on mount + element/scene change.
  useEffect(() => {
    setDetail(null);
    setForm(null);
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
    handler: refetch,
    debounceMs: 30,
  });

  // Re-seed the draft when detail changes, unless a field is mid-edit.
  useEffect(() => {
    if (detail && !editingRef.current) setForm(detailToForm(detail));
  }, [detail]);

  // Target dropdown options (per scene).
  useEffect(() => {
    if (!cm) return;
    let cancelled = false;
    cm.invokeService("getAnimTargetOptions", { sceneId })
      .then((res) => {
        if (!cancelled && res?.ok) {
          setOptions({ renderers: res.renderers, cameras: res.cameras, mols: res.mols });
        }
      })
      .catch(() => {
        /* dropdowns stay empty */
      });
    return () => {
      cancelled = true;
    };
  }, [cm, sceneId]);

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
          if (!res || res.gone || !res.detail) {
            onGoneRef.current(sid);
            return;
          }
          adopt(res.detail);
        })
        .catch((e: unknown) => console.warn("setAnimElementProp failed:", e));
    },
    [adopt],
  );

  const setField = useCallback((patch: Partial<FormState>) => {
    editingRef.current = true;
    setForm((f) => (f ? { ...f, ...patch } : f));
  }, []);

  if (!detail || !form) {
    return <div className="inspector-empty">Loading...</div>;
  }

  const t = detail.typeProps;
  const type = detail.common.type;

  const commitTiming = () =>
    commit("timing", { startMs: Math.max(0, form.startMs), endMs: Math.max(0, form.startMs) + Math.max(0, form.durationMs) });
  const commitAxis = () => {
    if (Math.hypot(form.axisX, form.axisY, form.axisZ) < 1e-6) return; // near-zero: keep old
    commit("axis", { x: form.axisX, y: form.axisY, z: form.axisZ });
  };
  const onAxisPreset = (p: string) => {
    if (p === "cart") return;
    const v = p === "x" ? { x: 1, y: 0, z: 0 } : p === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    setForm((f) => (f ? { ...f, axisX: v.x, axisY: v.y, axisZ: v.z } : f));
    commit("axis", v);
  };

  const rendVal = t.rend ?? "";
  const rendIsMulti = rendVal.includes(",");

  return (
    <div className="inspector-body anim-inspector">
      <FieldSection title="Common">
        <Field label="Name">
          <TextField
            value={form.name}
            onChange={(v) => setField({ name: v })}
            onBlur={() => commit("name", form.name)}
          />
        </Field>
        <Field label="Enabled" inline>
          <SwitchField
            checked={!detail.common.disabled}
            onChange={(c) => commit("disabled", !c)}
          />
        </Field>
        <Field label="Relative to">
          <SelectField
            value={detail.common.timeRefName}
            onChange={(v) => commit("timeRefName", v)}
          >
            <option value="">(absolute)</option>
            {detail.siblings.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Start (ms)">
          <NumericField
            value={form.startMs}
            min={0}
            max={600000}
            step={100}
            slider={false}
            onChange={(v) => setField({ startMs: v })}
            onRelease={commitTiming}
          />
        </Field>
        <Field label="Duration (ms)">
          <NumericField
            value={form.durationMs}
            min={0}
            max={600000}
            step={100}
            slider={false}
            onChange={(v) => setField({ durationMs: v })}
            onRelease={commitTiming}
          />
        </Field>
        <Field label="Easing">
          <NumericField
            value={form.quadricPct}
            min={0}
            max={50}
            step={5}
            unit="%"
            onChange={(v) => setField({ quadricPct: v })}
            onRelease={(v) => {
              if (v > 0 && v <= 50) commit("quadric", v / 100);
            }}
          />
        </Field>
      </FieldSection>

      {type === "SimpleSpin" && (
        <FieldSection title="Spin">
          <Field label="Angle">
            <NumericField
              value={form.angle}
              min={0}
              max={360}
              step={5}
              unit="°"
              onChange={(v) => setField({ angle: v })}
              onRelease={(v) => commit("angle", wrapAngle(v))}
            />
          </Field>
          <Field label="Axis">
            <SelectField
              value={axisPreset(form.axisX, form.axisY, form.axisZ)}
              onChange={onAxisPreset}
            >
              <option value="x">X axis</option>
              <option value="y">Y axis</option>
              <option value="z">Z axis</option>
              <option value="cart">Cartesian</option>
            </SelectField>
          </Field>
          <Field label="Axis X">
            <NumericField value={form.axisX} min={-1} max={1} step={0.1} slider={false} onChange={(v) => setField({ axisX: v })} onRelease={commitAxis} />
          </Field>
          <Field label="Axis Y">
            <NumericField value={form.axisY} min={-1} max={1} step={0.1} slider={false} onChange={(v) => setField({ axisY: v })} onRelease={commitAxis} />
          </Field>
          <Field label="Axis Z">
            <NumericField value={form.axisZ} min={-1} max={1} step={0.1} slider={false} onChange={(v) => setField({ axisZ: v })} onRelease={commitAxis} />
          </Field>
        </FieldSection>
      )}

      {type === "CamMotion" && (
        <FieldSection title="Camera motion">
          <Field label="End camera">
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
        <FieldSection title={type === "ShowHideAnim" ? "Show / Hide" : "Slide"}>
          <Field label="Renderer">
            <SelectField
              value={rendIsMulti ? RENDER_MULTI : rendVal}
              onChange={(v) => {
                if (v !== RENDER_MULTI) commit("rend", v);
              }}
            >
              <option value="">(none)</option>
              {rendIsMulti && <option value={RENDER_MULTI}>(multiple)</option>}
              {options.renderers.map((r) => (
                <option key={`${r.objName}/${r.name}`} value={r.name}>
                  {r.objName}/{r.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Hide" inline>
            <SwitchField checked={!!t.hide} onChange={(c) => commit("hide", c)} />
          </Field>
          {type === "ShowHideAnim" && (
            <>
              <Field label="Fade" inline>
                <SwitchField checked={!!t.fade} onChange={(c) => commit("fade", c)} />
              </Field>
              <Field label="Target alpha">
                <NumericField
                  value={form.tgtAlpha}
                  min={0}
                  max={1}
                  step={0.1}
                  onChange={(v) => setField({ tgtAlpha: v })}
                  onRelease={(v) => commit("tgtAlpha", v)}
                />
              </Field>
            </>
          )}
          {type === "SlideInOutAnim" && (
            <>
              <Field label="Direction">
                <SelectField
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
              </Field>
              <Field label="Angle">
                <NumericField
                  value={form.direction}
                  min={0}
                  max={360}
                  step={5}
                  unit="°"
                  onChange={(v) => setField({ direction: v })}
                  onRelease={(v) => commit("direction", v)}
                />
              </Field>
              <Field label="Distance">
                <NumericField
                  value={form.distance}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(v) => setField({ distance: v })}
                  onRelease={(v) => commit("distance", v)}
                />
              </Field>
            </>
          )}
        </FieldSection>
      )}

      {type === "MolAnim" && (
        <FieldSection title="Mol morphing">
          <Field label="Target mol">
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
            <NumericField
              value={form.startValue}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => setField({ startValue: v })}
              onRelease={(v) => commit("startValue", v)}
            />
          </Field>
          <Field label="End value">
            <NumericField
              value={form.endValue}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => setField({ endValue: v })}
              onRelease={(v) => commit("endValue", v)}
            />
          </Field>
        </FieldSection>
      )}
    </div>
  );
};
