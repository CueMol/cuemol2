/**
 * @file panes/Ccp4MapOptionsPane.tsx
 * @description Option pane for CCP4/MRC electron density map files.
 */

import React from 'react';
import { Switch, NumericInput, FormGroup, Divider } from '@blueprintjs/core';
import type { Ccp4MapOptions } from '../types';

interface Ccp4MapOptionsPaneProps {
  options: Ccp4MapOptions;
  onChange: (updated: Ccp4MapOptions) => void;
}

export const Ccp4MapOptionsPane: React.FC<Ccp4MapOptionsPaneProps> = ({ options, onChange }) => {
  const setNum = (key: keyof Pick<Ccp4MapOptions, 'truncateMin' | 'truncateMax'>) =>
    (val: number) => {
      if (!isNaN(val)) onChange({ ...options, [key]: val });
    };

  return (
    <div className="fod-section">
      <div className="fod-section-title">Density Map Options</div>
      <Switch
        label="Normalize by mean/sigma"
        checked={options.normalize}
        onChange={(e) => onChange({ ...options, normalize: e.target.checked })}
        className="fod-switch"
      />
      <Divider />
      <div className="fod-section-title">Truncation (sigma)</div>
      <FormGroup label="Minimum" labelFor="ccp4-min" className="fod-form-group">
        <NumericInput
          id="ccp4-min"
          value={options.truncateMin}
          onValueChange={setNum('truncateMin')}
          stepSize={0.5}
          minorStepSize={0.1}
          fill
        />
      </FormGroup>
      <FormGroup label="Maximum" labelFor="ccp4-max" className="fod-form-group">
        <NumericInput
          id="ccp4-max"
          value={options.truncateMax}
          onValueChange={setNum('truncateMax')}
          stepSize={0.5}
          minorStepSize={0.1}
          fill
        />
      </FormGroup>
    </div>
  );
};
