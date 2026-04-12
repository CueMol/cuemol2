import React from "react";
import { Icon, type IconName } from "@blueprintjs/core";

interface SectionHeaderProps {
  title: string;
  icon: IconName;
  actions?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  actions,
  collapsed,
  onToggleCollapse,
}) => (
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
      <Icon icon={icon} size={14} className="section-icon" />
      <span className="section-title">{title}</span>
    </div>
    {actions && (
      <div
        className="sp-section-header-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {actions}
      </div>
    )}
  </div>
);
