/**
 * @file components/BondEditOptionsPopover.tsx
 * @description Popover content for the bond-editor tool's "options cap". Lists
 * the selected molecule's non-standard (persistent) bonds and lets the user
 * remove them. Bond *creation* is the in-viewport two-pick gesture (see
 * `useBondEditClickHandler`); this popover only handles the list / remove half,
 * porting the UXP `bond-edit-dlg` tree + Delete button.
 *
 * The molecule picker reuses the shared `ObjectSelect` (molecule filter +
 * event-driven list refetch). The bond list refetches when the popover opens,
 * when the molecule changes, after a delete, and on a debounced topology-changed
 * event so undo / redo / script edits keep an open list in sync.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener';
import { ObjectSelect, objectFilters } from '../h3-kit/ObjectSelect';
import { FormButton } from '../h3-kit/form';
import { AppIcon } from '@renderer/h3-kit/primitives';
import * as event from '../event';
import type { BondAtomJSON, BondAtomPair } from '../worker/server/services/bondEdit.service';

/** Format one bond atom like the UXP tree: "chain resn resid aname[:altc]". */
function formatAtom(a: BondAtomJSON): string {
    const base = `${a.chain} ${a.resn} ${a.resid} ${a.aname}`.replace(/\s+/g, ' ').trim();
    return a.altc ? `${base}:${a.altc}` : base;
}

export const BondEditOptionsPopover: React.FC = () => {
    const { cm } = useCueMol();
    const { activeSceneId: sceneId } = useActiveScene();

    const [molId, setMolId] = useState<number | undefined>(undefined);
    const [bonds, setBonds] = useState<BondAtomPair[]>([]);

    const refetchBonds = useCallback(() => {
        if (!cm || sceneId === undefined || molId === undefined) {
            setBonds([]);
            return;
        }
        void cm.invokeService('bondEditListBonds', { sceneId, molId }).then((r) => {
            setBonds(r?.bonds ?? []);
        });
    }, [cm, sceneId, molId]);

    // Refetch on open / molecule change.
    useEffect(() => {
        refetchBonds();
    }, [refetchBonds]);

    // Keep an open list in sync with topology changes from any source (undo /
    // redo / a bond added by the pick tool / a script). Debounced to coalesce
    // the event burst a single edit fires.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: event.SEM_OBJECT | event.SEM_RENDERER,
        evtMask: event.SEM_ANY,
        scopeId: sceneId ?? -1,
        debounceMs: 30,
        handler: refetchBonds,
    });

    const handleRemove = useCallback(
        (pair: BondAtomPair) => {
            if (!cm || sceneId === undefined || molId === undefined) return;
            void cm
                .invokeService('bondEditRemoveBond', {
                    sceneId,
                    molId,
                    pairs: [[pair[0].aid, pair[1].aid]],
                })
                .then(() => refetchBonds());
        },
        [cm, sceneId, molId, refetchBonds],
    );

    return (
        <div className="bondedit-options-popover">
            <div className="measure-options-title">Non-standard bonds</div>
            {cm && sceneId !== undefined && (
                <ObjectSelect
                    cm={cm}
                    sceneId={sceneId}
                    label="Molecule"
                    filter={objectFilters.molCoord}
                    selectedId={molId}
                    onChange={setMolId}
                    emptyText="(no molecules)"
                    fallbackName={(m) => `Mol ${m.uid}`}
                />
            )}
            <div className="bondedit-bond-list">
                {bonds.length === 0 ? (
                    <div className="measure-options-hint">No non-standard bonds.</div>
                ) : (
                    bonds.map((pair, i) => (
                        <div key={`${pair[0].aid}-${pair[1].aid}-${i}`} className="bondedit-bond-row">
                            <span className="bondedit-bond-atoms" title={`${formatAtom(pair[0])} - ${formatAtom(pair[1])}`}>
                                {formatAtom(pair[0])} <span className="bondedit-bond-dash">-</span> {formatAtom(pair[1])}
                            </span>
                            <FormButton
                                aria-label="Remove bond"
                                title="Remove bond"
                                icon={<AppIcon name="ui.trash" aria-hidden />}
                                onClick={() => handleRemove(pair)}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
