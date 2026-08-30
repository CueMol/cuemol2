/**
 * @file features/coloring/colorPane/RendererSelector.tsx
 * @description The pane's target dropdown: which renderer (or object) the
 * coloring below applies to.
 *
 * Rows are encoded with `makeKey` because a uid alone does not identify a
 * target -- an object and a renderer can share one.
 */

import React, { useMemo } from 'react'
import { HTMLSelect } from '@blueprintjs/core'
import type { PaintCapableRendererEntry } from '@renderer/worker/server/services/coloring/coloring.service'
import { makeKey, type TargetKey } from './targetKey'

void React // classic JSX runtime (vitest)

interface RendererSelectorProps {
    renderers: PaintCapableRendererEntry[]
    selectedKey: TargetKey | null
    onChange: (key: TargetKey | null) => void
}

export const RendererSelector: React.FC<RendererSelectorProps> = ({
    renderers,
    selectedKey,
    onChange,
}) => {
    // Group by parent object so the object row sits at the top of its
    // <optgroup>, followed by its child renderers (mirrors UXP layout).
    const groups = useMemo(() => {
        const byObj = new Map<number, { objName: string; entries: PaintCapableRendererEntry[] }>()
        for (const r of renderers) {
            const g = byObj.get(r.objId) ?? { objName: r.objName, entries: [] }
            g.entries.push(r)
            byObj.set(r.objId, g)
        }
        return Array.from(byObj.values())
    }, [renderers])

    if (renderers.length === 0) {
        return (
            <HTMLSelect
                disabled
                fill
                value=""
                onChange={() => {}}
                className="color-enum-select h3-form-select"
            >
                <option value="">(no paint-capable renderers)</option>
            </HTMLSelect>
        )
    }

    return (
        <HTMLSelect
            fill
            value={selectedKey ?? ''}
            className="color-enum-select h3-form-select"
            onChange={(e) => {
                const v = e.target.value
                onChange(v === '' ? null : v)
            }}
        >
            {groups.map((g, gi) => (
                <optgroup key={gi} label={g.objName || '(unnamed)'}>
                    {g.entries.map((r) => {
                        const key = makeKey(r.targetKind, r.rendId)
                        const label =
                            r.targetKind === 'object'
                                ? `${r.name || r.typeName} (object)`
                                : `${r.name || r.typeName} (${r.typeName})`
                        return (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        )
                    })}
                </optgroup>
            ))}
        </HTMLSelect>
    )
}
