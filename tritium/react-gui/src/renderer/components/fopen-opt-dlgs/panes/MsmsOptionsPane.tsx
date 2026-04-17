/**
 * @file panes/MsmsOptionsPane.tsx
 * @description Option pane for MSMS molecular surface files.
 */

import React from 'react';
import { InputGroup, FormGroup } from '@blueprintjs/core';
import type { MsmsOptions } from '../types';

interface MsmsOptionsPaneProps {
  options: MsmsOptions;
  onChange: (updated: MsmsOptions) => void;
}

export const MsmsOptionsPane: React.FC<MsmsOptionsPaneProps> = ({ options, onChange }) => (
  <div className="fod-section">
    <div className="fod-section-title">Surface Options</div>
    <FormGroup
      label="Companion vertex (.vert) file path"
      labelFor="msms-vert"
      helperText="Required for face-based surface rendering"
      className="fod-form-group"
    >
      <InputGroup
        id="msms-vert"
        placeholder="/path/to/surface.vert"
        value={options.vertFilePath}
        onChange={(e) => onChange({ vertFilePath: e.target.value })}
      />
    </FormGroup>
  </div>
);
