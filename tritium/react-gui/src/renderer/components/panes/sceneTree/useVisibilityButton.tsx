/**
 * @file components/panes/sceneTree/useVisibilityButton.tsx
 * @description The eye button on a scene-tree row.
 *
 * Only object / renderer / rendGroup rows carry a real visibility flag, and
 * the button has to say three things rather than two: on, off, and "on but an
 * ancestor is hiding this anyway" -- which is why it needs the parent lookup
 * and not just the node.
 */

import React, { useCallback } from 'react';
import { Button } from '@blueprintjs/core';
import { AppIcon } from '@renderer/h3-kit/primitives';
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes';

void React; // classic JSX runtime (vitest)

export interface UseVisibilityButtonOptions {
    onToggleVisibility: (id: string) => void;
    /** Resolves a node's parent, for the ancestor-hidden state. */
    parentLookup: (id: number) => SceneTreeNode | null;
}

export function useVisibilityButton({
    onToggleVisibility, parentLookup,
}: UseVisibilityButtonOptions) {
    return useCallback(
        (nodeId: string, node: SceneTreeNode) => {
            // Only object / renderer / rendGroup carry a real visibility flag.
            if (
                node.type !== "object" &&
                node.type !== "renderer" &&
                node.type !== "rendGroup"
            ) {
                return undefined;
            }
            // Gray-out (disabled) states:
            //  (a) own flag ON but an ancestor hides the row -- the
            //      object/renderer relationship (C++ display loop gates
            //      on the object's flag, so the row's own flag survives).
            //  (b) the row is a member of a hidden group. The group
            //      hide/show cascade rewrites every member's own flag
            //      (OFF on hide, ON on show), so while the group is
            //      hidden each member is "visible once the group is
            //      shown" regardless of its cascaded-off flag -- render
            //      it with the same gray open eye as (a) so the group
            //      relationship reads like the object one.
            const parent = parentLookup(node.id);
            const inHiddenGroup =
                parent?.type === "rendGroup" && !parent.visible;
            const disabledByAncestor =
                (node.visible && !node.effectiveVisible) || inHiddenGroup;
            const eyeIcon =
                node.visible || inHiddenGroup ? "ui.eyeOpen" : "ui.eyeClosed";
            const className =
                "visibility-toggle " +
                (disabledByAncestor
                    ? "disabled"
                    : node.effectiveVisible
                      ? "visible"
                      : "hidden");
            return (
                <Button
                    minimal
                    small
                    icon={<AppIcon name={eyeIcon} aria-hidden />}
                    className={className}
                    aria-disabled={disabledByAncestor || undefined}
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        // Gray-out rows do not toggle: under a hidden
                        // ancestor object the flip would visibly do
                        // nothing, and inside a hidden group it would
                        // desync the member from the group cascade (the
                        // C++ display loop has no group gate, so an ON
                        // member of a hidden group would draw). Deviation
                        // from UXP, which let the click flip the flag.
                        if (disabledByAncestor) return;
                        onToggleVisibility(nodeId);
                    }}
                />
            );
        },
        [onToggleVisibility, parentLookup],
    );
}
