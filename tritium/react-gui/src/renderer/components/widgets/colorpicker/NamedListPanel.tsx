/**
 * @file renderer/components/widgets/colorpicker/NamedListPanel.tsx
 * @description Named-colour list for the colour picker popover.
 *
 * Ports UXP `setupNamedList` / `appendColorList`: scene-scoped colour
 * definitions followed by the global ones, each shown as a swatch + name.
 * Selecting a row commits the colour by its name. Colours are fetched once
 * per open via the `getNamedColors` worker service.
 */

import React, { useEffect, useState } from 'react'
import { Spinner } from '@blueprintjs/core'
import type { AsyncCueMol } from '../../../worker/client/AsyncCueMol'
import type { NamedColorEntry } from '../../../worker/server/services/colorPicker.service'

interface NamedListPanelProps {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** Currently selected name (for highlight), if the colour is named. */
    selectedName?: string
    /** Commit a named colour. */
    onSelect: (name: string) => void
}

/**
 * Scrollable list of scene + global named colours.
 */
export const NamedListPanel: React.FC<NamedListPanelProps> = ({
    cm,
    sceneId,
    selectedName,
    onSelect,
}) => {
    const [entries, setEntries] = useState<NamedColorEntry[] | null>(null)

    useEffect(() => {
        let cancelled = false
        if (!cm) {
            setEntries([])
            return
        }
        ;(async () => {
            const res = await cm.invokeService('getNamedColors', {
                sceneId: sceneId ?? 0,
            })
            if (cancelled) return
            // Scene definitions first (UXP order), then global.
            setEntries([...res.scene, ...res.global])
        })()
        return () => {
            cancelled = true
        }
    }, [cm, sceneId])

    if (entries === null) {
        return (
            <div className="cp-named-loading">
                <Spinner size={20} />
            </div>
        )
    }

    return (
        <div className="cp-named-list">
            {entries.map((e) => (
                <button
                    type="button"
                    key={e.name}
                    className={
                        'cp-named-row' +
                        (e.name === selectedName ? ' cp-named-row--selected' : '')
                    }
                    onClick={() => onSelect(e.name)}
                >
                    <span className="cp-named-swatch" style={{ background: e.hex }} />
                    <span className="cp-named-name">{e.name}</span>
                </button>
            ))}
        </div>
    )
}
