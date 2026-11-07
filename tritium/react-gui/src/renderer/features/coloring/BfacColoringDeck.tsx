/**
 * @file features/coloring/BfacColoringDeck.tsx
 * @description The B-factor coloring deck with its multi-colour gradient.
 *
 * A `BfacColoring` colours by its two-colour ramp until its `multi_grad` has
 * nodes; then by the gradient (`docs/architecture/bfac-multigradient.md`).
 * This owns that switch: on writes two nodes taken from the ramp (so the
 * look does not jump), off clears the nodes. While on, the shared
 * `MultiGradSection` edits the coloring's gradient (`gradient: 'coloring'`),
 * for a renderer or an object alike, over the atom values.
 *
 * Requires an ancestor `ColorPickerProvider` (for `MultiGradSection`).
 */

import React, { useCallback } from 'react'
import { Field, SwitchField } from '@renderer/h3-kit/form'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { BfacParams } from '@renderer/worker/server/services/coloring/coloring.service'
import { fireService } from '@renderer/utils/fireService'
import { BfacDeck } from './colorPane/decks'
import { MultiGradSection } from './MultiGradSection'
import { useMultiGradState } from './useMultiGradState'

interface BfacColoringDeckProps {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** The renderer's or the object's uid. */
    id: number
    targetKind: 'renderer' | 'object'
    params: BfacParams
    onCommit: (propName: string, value: string | number) => void
}

export const BfacColoringDeck: React.FC<BfacColoringDeckProps> = ({
    cm, sceneId, id, targetKind, params, onCommit,
}) => {
    const { state, refetch } = useMultiGradState({ cm, sceneId, rendId: id, targetKind, gradient: 'coloring' })
    const active = (state?.nodes.length ?? 0) >= 2

    const setGradient = useCallback((on: boolean) => {
        if (!cm || sceneId === undefined) return
        // Two nodes at the ramp's ends: the same colours as before, now as a gradient.
        // In an auto mode the ramp spans the values themselves.
        const auto = params.autoMode !== 'none'
        const lo = auto && state?.mapStats ? state.mapStats.min : params.lowParam
        const hi = auto && state?.mapStats ? state.mapStats.max : params.highParam
        const nodes = on && hi > lo
            ? [{ value: lo, color: params.lowColor }, { value: hi, color: params.highColor }]
            : []
        if (on && nodes.length === 0) return
        fireService(cm, 'setMultiGradNodes', {
            sceneId, rendId: id, targetKind, gradient: 'coloring', nodes, mode: 'commit',
            label: on ? 'Use a multi-colour gradient' : 'Use two colours',
        })
        refetch()
    }, [cm, sceneId, id, targetKind, params, state?.mapStats, refetch])

    const gradient = (
        <>
            <Field label="Multi-colour gradient" inline>
                <SwitchField checked={active} onChange={setGradient} disabled={state === null} />
            </Field>
            {active && (
                <MultiGradSection cm={cm} sceneId={sceneId} rendId={id} targetKind={targetKind} gradient="coloring" />
            )}
        </>
    )
    return <BfacDeck params={params} onCommit={onCommit} gradient={gradient} gradientActive={active} />
}
