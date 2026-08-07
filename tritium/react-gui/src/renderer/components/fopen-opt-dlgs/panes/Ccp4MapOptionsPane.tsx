/**
 * @file panes/Ccp4MapOptionsPane.tsx
 * @description Option pane for CCP4/MRC electron density map files.
 */

import React, { useState } from 'react';
import { Switch, NumericInput, FormGroup, Divider } from '@blueprintjs/core';
import type { Ccp4MapOptions } from '../types';

interface Ccp4MapOptionsPaneProps {
  options: Ccp4MapOptions;
  onChange: (updated: Ccp4MapOptions) => void;
}

type TruncateKey = 'truncateMin' | 'truncateMax';

export const Ccp4MapOptionsPane: React.FC<Ccp4MapOptionsPaneProps> = ({ options, onChange }) => {
  // Raw text held per-field while it is being edited. Blueprint's
  // NumericInput is fully controlled once `value` is set, so without this an
  // empty / transiently-invalid keystroke has no onValueChange to move
  // `value`, and the field immediately snaps back to the last digit instead
  // of letting the user clear it. Mirrors the fix applied to the h3-kit
  // NumericField.
  const [editing, setEditing] = useState<Partial<Record<TruncateKey, string>>>({});
  const clearEditing = (key: TruncateKey) =>
    setEditing((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const setNum = (key: TruncateKey) =>
    (val: number, s: string) => {
      setEditing((prev) => ({ ...prev, [key]: s }));
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
      <Switch
        label="Truncate minimum"
        checked={options.truncateMinEnabled}
        onChange={(e) => onChange({ ...options, truncateMinEnabled: e.target.checked })}
        className="fod-switch"
      />
      <FormGroup label="Minimum" labelFor="ccp4-min" className="fod-form-group">
        <NumericInput
          id="ccp4-min"
          value={editing.truncateMin ?? String(options.truncateMin)}
          onValueChange={setNum('truncateMin')}
          onBlur={() => clearEditing('truncateMin')}
          disabled={!options.truncateMinEnabled}
          stepSize={0.5}
          minorStepSize={0.1}
          fill
        />
      </FormGroup>
      <Switch
        label="Truncate maximum"
        checked={options.truncateMaxEnabled}
        onChange={(e) => onChange({ ...options, truncateMaxEnabled: e.target.checked })}
        className="fod-switch"
      />
      <FormGroup label="Maximum" labelFor="ccp4-max" className="fod-form-group">
        <NumericInput
          id="ccp4-max"
          value={editing.truncateMax ?? String(options.truncateMax)}
          onValueChange={setNum('truncateMax')}
          onBlur={() => clearEditing('truncateMax')}
          disabled={!options.truncateMaxEnabled}
          stepSize={0.5}
          minorStepSize={0.1}
          fill
        />
      </FormGroup>
    </div>
  );
};
