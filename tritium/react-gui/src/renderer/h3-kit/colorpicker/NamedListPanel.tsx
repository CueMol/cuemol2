/**
 * @file h3-kit/colorpicker/NamedListPanel.tsx
 * @description Named-colour list for the colour picker popover.
 *
 * Ports UXP `setupNamedList` / `appendColorList`: scene-scoped colour
 * definitions followed by the global ones, each shown as a swatch + name.
 * Selecting a row commits the colour by its name. Colours are fetched once
 * per open via the `getNamedColors` worker service.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Spinner } from '@blueprintjs/core'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { NamedColorEntry } from '../../worker/server/services/colorPicker.service'

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
/**
 * Normalise a colour name for matching: CueMol names are case-insensitive,
 * and `NamedColor::toString()` may append a `{...}` modifier suffix that is
 * absent from the definition names, so fold case and drop the suffix.
 */
function normalizeName(name: string): string {
    const brace = name.indexOf('{')
    const base = brace >= 0 ? name.slice(0, brace) : name
    return base.trim().toLowerCase()
}

export const NamedListPanel: React.FC<NamedListPanelProps> = ({
    cm,
    sceneId,
    selectedName,
    onSelect,
}) => {
    const [entries, setEntries] = useState<NamedColorEntry[] | null>(null)
    const selectedRef = useRef<HTMLButtonElement | null>(null)

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

    const selectedKey = selectedName !== undefined ? normalizeName(selectedName) : undefined

    // Bring the selected entry into view -- the colour list is long (the full
    // HTML/X11 set), so the match is otherwise below the fold on open.
    useEffect(() => {
        selectedRef.current?.scrollIntoView?.({ block: 'nearest' })
    }, [entries, selectedKey])

    if (entries === null) {
        return (
            <div className="h3-color-named-loading">
                <Spinner size={20} />
            </div>
        )
    }

    return (
        <div className="h3-color-named-list">
            {entries.map((e) => {
                const isSelected =
                    selectedKey !== undefined && normalizeName(e.name) === selectedKey
                return (
                <button
                    type="button"
                    key={e.name}
                    ref={isSelected ? selectedRef : undefined}
                    className={'h3-color-named-row' + (isSelected ? ' h3-color-named-row--selected' : '')}
                    onClick={() => onSelect(e.name)}
                >
                    <span className="h3-color-named-swatch" style={{ background: e.hex }} />
                    <span className="h3-color-named-name type-row">{e.name}</span>
                </button>
                )
            })}
        </div>
    )
}
