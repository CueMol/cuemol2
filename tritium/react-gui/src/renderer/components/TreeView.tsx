import React, { useState, useCallback } from "react";
import { Icon, type IconName } from "@blueprintjs/core";
import type { TreeNodeData } from "../types";

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, selectedId, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  const handleClick = useCallback(() => {
    onSelect(node.id);
    if (hasChildren) setExpanded((prev) => !prev);
  }, [node.id, hasChildren, onSelect]);

  return (
    <>
      <div
        className={`tree-item ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
        onClick={handleClick}
      >
        <span className="tree-chevron">
          {hasChildren ? (
            <Icon icon={expanded ? "chevron-down" : "chevron-right"} size={12} />
          ) : (
            <span style={{ width: 12 }} />
          )}
        </span>
        <Icon
          icon={node.icon as IconName}
          size={14}
          className="tree-icon"
        />
        <span className="tree-label">{node.label}</span>
        {node.secondaryLabel && (
          <span className="tree-secondary">{node.secondaryLabel}</span>
        )}
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </>
  );
};

interface TreeViewProps {
  data: TreeNodeData[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const TreeView: React.FC<TreeViewProps> = ({ data, selectedId, onSelect }) => {
  return (
    <div className="tree-view">
      {data.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
