/**
 * @file features/inspector/rows/LimitDisplayRows.tsx
 * @description The map renderers' "Limit display by" block.
 *
 * A block rather than rows because its toggle is not a property: the UXP
 * groupbox checkbox was checked whenever a boundary molecule was named, so
 * turning it off clears the molecule and the selection together, and turning
 * it on picks the first molecule available. Between those two the toggle has
 * to remember that the user asked for it while no molecule is chosen yet --
 * which is the local state, and the reason this cannot be a gate on a value.
 *
 * Target lists the scene's molecule objects (UXP `ObjMenuList` MolCoord filter).
 */

import React, { useEffect, useState } from 'react'
import { PropertyField, SelectField, SwitchField } from '@renderer/h3-kit/form'
import { objectFilters } from '@renderer/h3-kit/ObjectSelect'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { NumRow } from './NumRow'
import { SelRow } from './SelRow'
import { resetProps, type ResetFn, type SetFn } from './rowProps'
import type { SceneObjectEntry } from '@renderer/worker/server/services/listSceneObjects.service'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { PropMultiWrite } from '@renderer/features/inspector/rendererPropSections'
import type { CustomRowProps } from '@renderer/features/inspector/schema/types'

/** The scene's molecule (MolCoord) object names, for the target selector. */
export function useMolObjectNames(sceneId: number | undefined): string[] {
  const { cm } = useCueMol()
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    if (!cm || sceneId === undefined) {
      setNames([])
      return
    }
    let cancelled = false
    cm.invokeService('listSceneObjects', { sceneId })
      .then((r) => {
        if (cancelled) return
        const mols = (r?.objects ?? []).filter((o: SceneObjectEntry) =>
          objectFilters.molCoord(o),
        )
        setNames(mols.map((o: SceneObjectEntry) => o.name).filter(Boolean))
      })
      .catch(() => {
        if (!cancelled) setNames([])
      })
    return () => {
      cancelled = true
    }
  }, [cm, sceneId])

  return names
}

interface MolTargetRowProps {
  entry: GenericPropEntry
  label: string
  names: string[]
  disabled?: boolean
  onSet: SetFn
  onReset: ResetFn
}

/**
 * Molecule selector committing the raw object-name string. The current value
 * stays selectable even when the fetch is empty or excludes it; an empty value
 * shows a blank placeholder.
 */
const MolTargetRow: React.FC<MolTargetRowProps> = ({
  entry,
  label,
  names,
  disabled = false,
  onSet,
  onReset,
}) => {
  const current = String(entry.value ?? '')
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {current === '' && <option value="" />}
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

export const LimitDisplayRows: React.FC<CustomRowProps> = ({
  ctx,
  onSet,
  onSetMany,
  onReset,
}) => {
  const bndryMol = ctx.get('bndry_molname')
  const bndrySel = ctx.get('bndry_sel')
  const bndryRng = ctx.get('bndry_rng')

  const molNames = useMolObjectNames(ctx.sceneId)
  const [enabled, setEnabled] = useState(false)

  if (!bndryMol) return null

  const hasTarget = String(bndryMol.value ?? '') !== ''
  const limitOn = enabled || hasTarget

  const toggleLimit = (on: boolean): void => {
    setEnabled(on)
    if (on) {
      // Auto-pick the first molecule for convenience (UXP parity). If none is
      // available yet, the Target selector is now enabled so the user can pick
      // one once the molecule list loads.
      if (!hasTarget && molNames.length > 0) onSet(bndryMol.key, bndryMol.type, molNames[0])
      return
    }
    const writes: PropMultiWrite[] = [
      { key: bndryMol.key, valueType: bndryMol.type, value: '' },
    ]
    if (bndrySel) writes.push({ key: bndrySel.key, valueType: bndrySel.type, value: '' })
    if (writes.length === 1) onSet(writes[0].key, writes[0].valueType, writes[0].value)
    else if (onSetMany) onSetMany(writes)
    else writes.forEach((w) => onSet(w.key, w.valueType, w.value))
  }

  return (
    <>
      <PropertyField label="Limit display by" inline>
        <SwitchField checked={limitOn} onChange={toggleLimit} />
      </PropertyField>
      <MolTargetRow
        entry={bndryMol}
        label="Target"
        names={molNames}
        disabled={!limitOn}
        onSet={onSet}
        onReset={onReset}
      />
      {bndrySel && (
        <SelRow
          entry={bndrySel}
          label="Selection"
          onSet={onSet}
          onReset={onReset}
          sceneId={ctx.sceneId}
          molId={ctx.molId}
          disabled={!limitOn}
        />
      )}
      {bndryRng && (
        <NumRow
          entry={bndryRng}
          label="Distance"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.1}
          unit="Å"
          disabled={!limitOn}
        />
      )}
    </>
  )
}
