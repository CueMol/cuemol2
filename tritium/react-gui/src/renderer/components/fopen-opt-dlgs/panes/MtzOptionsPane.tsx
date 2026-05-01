/**
 * @file panes/MtzOptionsPane.tsx
 * @description Option pane for MTZ reflection data files.
 */

import React from 'react';
import { InputGroup, NumericInput, FormGroup } from '@blueprintjs/core';
import type { MtzOptions } from '../types';

interface MtzOptionsPaneProps {
  options: MtzOptions;
  onChange: (updated: MtzOptions) => void;
}

export const MtzOptionsPane: React.FC<MtzOptionsPaneProps> = ({ options, onChange }) => {
  const setStr = (key: keyof Pick<MtzOptions, 'columnF' | 'columnPhi' | 'columnW'>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...options, [key]: e.target.value });
    };

  const setNum = (key: keyof Pick<MtzOptions, 'resolutionLimit' | 'gridSpacing'>) =>
    (val: number) => {
      if (!isNaN(val)) onChange({ ...options, [key]: val });
    };

  return (
    <div className="fod-section">
      <div className="fod-section-title">Column Selection</div>
      <FormGroup label="Amplitude (F)" labelFor="mtz-col-f" className="fod-form-group">
        <InputGroup
          id="mtz-col-f"
          placeholder="e.g. 2FOFCWT"
          value={options.columnF}
          onChange={setStr('columnF')}
        />
      </FormGroup>
      <FormGroup label="Phase (PHI)" labelFor="mtz-col-phi" className="fod-form-group">
        <InputGroup
          id="mtz-col-phi"
          placeholder="e.g. PH2FOFCWT"
          value={options.columnPhi}
          onChange={setStr('columnPhi')}
        />
      </FormGroup>
      <FormGroup label="Weight (WT)" labelFor="mtz-col-w" className="fod-form-group">
        <InputGroup
          id="mtz-col-w"
          placeholder="e.g. FOM"
          value={options.columnW}
          onChange={setStr('columnW')}
        />
      </FormGroup>
      <div className="fod-section-title" style={{ marginTop: 12 }}>Map Parameters</div>
      <FormGroup label="Resolution limit (A)" labelFor="mtz-reso" className="fod-form-group">
        <NumericInput
          id="mtz-reso"
          placeholder="0 = no limit"
          value={options.resolutionLimit}
          onValueChange={setNum('resolutionLimit')}
          min={0}
          stepSize={0.1}
          minorStepSize={0.01}
          fill
        />
      </FormGroup>
      <FormGroup label="Grid spacing (A)" labelFor="mtz-grid" className="fod-form-group">
        <NumericInput
          id="mtz-grid"
          value={options.gridSpacing}
          onValueChange={setNum('gridSpacing')}
          min={0.1}
          max={1.0}
          stepSize={0.01}
          minorStepSize={0.001}
          fill
        />
      </FormGroup>
    </div>
  );
};
