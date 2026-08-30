/**
 * @file components/inspector/AccordionSection.tsx
 * @description Collapsible accordion section for the inspector panel.
 *
 * Renders a clickable header with a chevron indicator and a collapsible body.
 * Used by the Properties tab to group related renderer properties into logical
 * sections.
 *
 * By default each section keeps its own open/closed state (independent
 * accordions). When wrapped in an `AccordionGroup`, the contained sections
 * become mutually exclusive: opening one closes the others, so at most one is
 * expanded at a time (used by the Properties tab, whose per-renderer pages can
 * be very long). Sections are identified within a group by their `title`, which
 * is unique per tab.
 */

import React, { createContext, useContext, useMemo, useState } from "react";
import { AppIcon } from "@renderer/h3-kit/primitives";

interface AccordionGroupValue {
  /** Title of the currently open section, or null when all are collapsed. */
  openId: string | null;
  /** Toggle a section: open it (closing others) or collapse it if already open. */
  toggle: (id: string) => void;
}

const AccordionGroupContext = createContext<AccordionGroupValue | null>(null);

interface AccordionGroupProps {
  /** Title of the section open on first render (null = all collapsed). */
  initialOpen?: string | null;
  children: React.ReactNode;
}

/**
 * Makes the `AccordionSection`s rendered inside it mutually exclusive: only one
 * may be expanded at a time. Sections outside a group remain independent.
 */
export const AccordionGroup: React.FC<AccordionGroupProps> = ({
  initialOpen = null,
  children,
}) => {
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const value = useMemo<AccordionGroupValue>(
    () => ({
      openId,
      toggle: (id) => setOpenId((prev) => (prev === id ? null : id)),
    }),
    [openId],
  );
  return (
    <AccordionGroupContext.Provider value={value}>
      {children}
    </AccordionGroupContext.Provider>
  );
};

interface AccordionSectionProps {
  /** Section title displayed in the header (also its identity within a group). */
  title: string;
  /** Whether the section starts expanded (ignored inside an `AccordionGroup`). */
  defaultExpanded?: boolean;
  /** Child elements rendered inside the collapsible body. */
  children: React.ReactNode;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  defaultExpanded = false,
  children,
}) => {
  const group = useContext(AccordionGroupContext);
  // Local state drives the standalone (ungrouped) case; inside a group the open
  // section is owned by the group so opening one collapses the rest.
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = group ? group.openId === title : localExpanded;
  const onToggle = () =>
    group ? group.toggle(title) : setLocalExpanded((prev) => !prev);

  return (
    <div className={`insp-accordion ${expanded ? "expanded" : ""}`}>
      <div className="insp-accordion-header" onClick={onToggle}>
        <AppIcon
          name={expanded ? "ui.caretDown" : "ui.caretRight"}
          size="sm"
          className="insp-accordion-chevron"
        />
        <span className="insp-accordion-title">{title}</span>
      </div>
      {expanded && <div className="insp-accordion-body">{children}</div>}
    </div>
  );
};
