/**
 * @file panes/NamdCoorOptionsPane.tsx
 * @description Option pane for NAMD binary coordinate files.
 */

import React from 'react';
import { InputGroup, FormGroup } from '@blueprintjs/core';
import type { NamdCoorOptions } from '../types';

interface NamdCoorOptionsPaneProps {
  options: NamdCoorOptions;
  onChange: (updated: NamdCoorOptions) => void;
}

export const NamdCoorOptionsPane: React.FC<NamdCoorOptionsPaneProps> = ({ options, onChange }) => (
  <div className="fod-section">
    <div className="fod-section-title">Topology</div>
    <FormGroup
      label="PSF topology file path"
      labelFor="namd-psf"
      helperText="Required to assign atom types and connectivity"
      className="fod-form-group"
    >
      <InputGroup
        id="namd-psf"
        placeholder="/path/to/topology.psf"
        value={options.psfFilePath}
        onChange={(e) => onChange({ psfFilePath: e.target.value })}
      />
    </FormGroup>
  </div>
);
