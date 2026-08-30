import React from "react";
import { AppIcon } from "@renderer/h3-kit/primitives";
import type { AppIconKey } from "@renderer/h3-kit/primitives";

interface SectionHeaderProps {
  title: string;
  /**
   * Leading section icon. Optional: panes such as ScenePane render only a
   * chevron + title with no section glyph, so they omit this.
   */
  icon?: AppIconKey;
  actions?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * Render the chevron even when `onToggleCollapse` is not provided. Default
   * behaviour gates the chevron on `onToggleCollapse` being present; ScenePane
   * shows the chevron unconditionally and opts in via this flag.
   */
  alwaysShowChevron?: boolean;
  /**
   * Extra class appended to the title span (e.g. ScenePane's
   * `scene-name-title`). The base `section-title` class is always present.
   */
  titleClassName?: string;
}

export const PaneSectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  actions,
  collapsed,
  onToggleCollapse,
  alwaysShowChevron,
  titleClassName,
}) => {
  const showChevron = alwaysShowChevron || onToggleCollapse != null;
  return (
    <div
      className={`sp-section-header ${onToggleCollapse ? "collapsible" : ""}`}
      onClick={onToggleCollapse}
    >
      <div className="sp-section-header-left">
        {showChevron && (
          <AppIcon
            name={collapsed ? "ui.caretRight" : "ui.caretDown"}
            size="sm"
            className="section-chevron"
            aria-hidden
          />
        )}
        {icon != null && (
          <AppIcon name={icon} size="md" className="section-icon" aria-hidden />
        )}
        <span className={`section-title${titleClassName ? ` ${titleClassName}` : ""}`}>
          {title}
        </span>
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
};
