/**
 * @file MolStructPane.tsx
 * @description Side-panel surface that mirrors UXP `panel.molstruct`
 * (`uxp_gui/cuemol2/base/content/molstruct-panel.{xul,js}`).
 *
 * Contents:
 *   - molecule selector (`HTMLSelect` over MolCoord-like scene objects)
 *   - chain / residue / atom tree (Blueprint `Tree`, multi-select)
 *   - toolbar: Select / Center / Zoom / Properties
 *
 * Phase 1 wires chain-level selection + the `Select` button. Center /
 * Zoom / Properties are rendered as disabled placeholders so the
 * toolbar shape matches UXP; they become live in Phase 2.
 *
 * @module MolStructPane
 */

import React, { useCallback, useMemo, useState } from "react";
import {
    Button,
    ButtonGroup,
    HTMLSelect,
    Icon,
    Tooltip,
    Tree,
    type IconName,
    type TreeNodeInfo,
} from "@blueprintjs/core";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import { useMolStructure } from "../../hooks/useMolStructure";
import {
    encodeChainId,
    selStrFromTree,
    type MolTreeId,
} from "./molStruct/selStrFromTree";

/* --- Props --- */

interface MolStructPaneProps {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    activeSceneId: number | undefined;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* --- Component --- */

export const MolStructPane: React.FC<MolStructPaneProps> = ({
    cm,
    activeSceneId,
    collapsed,
    onToggleCollapse,
}) => {
    const {
        mols,
        selectedMolId,
        setSelectedMolId,
        chains,
    } = useMolStructure({ cm, sceneId: activeSceneId });

    // Multi-select tree state. Cmd/Ctrl+click toggles membership; a plain
    // click replaces the set with the single clicked id. Mirrors UXP
    // `seltype="multiple"` on `molStructTree`.
    const [selectedIds, setSelectedIds] = useState<Set<MolTreeId>>(() => new Set());

    const handleSelectMol = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) {
                setSelectedMolId(next);
                // Switching molecule invalidates any previous tree selection.
                setSelectedIds(new Set());
            }
        },
        [setSelectedMolId],
    );

    const handleNodeClick = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            const id = String(node.id);
            setSelectedIds((prev) => {
                if (e.metaKey || e.ctrlKey) {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                }
                return new Set([id]);
            });
        },
        [],
    );

    // Phase 1: only chain rows. Phase 2 will expand to residue / atom
    // children with lazy loading.
    const treeContents: TreeNodeInfo[] = useMemo(() => {
        return chains.map((chain) => {
            const id = encodeChainId(chain.name);
            return {
                id,
                label: `chain "${chain.name}"`,
                icon: "git-branch" as IconName,
                isSelected: selectedIds.has(id),
                hasCaret: false,
            };
        });
    }, [chains, selectedIds]);

    const hasSelection = selectedIds.size > 0;
    const onSelect = useCallback(() => {
        if (!cm || activeSceneId === undefined || selectedMolId === undefined) return;
        const selStr = selStrFromTree(selectedIds);
        if (!selStr) return;
        cm.invokeService("applyMolSelString", {
            sceneId: activeSceneId,
            molId: selectedMolId,
            selStr,
        }).catch((err: unknown) => {
            console.warn("applyMolSelString failed:", err);
        });
    }, [cm, activeSceneId, selectedMolId, selectedIds]);

    return (
        <div className="sp-pane">
            <div
                className={`sp-section-header ${onToggleCollapse ? "collapsible" : ""}`}
                onClick={onToggleCollapse}
            >
                <div className="sp-section-header-left">
                    {onToggleCollapse != null && (
                        <Icon
                            icon={collapsed ? "chevron-right" : "chevron-down"}
                            size={12}
                            className="section-chevron"
                        />
                    )}
                    <Icon icon="git-branch" size={14} className="section-icon" />
                    <span className="section-title">Mol Struct</span>
                </div>
                <div
                    className="sp-section-header-actions"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ButtonGroup minimal>
                        <Tooltip content="Select atoms" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="select" size={14} />}
                                className="section-action-btn"
                                disabled={!hasSelection || selectedMolId === undefined}
                                onClick={onSelect}
                            />
                        </Tooltip>
                        <Tooltip content="Center at" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="locate" size={14} />}
                                className="section-action-btn"
                                disabled
                            />
                        </Tooltip>
                        <Tooltip content="Zoom at" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="zoom-to-fit" size={14} />}
                                className="section-action-btn"
                                disabled
                            />
                        </Tooltip>
                        <Tooltip content="Properties" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="properties" size={14} />}
                                className="section-action-btn"
                                disabled
                            />
                        </Tooltip>
                    </ButtonGroup>
                </div>
            </div>
            {!collapsed && (
                <div className="sp-pane-fill">
                    <div className="selection-row">
                        <label className="selection-label">Molecule</label>
                        <HTMLSelect
                            value={selectedMolId ?? ""}
                            onChange={handleSelectMol}
                            fill
                            disabled={mols.length === 0}
                            className="selection-mol-select"
                        >
                            {mols.length === 0 ? (
                                <option value="">(no molecules)</option>
                            ) : (
                                mols.map((mol) => (
                                    <option key={mol.uid} value={mol.uid}>
                                        {mol.name || `Mol ${mol.uid}`}
                                    </option>
                                ))
                            )}
                        </HTMLSelect>
                    </div>
                    <div className="sp-pane-scroll mol-tree-scroll">
                        <Tree
                            contents={treeContents}
                            onNodeClick={handleNodeClick}
                            className="mol-tree"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
