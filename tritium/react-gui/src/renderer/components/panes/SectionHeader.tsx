import React from "react";
import { AppIcon } from "../AppIcon";
import type { AppIconKey } from "../../data/appIcons";

interface SectionHeaderProps {
  title: string;
  icon: AppIconKey;
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
        <AppIcon
          name={collapsed ? "ui.caretRight" : "ui.caretDown"}
          size="sm"
          className="section-chevron"
          aria-hidden
        />
      )}
      <AppIcon name={icon} size="md" className="section-icon" aria-hidden />
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
