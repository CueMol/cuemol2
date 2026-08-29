/**
 * @file components/inspector/rows/AsyncSelectRow.tsx
 * @description A dropdown whose choices come from the worker.
 *
 * Three rows wanted the same thing and each grew its own copy: the material
 * name, the reference molecule of a surface, and the main-chain renderer a
 * disorder overlay follows. All of them fetch a list of names for the current
 * scene, commit the chosen name as a plain string, and keep the current value
 * selectable even when the fetch is empty or does not include it -- a property
 * naming something that has since been renamed must still be visible.
 *
 * What actually differed was where the names come from and whether an empty
 * choice reads as "(none)" or as a blank line, so those are the parameters.
 */

import React, { useEffect, useState } from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { resetProps } from '../RendererCommonSection'
import { objectFilters } from '@renderer/h3-kit/ObjectSelect'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { RendererPropSectionProps } from '../rendererPropSections'

type SetFn = RendererPropSectionProps['onSet']
type ResetFn = RendererPropSectionProps['onReset']

/** Where a row's choices come from. */
export type AsyncNameSource =
  /** Materials defined in the scene. */
  | { kind: 'materials' }
  /** The scene's molecule objects, by name. */
  | { kind: 'molObjects' }
  /** Sibling renderers of the inspected node, of these types. */
  | { kind: 'siblingRenderers'; typeNames: string[] }

/** Fetch the names for `source`, dropping an answer the scene has outlived. */
export function useAsyncNames(
  source: AsyncNameSource,
  sceneId: number | undefined,
  nodeId: number | undefined,
): string[] {
  const { cm } = useCueMol()
  const [names, setNames] = useState<string[]>([])
  // Serialised so a new object literal per render does not refetch.
  const sourceKey = JSON.stringify(source)

  useEffect(() => {
    const src = JSON.parse(sourceKey) as AsyncNameSource
    const needsNode = src.kind === 'siblingRenderers'
    if (!cm || sceneId === undefined || (needsNode && nodeId === undefined)) {
      setNames([])
      return
    }
    let cancelled = false
    const fetched =
      src.kind === 'materials'
        ? cm.invokeService('getMaterialNames', { sceneId }).then((r) => r.names)
        : src.kind === 'molObjects'
          ? cm.invokeService('listSceneObjects', { sceneId }).then((r) =>
              (r?.objects ?? [])
                .filter((o) => objectFilters.molCoord(o))
                .map((o) => o.name)
                .filter(Boolean),
            )
          : cm
              .invokeService('getSiblingRendererNames', {
                sceneId,
                nodeId: nodeId!,
                typeNames: src.typeNames,
              })
              .then((r) => r.names)
    fetched
      .then((n) => {
        if (!cancelled) setNames(n)
      })
      .catch(() => {
        if (!cancelled) setNames([])
      })
    return () => {
      cancelled = true
    }
  }, [cm, sceneId, nodeId, sourceKey])

  return names
}

export interface AsyncSelectRowProps {
  entry: GenericPropEntry
  label: string
  source: AsyncNameSource
  /**
   * How an empty value reads: a named "(none)" choice the user can pick, or a
   * blank line that only appears while the value is empty.
   */
  emptyOption: 'none' | 'blank'
  sceneId: number | undefined
  nodeId: number | undefined
  disabled?: boolean
  onSet: SetFn
  onReset: ResetFn
}

export const AsyncSelectRow: React.FC<AsyncSelectRowProps> = ({
  entry,
  label,
  source,
  emptyOption,
  sceneId,
  nodeId,
  disabled = false,
  onSet,
  onReset,
}) => {
  const names = useAsyncNames(source, sceneId, nodeId)
  const current = String(entry.value ?? '')
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {emptyOption === 'none' ? (
          <option value="">(none)</option>
        ) : (
          current === '' && <option value="" />
        )}
        {/* Keep the current value selectable even if it is not in the list. */}
        {current !== '' && !names.includes(current) && (
          <option value={current}>{current}</option>
        )}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  )
}
