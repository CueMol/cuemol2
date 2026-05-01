/**
 * @file components/inspector/PropertiesTab.tsx
 * @description Properties tab for the inspector panel.
 *
 * Groups renderer properties into collapsible accordion sections and
 * renders the appropriate editor widget for each property based on its
 * `type` field.  The accordion ordering is driven by `PROPERTY_GROUPS`.
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
import { PROPERTY_GROUPS } from "../../data/rendererProperties";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface PropertiesTabProps {
  properties: PropDef[];
  onChange: (key: string, value: string | number | boolean) => void;
}

// ────────────────────────────────────────────────────────────
// Editor dispatcher
// ────────────────────────────────────────────────────────────

const renderEditor = (
  prop: PropDef,
  onChange: (key: string, value: string | number | boolean) => void
) => {
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

export const PropertiesTab: React.FC<PropertiesTabProps> = ({
  properties,
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
    <div className="insp-properties-tab">
      {PROPERTY_GROUPS.map((grp) => {
        const props = grouped.get(grp.key);
        if (!props || props.length === 0) return null;
        return (
          <AccordionSection
            key={grp.key}
            title={grp.key}
            defaultExpanded={grp.defaultExpanded}
          >
            {props.map((prop) => renderEditor(prop, onChange))}
          </AccordionSection>
        );
      })}
    </div>
  );
};
