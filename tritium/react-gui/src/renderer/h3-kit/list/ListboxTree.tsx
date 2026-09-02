/**
 * @file h3-kit/list/ListboxTree.tsx
 * @description Blueprint `Tree` as the kit draws it: the `.h3-listbox-tree`
 * row metrics from `styles/_list-kit.css`, and the kit's `DisclosureCaret` in
 * place of Blueprint's own caret.
 *
 * Blueprint renders its caret as a fixed `@blueprintjs/icons` ChevronRight (a
 * filled 16px glyph) with no way to substitute it, so a tree caret never
 * matched the Phosphor caret every other disclosure in the app draws. This
 * wrapper hands Blueprint `hasCaret: false` for every node, hides the spacer
 * Blueprint renders in that case, and puts a caret slot in front of the node
 * icon instead: Blueprint returns an element `icon` verbatim, so a fragment of
 * [caret slot, icon] lands as two siblings in the row. A click on the slot
 * stops propagation and calls `onNodeExpand` / `onNodeCollapse` with the
 * consumer's own node and its path -- what Blueprint's caret did.
 *
 * Props are Blueprint's `TreeProps`; nothing else changes for the consumer.
 *
 * @module list/ListboxTree
 */

import React, { useMemo } from 'react';
import { Icon as BpIcon, Tree } from '@blueprintjs/core';
import type { TreeNodeInfo, TreeProps } from '@blueprintjs/core';
import { DisclosureCaret } from '../primitives/DisclosureCaret';

type ToggleHandler<T> = TreeProps<T>['onNodeExpand'];

/** What Blueprint's `Icon` would have made of the node's `icon` prop. */
function nodeIcon(icon: TreeNodeInfo['icon']): React.ReactNode {
    if (icon == null || typeof icon === 'boolean') return null;
    if (typeof icon === 'string') {
        return <BpIcon icon={icon} className="bp5-tree-node-icon" aria-hidden tabIndex={-1} />;
    }
    return icon;
}

/**
 * Re-key every node onto the kit caret. Blueprint's `hasCaret` default (a
 * caret iff the node has children) and its disabled behaviour (a caret that
 * does not toggle) are preserved.
 */
function withKitCarets<T>(
    nodes: ReadonlyArray<TreeNodeInfo<T>>,
    path: number[],
    onExpand: ToggleHandler<T>,
    onCollapse: ToggleHandler<T>,
): TreeNodeInfo<T>[] {
    return nodes.map((node, i) => {
        const nodePath = [...path, i];
        const hasCaret = node.hasCaret ?? (node.childNodes?.length ?? 0) > 0;
        const expanded = node.isExpanded === true;
        const toggle =
            hasCaret && node.disabled !== true
                ? (e: React.MouseEvent<HTMLElement>) => {
                      e.stopPropagation();
                      (expanded ? onCollapse : onExpand)?.(node, nodePath, e);
                  }
                : undefined;
        return {
            ...node,
            hasCaret: false,
            icon: (
                <>
                    <span
                        className="h3-tree-caret"
                        onClick={toggle}
                        title={hasCaret ? (expanded ? 'Collapse group' : 'Expand group') : undefined}
                    >
                        <DisclosureCaret expanded={expanded} leaf={!hasCaret} />
                    </span>
                    {nodeIcon(node.icon)}
                </>
            ),
            childNodes: node.childNodes
                ? withKitCarets(node.childNodes, nodePath, onExpand, onCollapse)
                : undefined,
        };
    });
}

/**
 * Blueprint `Tree` with the kit's row metrics and disclosure caret. Accepts
 * exactly Blueprint's `TreeProps`.
 */
export function ListboxTree<T = object>(props: TreeProps<T>): React.JSX.Element {
    const { contents, onNodeExpand, onNodeCollapse, className, ...rest } = props;
    const kitContents = useMemo(
        () => withKitCarets(contents, [], onNodeExpand, onNodeCollapse),
        [contents, onNodeExpand, onNodeCollapse],
    );
    return (
        <Tree<T>
            {...rest}
            contents={kitContents}
            onNodeExpand={onNodeExpand}
            onNodeCollapse={onNodeCollapse}
            className={`h3-listbox-tree${className ? ` ${className}` : ''}`}
        />
    );
}
