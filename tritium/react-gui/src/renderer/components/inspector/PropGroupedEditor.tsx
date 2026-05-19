/**
 * @file components/inspector/PropGroupedEditor.tsx
 * @description Reusable grouped property editor.
 *
 * Groups `PropDef` entries into collapsible accordion sections and renders
 * the editor widget appropriate to each property's `type`. The accordion
 * ordering is driven by the supplied `groups` list. Shared by the renderer
 * Properties tab and the Render Settings editor.
 */

import React, { useMemo } from "react";
import { AccordionSection } from "./AccordionSection";
import {
  StringEditor,
  NumericEditor,
  BooleanEditor,
  EnumEditor,
  ColorEditor,
} from "./PropEditors";
import type { PropDef } from "../../data/rendererProperties";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** An accordion group: display key plus default expanded state. */
export interface PropGroupDef {
  key: string;
  defaultExpanded?: boolean;
}

interface PropGroupedEditorProps {
  /** Property definitions to render, each tagged with a `group`. */
  properties: PropDef[];
  /** Accordion groups, in display order. */
  groups: PropGroupDef[];
  /** Called when a property value changes. */
  onChange: (key: string, value: string | number | boolean) => void;
}

// ────────────────────────────────────────────────────────────
// Editor dispatcher
// ────────────────────────────────────────────────────────────

/** Render the editor widget matching a property's `type`. */
export const renderPropEditor = (
  prop: PropDef,
  onChange: (key: string, value: string | number | boolean) => void,
): React.ReactNode => {
  switch (prop.type) {
    case "string":
      return <StringEditor key={prop.key} prop={prop} onChange={onChange} />;
    case "integer":
    case "real":
      return <NumericEditor key={prop.key} prop={prop} onChange={onChange} />;
    case "boolean":
      return <BooleanEditor key={prop.key} prop={prop} onChange={onChange} />;
    case "enum":
      return <EnumEditor key={prop.key} prop={prop} onChange={onChange} />;
    case "color":
      return <ColorEditor key={prop.key} prop={prop} onChange={onChange} />;
    default:
      return (
        <div key={prop.key} className="insp-prop-row">
          <span className="insp-prop-label">{prop.label}</span>
          <span className="insp-prop-control insp-prop-readonly">
            {String(prop.value)}
          </span>
        </div>
      );
  }
};

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const PropGroupedEditor: React.FC<PropGroupedEditorProps> = ({
  properties,
  groups,
  onChange,
}) => {
  /** Group properties by their `group` field. */
  const grouped = useMemo(() => {
    const map = new Map<string, PropDef[]>();
    for (const prop of properties) {
      const list = map.get(prop.group) ?? [];
      list.push(prop);
      map.set(prop.group, list);
    }
    return map;
  }, [properties]);

  return (
    <>
      {groups.map((grp) => {
        const props = grouped.get(grp.key);
        if (!props || props.length === 0) return null;
        return (
          <AccordionSection
            key={grp.key}
            title={grp.key}
            defaultExpanded={grp.defaultExpanded}
          >
            {props.map((prop) => renderPropEditor(prop, onChange))}
          </AccordionSection>
        );
      })}
    </>
  );
};
