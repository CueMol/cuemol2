/**
 * @file h3-kit/form/TimeField/useTimeWheel.ts
 * @description Ctrl / Cmd + wheel over the field steps the segment under the
 * pointer, one step per notch (Shift for a fine step), Blender's number-field
 * gesture. A plain wheel is left alone so the pane keeps scrolling.
 *
 * The listener is attached natively with `passive: false`: React's synthetic
 * `onWheel` cannot `preventDefault`, and a Ctrl+wheel that is not prevented
 * zooms the page.
 */

import { useEffect } from 'react';
import { segmentAtX, stepValue } from './timeMath';
import type { SegmentRect, TimeUnit } from './timeMath';
import type { TimeCore } from './types';

export function useTimeWheel(core: TimeCore): void {
    const { rootRef, segRefs, cbRef, activeUnitRef, setActiveUnit, modeRef, run, disabled } = core;

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (disabled || modeRef.current === 'editing') return;
            if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0) return;
            e.preventDefault();

            const hit = (e.target as HTMLElement | null)?.closest?.('[data-unit]') as HTMLElement | null;
            let unit = hit?.dataset.unit as TimeUnit | undefined;
            if (!unit) {
                const rects: SegmentRect[] = [];
                segRefs.current.forEach((seg, u) => {
                    const r = seg.getBoundingClientRect();
                    rects.push({ unit: u, left: r.left, right: r.right });
                });
                unit = segmentAtX(rects, e.clientX) ?? activeUnitRef.current;
            }
            setActiveUnit(unit);

            // One notch is one interaction: nothing to preview, so it is an
            // `onChange` + `onRelease` pair rather than an announced run.
            const { min, max } = cbRef.current;
            const sign = e.deltaY < 0 ? 1 : -1;
            run.begin('keys', false);
            run.update(stepValue(run.held(), unit, sign, e.shiftKey ? 'fine' : 'normal', min, max));
            run.end();
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled]);
}
