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
 * Residue / atom rows are lazy-loaded on expand via `useMolStructure`;
 * the worker round-trip only happens the first time a node opens.
 * Center / Zoom drive `centerMolSelection` / `zoomMolSelection` using
 * the active mol-view's id. Properties stays a stub — UXP's
 * `onBtnPropCmd` is empty.
 *
 * @module MolStructPane
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Button,
    ButtonGroup,
    Icon,
    Tooltip,
    Tree,
    type IconName,
    type TreeNodeInfo,
} from "@blueprintjs/core";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";
import { useMolStructure } from "../../hooks/useMolStructure";
import { ObjectSelect, objectFilters } from "../../h3-kit/ObjectSelect";
import {
    encodeChainId,
    encodeResidueId,
    encodeAtomId,
    selStrFromTree,
    type MolTreeId,
} from "./molStruct/selStrFromTree";

/* --- Props --- */

interface MolStructPaneProps {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    activeSceneId: number | undefined;
    /** Active mol-view UID — required for Center / Zoom. */
    activeMolViewId: number | undefined;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* --- Component --- */

export const MolStructPane: React.FC<MolStructPaneProps> = ({
    cm,
    activeSceneId,
    activeMolViewId,
    collapsed,
    onToggleCollapse,
}) => {
    const [selectedMolId, setSelectedMolId] = useState<number | undefined>(undefined);
    const {
        chains,
        residuesByChain,
        atomsByResidue,
        loadResidues,
        loadAtoms,
    } = useMolStructure({ cm, sceneId: activeSceneId, molId: selectedMolId });

    // Multi-select tree state. Click semantics mirror Finder / VS Code
    // (and UXP `seltype="multiple"` on `molStructTree`):
    //   - plain click       -> replace with this id, set anchor here
    //   - Cmd/Ctrl+click    -> toggle this id in the set, set anchor here
    //   - Shift+click       -> select inclusive range between anchor and
    //                          this id (in visible-row order), replace
    //   - Shift+Cmd+click   -> select that range and add to existing
    const [selectedIds, setSelectedIds] = useState<Set<MolTreeId>>(() => new Set());
    // Anchor for Shift+click range select; null until the first single /
    // Cmd-click. Stays put on plain Shift+click extensions.
    const [anchorId, setAnchorId] = useState<MolTreeId | null>(null);
    // Expansion state lives in React, not Blueprint — Tree is a stateless
    // controlled component when we set `isExpanded` explicitly.
    const [expandedIds, setExpandedIds] = useState<Set<MolTreeId>>(() => new Set());

    // Clear local selection / expansion whenever the active mol changes
    // (the lazy cache itself is cleared by the hook).
    useEffect(() => {
        setSelectedIds(new Set());
        setAnchorId(null);
        setExpandedIds(new Set());
    }, [selectedMolId]);

    // Self-heal: any expanded chain/residue whose lazy cache is missing
    // should re-fetch. This covers (a) the brief window after mol switch
    // and (b) a future case where caches get invalidated by a topology
    // event — without forcing the user to collapse-and-re-expand. The
    // hook dedupes inflight requests by key so this effect is safe to
    // fire on every render.
    useEffect(() => {
        for (const id of expandedIds) {
            if (id.startsWith('chain:')) {
                const chainName = id.slice('chain:'.length);
                if (chainName && !residuesByChain.has(chainName)) {
                    void loadResidues(chainName);
                }
            } else if (id.startsWith('resid:')) {
                const rest = id.slice('resid:'.length);
                const sep = rest.indexOf(':');
                if (sep > 0) {
                    const chainName = rest.slice(0, sep);
                    const residueIndex = rest.slice(sep + 1);
                    if (
                        chainName &&
                        residueIndex &&
                        !atomsByResidue.has(`${chainName}:${residueIndex}`)
                    ) {
                        void loadAtoms(chainName, residueIndex);
                    }
                }
            }
        }
    }, [expandedIds, residuesByChain, atomsByResidue, loadResidues, loadAtoms]);

    // Flat list of visible row ids in render order. Used by Shift+click
    // range selection. Placeholder rows ("Loading..." / "(no atoms)" /
    // "(no residues)") are excluded — they're not selectable.
    const visibleRowIds = useMemo(() => {
        const ids: MolTreeId[] = [];
        for (const chain of chains) {
            const cid = encodeChainId(chain.name);
            ids.push(cid);
            if (!expandedIds.has(cid)) continue;
            const residues = residuesByChain.get(chain.name);
            if (!residues) continue; // children not loaded yet -> placeholder, skip
            for (const r of residues) {
                const rid = encodeResidueId(chain.name, r.index);
                ids.push(rid);
                if (!expandedIds.has(rid)) continue;
                const atoms = atomsByResidue.get(`${chain.name}:${r.index}`);
                if (!atoms) continue;
                for (const a of atoms) {
                    ids.push(encodeAtomId(chain.name, r.index, a.id));
                }
            }
        }
        return ids;
    }, [chains, expandedIds, residuesByChain, atomsByResidue]);

    const handleNodeClick = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            const id = String(node.id);
            // Ignore the disabled placeholder rows entirely — they have no
            // selectable semantics. They are flagged via `disabled: true`
            // and their ids start with "loading-" or "empty-".
            if (node.disabled) return;

            if (e.shiftKey && anchorId !== null) {
                const a = visibleRowIds.indexOf(anchorId);
                const b = visibleRowIds.indexOf(id);
                if (a >= 0 && b >= 0) {
                    const [lo, hi] = a <= b ? [a, b] : [b, a];
                    const rangeIds = visibleRowIds.slice(lo, hi + 1);
                    setSelectedIds((prev) => {
                        if (e.metaKey || e.ctrlKey) {
                            // Shift+Cmd: union the range with existing.
                            const next = new Set(prev);
                            for (const r of rangeIds) next.add(r);
                            return next;
                        }
                        return new Set(rangeIds);
                    });
                    // Anchor sticks across Shift extensions (Finder parity).
                    return;
                }
                // anchor or clicked id not in the visible set (rare —
                // e.g. anchor row got collapsed); fall through to a plain
                // click below.
            }

            if (e.metaKey || e.ctrlKey) {
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                });
                setAnchorId(id);
                return;
            }

            setSelectedIds(new Set([id]));
            setAnchorId(id);
        },
        [anchorId, visibleRowIds],
    );

    const handleNodeExpand = useCallback(
        (node: TreeNodeInfo) => {
            const id = String(node.id);
            setExpandedIds((prev) => {
                if (prev.has(id)) return prev;
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            // Kick the lazy fetch — useMolStructure dedupes inflight by key.
            if (id.startsWith("chain:")) {
                const chainName = id.slice("chain:".length);
                if (chainName) void loadResidues(chainName);
            } else if (id.startsWith("resid:")) {
                const rest = id.slice("resid:".length);
                const sep = rest.indexOf(":");
                if (sep > 0) {
                    const chainName = rest.slice(0, sep);
                    const residueIndex = rest.slice(sep + 1);
                    if (chainName && residueIndex) void loadAtoms(chainName, residueIndex);
                }
            }
        },
        [loadResidues, loadAtoms],
    );

    const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
        const id = String(node.id);
        setExpandedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    // residueOrder map for selStrFromTree range merging.
    const residueOrder = useMemo<ReadonlyMap<string, readonly string[]>>(() => {
        const out = new Map<string, readonly string[]>();
        residuesByChain.forEach((residues, chainName) => {
            out.set(
                chainName,
                residues.map((r) => r.index),
            );
        });
        return out;
    }, [residuesByChain]);

    const buildAtomChildren = useCallback(
        (chainName: string, residueIndex: string): TreeNodeInfo[] | undefined => {
            const atoms = atomsByResidue.get(`${chainName}:${residueIndex}`);
            if (!atoms) {
                return [
                    {
                        id: `loading-atom:${chainName}:${residueIndex}`,
                        label: "Loading...",
                        icon: "blank" as IconName,
                        disabled: true,
                    },
                ];
            }
            if (atoms.length === 0) {
                return [
                    {
                        id: `empty-atom:${chainName}:${residueIndex}`,
                        label: "(no atoms)",
                        icon: "blank" as IconName,
                        disabled: true,
                    },
                ];
            }
            return atoms.map((atom) => {
                const id = encodeAtomId(chainName, residueIndex, atom.id);
                const label = atom.elem ? `${atom.name} (${atom.elem})` : atom.name;
                return {
                    id,
                    label,
                    icon: "dot" as IconName,
                    isSelected: selectedIds.has(id),
                };
            });
        },
        [atomsByResidue, selectedIds],
    );

    const buildResidueChildren = useCallback(
        (chainName: string): TreeNodeInfo[] | undefined => {
            const residues = residuesByChain.get(chainName);
            if (!residues) {
                return [
                    {
                        id: `loading-resid:${chainName}`,
                        label: "Loading...",
                        icon: "blank" as IconName,
                        disabled: true,
                    },
                ];
            }
            if (residues.length === 0) {
                return [
                    {
                        id: `empty-resid:${chainName}`,
                        label: "(no residues)",
                        icon: "blank" as IconName,
                        disabled: true,
                    },
                ];
            }
            return residues.map((r) => {
                const id = encodeResidueId(chainName, r.index);
                const label = `${r.index} ${r.name}`;
                const expanded = expandedIds.has(id);
                return {
                    id,
                    label,
                    icon: "cube" as IconName,
                    isSelected: selectedIds.has(id),
                    hasCaret: true,
                    isExpanded: expanded,
                    childNodes: expanded
                        ? buildAtomChildren(chainName, r.index)
                        : undefined,
                };
            });
        },
        [residuesByChain, selectedIds, expandedIds, buildAtomChildren],
    );

    const treeContents: TreeNodeInfo[] = useMemo(() => {
        return chains.map((chain) => {
            const id = encodeChainId(chain.name);
            const expanded = expandedIds.has(id);
            return {
                id,
                label: `chain "${chain.name}"`,
                icon: "git-branch" as IconName,
                isSelected: selectedIds.has(id),
                hasCaret: true,
                isExpanded: expanded,
                childNodes: expanded ? buildResidueChildren(chain.name) : undefined,
            };
        });
    }, [chains, selectedIds, expandedIds, buildResidueChildren]);

    const hasSelection = selectedIds.size > 0;
    const hasView = activeMolViewId !== undefined;
    const canApply = hasSelection && selectedMolId !== undefined && activeSceneId !== undefined;

    const onSelect = useCallback(() => {
        if (!cm || !canApply) return;
        const selStr = selStrFromTree(selectedIds, residueOrder);
        if (!selStr) return;
        cm.invokeService("applyMolSelString", {
            sceneId: activeSceneId!,
            molId: selectedMolId!,
            selStr,
        }).catch((err: unknown) => {
            console.warn("applyMolSelString failed:", err);
        });
    }, [cm, canApply, selectedIds, residueOrder, activeSceneId, selectedMolId]);

    const onCenter = useCallback(() => {
        if (!cm || !canApply || !hasView) return;
        const selStr = selStrFromTree(selectedIds, residueOrder);
        if (!selStr) return;
        cm.invokeService("centerMolSelection", {
            sceneId: activeSceneId!,
            viewId: activeMolViewId!,
            molId: selectedMolId!,
            selStr,
        }).catch((err: unknown) => {
            console.warn("centerMolSelection failed:", err);
        });
    }, [cm, canApply, hasView, selectedIds, residueOrder, activeSceneId, activeMolViewId, selectedMolId]);

    const onZoom = useCallback(() => {
        if (!cm || !canApply || !hasView) return;
        const selStr = selStrFromTree(selectedIds, residueOrder);
        if (!selStr) return;
        cm.invokeService("zoomMolSelection", {
            sceneId: activeSceneId!,
            viewId: activeMolViewId!,
            molId: selectedMolId!,
            selStr,
        }).catch((err: unknown) => {
            console.warn("zoomMolSelection failed:", err);
        });
    }, [cm, canApply, hasView, selectedIds, residueOrder, activeSceneId, activeMolViewId, selectedMolId]);

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
                                disabled={!canApply}
                                onClick={onSelect}
                            />
                        </Tooltip>
                        <Tooltip content="Center at" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="locate" size={14} />}
                                className="section-action-btn"
                                disabled={!canApply || !hasView}
                                onClick={onCenter}
                            />
                        </Tooltip>
                        <Tooltip content="Zoom at" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="zoom-to-fit" size={14} />}
                                className="section-action-btn"
                                disabled={!canApply || !hasView}
                                onClick={onZoom}
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
                    <ObjectSelect
                        cm={cm}
                        sceneId={activeSceneId}
                        label="Molecule"
                        filter={objectFilters.molCoord}
                        selectedId={selectedMolId}
                        onChange={setSelectedMolId}
                        emptyText="(no molecules)"
                        fallbackName={(m) => `Mol ${m.uid}`}
                    />
                    <div className="sp-pane-scroll mol-tree-scroll">
                        <Tree
                            contents={treeContents}
                            onNodeClick={handleNodeClick}
                            onNodeExpand={handleNodeExpand}
                            onNodeCollapse={handleNodeCollapse}
                            className="mol-tree h3-listbox-tree"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
