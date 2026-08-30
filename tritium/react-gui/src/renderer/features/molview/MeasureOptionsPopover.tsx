/**
 * @file features/molview/MeasureOptionsPopover.tsx
 * @description Popover content for the measure tool's "options cap". Lets the
 * user choose the target atomintr renderer (label set) that new distance /
 * angle / torsion labels are appended to: either an existing named set or a new
 * name typed into the field. Defaults to "measure".
 *
 * Ports the UXP measure target-list dropdown. The existing renderer names are
 * fetched from the worker (`measureListTargets`) when the popover opens.
 */
import React, { useEffect, useState } from 'react';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';
import { TextField } from '@renderer/h3-kit/form';

interface Props {
    /** Current target label-set name (defaults to "measure"). */
    target: string;
    /** Set the current target label-set name. */
    onTargetChange: (name: string) => void;
}

export const MeasureOptionsPopover: React.FC<Props> = ({ target, onTargetChange }) => {
    const { cm } = useCueMol();
    const { activeMolViewId: activeViewID } = useActiveScene();
    const [names, setNames] = useState<string[]>([]);

    // Fetch existing atomintr renderer names when the popover mounts (it mounts
    // on open). The list is advisory -- typing a new name creates a new set.
    useEffect(() => {
        if (!cm || activeViewID == null) return;
        let cancelled = false;
        void cm.invokeService('measureListTargets', { viewId: activeViewID }).then((r) => {
            if (!cancelled && r) setNames(r.names);
        });
        return () => {
            cancelled = true;
        };
    }, [cm, activeViewID]);

    return (
        <div className="measure-options-popover">
            <div className="measure-options-title">Target label set</div>
            <TextField
                value={target}
                onChange={onTargetChange}
                placeholder="measure"
            />
            <div className="measure-options-list">
                {names.map((n) => (
                    <button
                        key={n}
                        type="button"
                        className={`measure-options-row${target === n ? ' selected' : ''}`}
                        onClick={() => onTargetChange(n)}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <div className="measure-options-hint">Type a new name to start a new label set.</div>
        </div>
    );
};
