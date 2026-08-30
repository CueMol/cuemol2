/**
 * @file dialogs/fopen-opt-dlgs/panes/MsmsOptionsPane.tsx
 * @description Option pane for MSMS molecular surface files.
 */

import React from 'react';
import { Field, FieldSection, TextField } from '@renderer/h3-kit/form';
import type { MsmsOptions } from '@renderer/dialogs/fopen-opt-dlgs/types';

interface MsmsOptionsPaneProps {
  options: MsmsOptions;
  onChange: (updated: MsmsOptions) => void;
}

export const MsmsOptionsPane: React.FC<MsmsOptionsPaneProps> = ({ options, onChange }) => (
  <div className="fod-section">
    <FieldSection title="Surface Options">
      <Field label="Companion vertex (.vert) file path">
        <TextField
          value={options.vertFilePath}
          placeholder="/path/to/surface.vert"
          onChange={(v) => onChange({ vertFilePath: v })}
        />
      </Field>
      <div className="fod-hint">Required for face-based surface rendering</div>
    </FieldSection>
  </div>
);
