/**
 * @file hooks/renderSettings/useHatchSpecEditor.ts
 * @description The NPR hatch look being edited.
 *
 * The selected style (the umbreon_npr `hatchStyle` prop) is a template: the
 * C++ side resolves it, and this holds an editable copy alongside. That is
 * what `hatchDirty` is for -- an untouched look is not sent, so the render
 * uses the style's own configuration rather than a round trip through here.
 *
 * `hatchStyle` comes in rather than being read here: the backend props are
 * the render settings' state, and two readers of the same value would be two
 * ways for them to disagree.
 */

import { useCallback, useState } from 'react';
import {
  cloneHatchSpec,
  isSameHatchSpec,
  newHatchLayer,
  nextHatchLayerId,
  type HatchInk,
  type HatchLayer,
  type HatchLayerKind,
  type HatchSpec,
  type HatchTone,
} from '@renderer/data/hatchSpec';
import { INITIAL_HATCH, type HatchEditState } from './propMath';

export interface UseHatchSpecEditorOptions {
  /** The selected style name, from the backend props. */
  hatchStyle: string;
}

export function useHatchSpecEditor({ hatchStyle }: UseHatchSpecEditorOptions) {
  const [hatch, setHatch] = useState<HatchEditState>(INITIAL_HATCH);

  /** True once the template of the selected style is held. */
  const hatchLoaded = hatch.template !== null && hatch.style === hatchStyle;
  /** True while the edited look differs from the style's template. */
  const hatchDirty =
    hatch.spec !== null &&
    hatch.template !== null &&
    !isSameHatchSpec(hatch.spec, hatch.template);

  /**
   * Take the template the C++ side resolved `style` to. A reply for a style
   * that is no longer selected is dropped; a look restored from a snapshot is
   * kept and only the template is filled in behind it.
   */
  const applyHatchTemplate = useCallback(
    (style: string, spec: HatchSpec) => {
      if (style !== hatchStyle) return;
      setHatch((prev) => ({
        style,
        template: spec,
        spec: prev.spec ?? cloneHatchSpec(spec),
      }));
    },
    [hatchStyle],
  );

  const updateHatchSpec = useCallback((fn: (spec: HatchSpec) => HatchSpec) => {
    setHatch((prev) => (prev.spec ? { ...prev, spec: fn(prev.spec) } : prev));
  }, []);

  /** Patch one layer; the other layers keep their identity (memoised rows). */
  const updateHatchLayer = useCallback(
    (id: string, patch: Partial<HatchLayer>) =>
      updateHatchSpec((spec) => ({
        ...spec,
        layers: spec.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      })),
    [updateHatchSpec],
  );

  const addHatchLayer = useCallback(
    (kind: HatchLayerKind) =>
      updateHatchSpec((spec) => ({ ...spec, layers: [...spec.layers, newHatchLayer(kind)] })),
    [updateHatchSpec],
  );

  const removeHatchLayer = useCallback(
    (id: string) =>
      updateHatchSpec((spec) => ({ ...spec, layers: spec.layers.filter((l) => l.id !== id) })),
    [updateHatchSpec],
  );

  /** Insert a copy right after the layer. */
  const duplicateHatchLayer = useCallback(
    (id: string) =>
      updateHatchSpec((spec) => {
        const i = spec.layers.findIndex((l) => l.id === id);
        if (i < 0) return spec;
        const copy: HatchLayer = { ...spec.layers[i], id: nextHatchLayerId(), extra: { ...spec.layers[i].extra } };
        const layers = [...spec.layers];
        layers.splice(i + 1, 0, copy);
        return { ...spec, layers };
      }),
    [updateHatchSpec],
  );

  const updateHatchTone = useCallback(
    (patch: Partial<HatchTone>) =>
      updateHatchSpec((spec) => ({ ...spec, tone: { ...spec.tone, ...patch } })),
    [updateHatchSpec],
  );

  const updateHatchInk = useCallback(
    (patch: Partial<HatchInk>) =>
      updateHatchSpec((spec) => ({ ...spec, ink: { ...spec.ink, ...patch } })),
    [updateHatchSpec],
  );

  /** Back to the style's own look. */
  const resetHatchToTemplate = useCallback(() => {
    setHatch((prev) => (prev.template ? { ...prev, spec: cloneHatchSpec(prev.template) } : prev));
  }, []);

  /** Frozen copy of the current settings, used for a render result. */

  return {
    hatch,
    hatchLoaded,
    hatchDirty,
    applyHatchTemplate,
    updateHatchLayer,
    addHatchLayer,
    removeHatchLayer,
    duplicateHatchLayer,
    updateHatchTone,
    updateHatchInk,
    resetHatchToTemplate,
    /** Escape hatch for the snapshot: replaces the whole edit state. */
    setHatch,
  };
}
