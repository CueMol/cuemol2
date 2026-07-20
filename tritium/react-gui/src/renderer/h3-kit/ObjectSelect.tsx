/**
 * @file h3-kit/ObjectSelect.tsx
 * @description Reusable "scene-object dropdown" widget. Fetches the
 * list of scene objects via `listSceneObjects`, filters them through
 * an optional client-side predicate, subscribes to SEM_OBJECT /
 * SEM_SCENE events for auto-refresh, and renders a controlled
 * dropdown styled to match the side-panel `.selection-row` /
 * `.selection-label` / `.selection-mol-select` convention.
 *
 * Generic enough to live anywhere that needs a scene-object picker
 * (side panes, modal dialogs, popovers); the widget owns its own
 * data fetch so callers pass only `cm` + `sceneId` + filter spec +
 * controlled selection.
 *
 * The widget is controlled: the parent owns `selectedId` and reacts
 * to `onChange`. When the filtered list changes and the current
 * selection is no longer valid (or was undefined), the widget calls
 * `onChange(items[0]?.uid)` so downstream hooks (`useMolStructure`,
 * `useSymmetryPanel`, etc.) always see a sensible default.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Field, SelectField } from './form'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { SceneObjectEntry } from '../worker/server/services/listSceneObjects.service'
import { SEM_OBJECT, SEM_SCENE, SEM_ANY } from '../event'
import { useCueMolEventListener } from '../hooks/useCueMolEventListener'

/** Predicate applied to each scene object; only matching items appear. */
export type ObjectFilter = (item: SceneObjectEntry) => boolean

/**
 * Pre-built predicates for common filter shapes. Each consumer is free
 * to compose their own -- these are just the recurring cases.
 */
export const objectFilters = {
    /** MolCoord and its conventional subclasses (e.g. PDBMol, QdfMol). */
    molCoord: (it: SceneObjectEntry): boolean =>
        it.className === 'MolCoord' || it.className.endsWith('Mol'),
    /** DensityMap and subclasses. */
    densityMap: (it: SceneObjectEntry): boolean =>
        it.className === 'DensityMap' || it.className.endsWith('DensityMap'),
    /** MolSurfObj (molecular surface objects). */
    molSurf: (it: SceneObjectEntry): boolean =>
        it.className === 'MolSurfObj',
    /** MD Trajectory objects (mdtools::Trajectory, a MolCoord subclass whose
     *  class name does not end in "Mol", so it is not covered by molCoord). */
    trajectory: (it: SceneObjectEntry): boolean =>
        it.className === 'Trajectory',
    /** Union of molCoord + densityMap; the Symmetry panel uses this. */
    molCoordOrDensityMap: (it: SceneObjectEntry): boolean =>
        objectFilters.molCoord(it) || objectFilters.densityMap(it),
}

interface Props {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** Uppercase label rendered above the dropdown (e.g. "Molecule"). */
    label: string
    /** Pick a subset of scene objects; omit to show every object. */
    filter?: ObjectFilter
    /** Controlled selection -- pass `useState`-managed value. */
    selectedId: number | undefined
    /**
     * Called with the new uid when the user picks an item, and with
     * the auto-default when the filtered list changes such that the
     * current selection is no longer valid.
     */
    onChange: (uid: number | undefined) => void
    /** Shown as the sole disabled option when no items match. */
    emptyText?: string
    /** Fallback display name when `item.name` is the empty string. */
    fallbackName?: (item: SceneObjectEntry) => string
    /**
     * Render only the dropdown (no `Field` label row), for placement inside a
     * `FieldSection` whose title already provides the label. `label` is still
     * used as the accessible name.
     */
    hideLabel?: boolean
}

export const ObjectSelect: React.FC<Props> = ({
    cm, sceneId, label, filter,
    selectedId, onChange,
    emptyText = '(no items)',
    fallbackName,
    hideLabel = false,
}) => {
    const [allItems, setAllItems] = useState<SceneObjectEntry[]>([])
    const fetchToken = useRef(0)

    // Stash sceneId so the event-driven refetch stays identity-stable
    // (no resubscribe on every render).
    const sceneIdRef = useRef(sceneId)
    sceneIdRef.current = sceneId

    const fetchList = useCallback(() => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined) {
            setAllItems([])
            return
        }
        const token = ++fetchToken.current
        cm.invokeService('listSceneObjects', { sceneId: sid })
            .then((res) => {
                if (token !== fetchToken.current) return
                setAllItems(res?.objects ?? [])
            })
            .catch((err: unknown) => {
                if (token !== fetchToken.current) return
                console.warn('listSceneObjects failed:', err)
                setAllItems([])
            })
    }, [cm])

    // Initial / scene-change fetch.
    useEffect(() => { fetchList() }, [cm, sceneId, fetchList])

    // Object add / remove / property-change refetch (UXP ObjMenuList parity).
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: fetchList,
        debounceMs: 30,
    })
    // Scene-wide events (load / clear) -- list may churn wholesale.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_SCENE,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: fetchList,
        debounceMs: 30,
    })

    const items = useMemo(
        () => (filter ? allItems.filter(filter) : allItems),
        [allItems, filter],
    )

    // Auto-default: when items change such that the current selection
    // is gone (or never was), pick the first match.
    useEffect(() => {
        const valid = selectedId !== undefined && items.some((i) => i.uid === selectedId)
        if (valid) return
        const next = items.length > 0 ? items[0].uid : undefined
        if (next !== selectedId) onChange(next)
        // Intentionally not depending on `selectedId` or `onChange`:
        // we want this effect to fire only when the items list changes,
        // not when the parent reassigns onChange or the user picks a
        // different item via handleChange (which would race the parent
        // state update).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items])

    const handleChange = useCallback(
        (value: string) => {
            const v = Number(value)
            if (Number.isFinite(v)) onChange(v)
        },
        [onChange],
    )

    const select = (
        <SelectField
            value={selectedId ?? ''}
            onChange={handleChange}
            disabled={items.length === 0}
            aria-label={label}
        >
            {items.length === 0 ? (
                <option value="">{emptyText}</option>
            ) : (
                items.map((it) => (
                    <option key={it.uid} value={it.uid}>
                        {it.name || fallbackName?.(it) || `Obj ${it.uid}`}
                    </option>
                ))
            )}
        </SelectField>
    )

    // Bare dropdown (no Field label) for use inside a FieldSection.
    if (hideLabel) return <div className="h3-object-select">{select}</div>

    return (
        <Field label={label} className="h3-object-select">
            {select}
        </Field>
    )
}
