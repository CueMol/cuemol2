/**
 * @file panes/PdbOptionsPane.tsx
 * @description Option pane for PDB and mmCIF file formats.
 */

import React from 'react';
import { Switch, Divider } from '@blueprintjs/core';
import type { PdbOptions } from '../types';

interface PdbOptionsPaneProps {
  options: PdbOptions;
  onChange: (updated: PdbOptions) => void;
}

export const PdbOptionsPane: React.FC<PdbOptionsPaneProps> = ({ options, onChange }) => {
  const set = (key: keyof PdbOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...options, [key]: e.target.checked });
  };

  return (
    <div className="fod-section">
      <div className="fod-section-title">Structure Options</div>
      <Switch
        label="Load MODEL records"
        checked={options.loadModel}
        onChange={set('loadModel')}
        className="fod-switch"
      />
      <Switch
        label="Load anisotropic U (ANISOU)"
        checked={options.loadAnisou}
        onChange={set('loadAnisou')}
        className="fod-switch"
      />
      <Switch
        label="Load alternate conformations"
        checked={options.loadAltConf}
        onChange={set('loadAltConf')}
        className="fod-switch"
      />
      <Switch
        label="Use SEGID as chain ID"
        checked={options.loadSegid}
        onChange={set('loadSegid')}
        className="fod-switch"
      />
      <Divider />
      <Switch
        label="Calculate secondary structure"
        checked={options.build2ndry}
        onChange={set('build2ndry')}
        className="fod-switch"
      />
      <Switch
        label="Auto-generate topology"
        checked={options.autoTopology}
        onChange={set('autoTopology')}
        className="fod-switch"
      />
    </div>
  );
};
