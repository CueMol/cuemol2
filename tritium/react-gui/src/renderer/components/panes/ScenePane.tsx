/**
 * @file ScenePane.tsx
 * @description Hierarchical scene tree pane for object and renderer management.
 *
 * Displays a tree view of scene objects (top level) and their child renderers.
 * Users can select nodes, toggle visibility, and trigger property editing.
 *
 * This pane is one of the components within the ExplorerView.
 *
 * @module ScenePane
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Icon,
  Tree,
  Button,
  ButtonGroup,
  Tooltip,
  type IconName,
  type TreeNodeInfo,
} from "@blueprintjs/core";

/* ─── Types ─── */

export interface SceneRendererNode {
  id: string;
  label: string;
  icon: IconName;
  visible: boolean;
}

export interface SceneObjectNode {
  id: string;
  label: string;
  icon: IconName;
  visible: boolean;
  children: SceneRendererNode[];
}

export interface SceneNode {
  id: string;
  label: string;
  icon: IconName;
  objects: SceneObjectNode[];
}

/* ─── ScenePane ─── */

interface ScenePaneProps {
  scene: SceneNode;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onAddObject?: () => void;
  onAddRenderer?: () => void;
  onDeleteSelected?: (id: string) => void;
  onFocusSelected?: (id: string) => void;
  onShowProperty?: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ScenePane: React.FC<ScenePaneProps> = ({
  scene,
  selectedId,
  onSelect,
  onToggleVisibility,
  onAddObject,
  onAddRenderer,
  onDeleteSelected,
  onFocusSelected,
  onShowProperty,
  collapsed,
  onToggleCollapse,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(scene.objects.map((o) => o.id))
  );

  const handleNodeExpand = useCallback((node: TreeNodeInfo) => {
    setExpandedIds((prev) => new Set(prev).add(String(node.id)));
  }, []);

  const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(String(node.id));
      return next;
    });
  }, []);

  const handleNodeClick = useCallback(
    (node: TreeNodeInfo) => {
      onSelect(String(node.id));
    },
    [onSelect]
  );

  const visibilityButton = useCallback(
    (nodeId: string, visible: boolean) => (
      <Button
        minimal
        small
        icon={<Icon icon={visible ? "eye-open" : "eye-off"} size={14} />}
        className={`visibility-toggle ${visible ? "visible" : "hidden"}`}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onToggleVisibility(nodeId);
        }}
      />
    ),
    [onToggleVisibility]
  );

  const treeContents: TreeNodeInfo[] = useMemo(() => {
    return scene.objects.map((obj) => ({
      id: obj.id,
      label: obj.label,
      icon: obj.icon,
      isExpanded: expandedIds.has(obj.id),
      isSelected: selectedId === obj.id,
      secondaryLabel: visibilityButton(obj.id, obj.visible),
      childNodes: obj.children.map((rend) => ({
        id: rend.id,
        label: rend.label,
        icon: rend.icon as IconName,
        isSelected: selectedId === rend.id,
        secondaryLabel: visibilityButton(rend.id, rend.visible),
      })),
    }));
  }, [scene, expandedIds, selectedId, visibilityButton]);

  return (
    <div className="sp-pane">
      <div
        className={`sp-section-header ${onToggleCollapse ? "collapsible" : ""}`}
        onClick={onToggleCollapse}
      >
        <div className="sp-section-header-left">
          <Icon
            icon={collapsed ? "chevron-right" : "chevron-down"}
            size={12}
            className="section-chevron"
          />
          <span className="section-title scene-name-title">{scene.label}</span>
        </div>
        <div
          className="sp-section-header-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <ButtonGroup minimal>
            <Tooltip content="Add Object" placement="bottom" compact>
              <Button
                minimal
                small
                icon={<Icon icon="cube-add" size={14} />}
                className="section-action-btn"
                onClick={onAddObject}
              />
            </Tooltip>
            <Tooltip content="Add Renderer" placement="bottom" compact>
              <Button
                minimal
                small
                icon={<Icon icon="style" size={14} />}
                className="section-action-btn"
                onClick={onAddRenderer}
              />
            </Tooltip>
            <Tooltip content="Focus" placement="bottom" compact>
              <Button
                minimal
                small
                icon={<Icon icon="locate" size={14} />}
                className="section-action-btn"
                onClick={() => selectedId && onFocusSelected?.(selectedId)}
              />
            </Tooltip>
            <Tooltip content="Property" placement="bottom" compact>
              <Button
                minimal
                small
                icon={<Icon icon="properties" size={14} />}
                className="section-action-btn"
                onClick={() => selectedId && onShowProperty?.(selectedId)}
              />
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>
      {!collapsed && (
        <div className="sp-pane-scroll">
          <Tree
            contents={treeContents}
            onNodeClick={handleNodeClick}
            onNodeExpand={handleNodeExpand}
            onNodeCollapse={handleNodeCollapse}
            className="scene-tree"
          />
        </div>
      )}
    </div>
  );
};
