/**
 * @file components/inspector/AccordionSection.tsx
 * @description Collapsible accordion section for the inspector panel.
 *
 * Renders a clickable header with a chevron indicator and an animated
 * collapsible body.  Used by the Properties tab to group related
 * renderer properties into logical sections.
 */

import React, { useState } from "react";
import { Icon } from "@blueprintjs/core";

interface AccordionSectionProps {
  /** Section title displayed in the header. */
  title: string;
  /** Whether the section starts expanded. */
  defaultExpanded?: boolean;
  /** Child elements rendered inside the collapsible body. */
  children: React.ReactNode;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  defaultExpanded = false,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`insp-accordion ${expanded ? "expanded" : ""}`}>
      <div
        className="insp-accordion-header"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Icon
          icon={expanded ? "chevron-down" : "chevron-right"}
          size={12}
          className="insp-accordion-chevron"
        />
        <span className="insp-accordion-title">{title}</span>
      </div>
      {expanded && <div className="insp-accordion-body">{children}</div>}
    </div>
  );
};
