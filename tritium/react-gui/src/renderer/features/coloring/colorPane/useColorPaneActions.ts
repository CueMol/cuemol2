/**
 * @file components/panes/colorPane/useColorPaneActions.ts
 * @description Every write the coloring pane makes.
 *
 * All of them share one shape -- resolve the current target, then fire one
 * service -- which is why they belong together and away from the render. The
 * pane decides what is on screen; this decides what a click sends.
 *
 * `requireTarget` is passed in rather than derived here: the pane already
 * resolves the selected row into a target, and two sources for that would be
 * a way for them to disagree.
 */

import { useCallback } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import type { RendColoringId } from '@shared/types/sceneCtxMenu';
import type {
    ColoringTargetKind,
    PaintEntryDto,
} from '@renderer/worker/server/services/rendererColoring.service';
import { fireService } from '@renderer/utils/fireService';
import { IPC } from '@shared/ipcChannels';

/** The three fields every coloring service call needs, or null when no target. */
export type ColoringTargetRef = {
    sceneId: number;
    rendId: number;
    targetKind: ColoringTargetKind;
} | null;

export interface UseColorPaneActionsOptions {
    cm: AsyncCueMol | null;
    requireTarget: () => ColoringTargetRef;
    entries: PaintEntryDto[];
    selectedRow: number | null;
    selectedRows: Set<number>;
    setSelectedRow: (idx: number | null) => void;
    /**
     * Reports whether the OS clipboard now holds paint rows. Cut / Copy learn
     * it from the write they just did, and Paste learns it from finding the
     * clipboard empty -- both cheaper than re-asking, and Electron has no
     * clipboard-change event to ask on.
     */
    setCanPastePaint: (can: boolean) => void;
}

