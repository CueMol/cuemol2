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
  ComboEditor,
  ColorEditor,
} from "./PropEditors";
import type { PropDef } from "../../data/rendererProperties";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

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
  /**
   * Extra content rendered at the top of a group's body, above its props,
   * keyed by group key. Used to place a control (e.g. the image-size preset)
   * inside the group it belongs to rather than in a separate bar.
   */
  groupLeadContent?: Record<string, React.ReactNode>;
}

// ------------------------------------------------------------
// Editor dispatcher
// ------------------------------------------------------------

/**
 * Render the editor widget matching a property's `type`.
 *
 * Only the scalar `PropType` values are reachable here: the sole consumer
 * (`RenderSettingsEditor` via `data/renderSettings.ts`) emits string /
 * integer / real / boolean / enum / combo / color props. The `"object"`
 * member of `PropType` has no data path into this editor, so the default
 * branch is an unreachable fallback that simply renders nothing.
 *
 * @param prop - The property descriptor to render an editor for.
 * @param onChange - Invoked with (key, value) when the user edits the value.
 * @returns The editor element for the property's type, or undefined.
 */
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
    case "combo":
      return <ComboEditor key={prop.key} prop={prop} onChange={onChange} />;
    case "color":
      return <ColorEditor key={prop.key} prop={prop} onChange={onChange} />;
    default:
      return null;
  }
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export const PropGroupedEditor: React.FC<PropGroupedEditorProps> = ({
  properties,
  groups,
  onChange,
  groupLeadContent,
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
        const lead = groupLeadContent?.[grp.key];
        if ((!props || props.length === 0) && !lead) return null;
        return (
          <AccordionSection
            key={grp.key}
            title={grp.key}
            defaultExpanded={grp.defaultExpanded}
          >
            {lead}
            {props?.map((prop) => renderPropEditor(prop, onChange))}
          </AccordionSection>
        );
      })}
    </>
  );
};
