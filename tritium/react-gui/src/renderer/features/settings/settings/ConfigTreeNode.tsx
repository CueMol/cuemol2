/**
 * @file features/settings/settings/ConfigTreeNode.tsx
 * @description Recursive category-tree row for the SettingsPane left rail.
 * Parent rows expand/collapse; leaf rows select a category and show a
 * settings-count badge.
 */

import React, { useCallback } from 'react'
import { AppIcon, DisclosureCaret } from '@renderer/h3-kit/primitives'
import type { CategoryNode } from './settingsConfig'

export interface ConfigTreeNodeProps {
  node: CategoryNode
  depth: number
  selectedId: string
  onSelect: (id: string) => void
  /** Count of settings in each leaf category (for badge display). */
  settingsCount: Record<string, number>
  /** Set of parent ids currently expanded. */
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
}

export const ConfigTreeNode: React.FC<ConfigTreeNodeProps> = ({
  node,
  depth,
  selectedId,
  onSelect,
  settingsCount,
  expandedIds,
  onToggleExpand,
}) => {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedId === node.id
  const count = settingsCount[node.id] ?? 0

  const handleClick = useCallback(() => {
    if (hasChildren) {
      onToggleExpand(node.id)
    } else {
      onSelect(node.id)
    }
  }, [node.id, hasChildren, onSelect, onToggleExpand])

  return (
    <>
      <div
        className={`cfg-tree-item ${isSelected ? 'selected' : ''} ${hasChildren ? 'parent' : 'leaf'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <DisclosureCaret expanded={isExpanded} leaf={!hasChildren} className="cfg-tree-chevron" />
        <AppIcon name={node.icon} size="md" className="cfg-tree-icon" aria-hidden />
        <span className="cfg-tree-label">{node.label}</span>
        {!hasChildren && count > 0 && (
          <span className="cfg-tree-badge">{count}</span>
        )}
      </div>
      {isExpanded &&
        hasChildren &&
        node.children.map((child) => (
          <ConfigTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            settingsCount={settingsCount}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  )
}