export function useColorPaneActions({
    cm, requireTarget, entries, selectedRow, selectedRows, setSelectedRow,
    setCanPastePaint,
}: UseColorPaneActionsOptions) {
    const onSelectMode = useCallback(
        (coloringId: RendColoringId) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererColoring', {
                ...t,
                coloringId,
            })
        },
        [cm, requireTarget],
    )

    const onAddRow = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm) return
        // UXP `onAddCmd` parity:
        //   - insert before the selected row (id = elem.obj_id);
        //     when no row is selected, id = 0 (insert at top).
        //   - inherit sel / color from the selected row (UXP also checks
        //     the parent mol's `sel` first; deferred to a later phase).
        //   - fall back to "*" / "#FFF" when there is no row to inherit
        //     from (paint-propdlg defaults).
        const idx = selectedRow !== null ? selectedRow : 0
        const ref = selectedRow !== null ? entries[selectedRow] : undefined
        const selStr = ref?.selStr ?? '*'
        const colorValue = ref?.colorValue ?? '#FFFFFF'
        fireService(cm, 'addPaintEntry', {
            ...t,
            idx,
            selStr,
            colorValue,
        })
        // The new entry occupies the insert position; track it so the
        // toolbar buttons act on the freshly-added row.
        setSelectedRow(idx)
    }, [cm, requireTarget, selectedRow, entries, setSelectedRow])

    /**
     * Delete every selected row under one undo transaction (UXP
     * `onDeleteCmd`, which loops the whole `getSelectedNodeList()`).
     */
    const onRemoveRow = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm || selectedRows.size === 0) return
        fireService(cm, 'removePaintEntries', { ...t, idxs: [...selectedRows] })
        setSelectedRow(null)
    }, [cm, requireTarget, selectedRows, setSelectedRow])

    const onMoveRow = useCallback(
        (dir: 'up' | 'down') => {
            const t = requireTarget()
            if (!t || !cm || selectedRow === null) return
            const toIdx = dir === 'up' ? selectedRow - 1 : selectedRow + 1
            if (toIdx < 0 || toIdx >= entries.length) return
            fireService(cm, 'movePaintEntry', {
                ...t,
                fromIdx: selectedRow,
                toIdx,
            })
            setSelectedRow(toIdx)
        },
        [cm, requireTarget, selectedRow, entries.length, setSelectedRow],
    )

    const onRemoveAllRows = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm) return
        fireService(cm, 'clearPaintEntries', t)
        setSelectedRow(null)
    }, [cm, requireTarget, setSelectedRow])

    /**
     * Copy / Cut the selected row onto the OS clipboard.
     *
     * Cut deletes in the worker first and writes afterwards, mirroring UXP
     * `onCut` (= onCopy + onDeleteCmd) as one undo step. If the clipboard
     * write then fails the rows are gone, but a single Undo restores them.
     */
    const onClipboardTake = useCallback(
        (mode: 'copy' | 'cut') => {
            const t = requireTarget()
            if (!t || !cm || selectedRows.size === 0) return
            const name = mode === 'cut' ? 'cutPaintEntries' : 'copyPaintEntries'
            cm.invokeService(name, { ...t, idxs: [...selectedRows] })
                .then(async (res) => {
                    if (!res.ok || res.entries.length === 0) return
                    if (mode === 'cut') setSelectedRow(null)
                    const w = await window.electronAPI?.invoke(
                        IPC.CLIPBOARD_CUEMOL_WRITE,
                        { kind: 'paint', entries: res.entries },
                    )
                    setCanPastePaint(w?.ok === true)
                })
                .catch((err: unknown) => console.warn(`${name} failed:`, err))
        },
        [cm, requireTarget, selectedRows, setSelectedRow, setCanPastePaint],
    )

    const onPasteRows = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm) return
        void (async () => {
            try {
                const clip = await window.electronAPI?.invoke(
                    IPC.CLIPBOARD_CUEMOL_READ,
                )
                if (clip?.kind !== 'paint') {
                    setCanPastePaint(false)
                    return
                }
                // UXP `_getPaintSelImpl`: insert before the *first* selected
                // row (`elems[0]`), or append when nothing is selected.
                const anchor =
                    selectedRows.size === 0 ? null : Math.min(...selectedRows)
                const res = await cm.invokeService('pastePaintEntries', {
                    ...t,
                    idx: anchor,
                    entries: clip.entries,
                })
                if (res.ok) setSelectedRow(res.startIdx)
            } catch (err) {
                console.warn('pastePaintEntries failed:', err)
            }
        })()
    }, [cm, requireTarget, selectedRows, setSelectedRow, setCanPastePaint])

    const onUpdateCell = useCallback(
        (idx: number, field: 'selStr' | 'colorValue', value: string) => {
            const t = requireTarget()
            const cur = entries[idx]
            if (!t || !cm || !cur) return
            fireService(cm, 'updatePaintEntry', {
                ...t,
                idx,
                selStr: field === 'selStr' ? value : cur.selStr,
                colorValue: field === 'colorValue' ? value : cur.colorValue,
            })
        },
        [cm, requireTarget, entries],
    )

    const onDefaultColorCommit = useCallback(
        (color: string) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererDefaultColor', {
                ...t,
                colorValue: color,
            })
        },
        [cm, requireTarget],
    )

    /**
     * Generic ColoringScheme property commit (CPK col_X, Rainbow start_hue,
     * Bfac mode, etc.). Routes through `setColoringProp` which mirrors
     * UXP `commitPropChange` (materialize on default + setProp under undo).
     */
    const onSetColoringProp = useCallback(
        (propName: string, value: string | number) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setColoringProp', {
                ...t,
                propName,
                propValue: value,
            })
        },
        [cm, requireTarget],
    )

    /**
     * Elepot widgets commit directly on the renderer (lowpar/midpar/highpar
     * etc.) -- not on a ColoringScheme -- so they route through a separate
     * service. Mirrors UXP `commitElepotPropChange`.
     */
    const onSetElepotProp = useCallback(
        (propName: string, value: string | number | boolean) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererElepotProp', {
                ...t,
                propName,
                propValue: value,
            })
        },
        [cm, requireTarget],
    )

    /**
     * "Coloring mol" selector commit: write the MOLFANC reference-molecule
     * name into the renderer's `target` property.
     */
    const onSetColoringTarget = useCallback(
        (targetName: string) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererColoringTarget', {
                ...t,
                targetName,
            })
        },
        [cm, requireTarget],
    )

    return {
        onSelectMode, onAddRow, onRemoveRow, onMoveRow, onRemoveAllRows,
        onClipboardTake, onPasteRows, onUpdateCell, onDefaultColorCommit,
        onSetColoringProp, onSetElepotProp, onSetColoringTarget,
    };
}
