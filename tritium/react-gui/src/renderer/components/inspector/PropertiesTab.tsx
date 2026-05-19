/**
 * @file components/inspector/PropertiesTab.tsx
 * @description Properties tab for the inspector panel.
 *
 * Groups renderer properties into collapsible accordion sections via
 * `PropGroupedEditor`. The accordion ordering is driven by `PROPERTY_GROUPS`.
 */

import React from "react";
import { PropGroupedEditor } from "./PropGroupedEditor";
import type { PropDef } from "../../data/rendererProperties";
import { PROPERTY_GROUPS } from "../../data/rendererProperties";

interface PropertiesTabProps {
  properties: PropDef[];
  onChange: (key: string, value: string | number | boolean) => void;
}

export const PropertiesTab: React.FC<PropertiesTabProps> = ({
  properties,
  onChange,
}) => (
  <div className="insp-properties-tab">
    <PropGroupedEditor
      properties={properties}
      groups={PROPERTY_GROUPS}
      onChange={onChange}
    />
  </div>
);
