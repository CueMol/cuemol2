/**
 * @file panes/PdbOptionsPane.tsx
 * @description Option pane for PDB and mmCIF file formats.
 *
 * Built from the h3-kit form catalog (`Field` + `SwitchField`): every toggle
 * here is a value in its own right, not a gate for another control, so they
 * are switches (see the value / gate rule in
 * `docs/migration/ui-style-guide.md`).
 */

import React from 'react';
import { Divider } from '@blueprintjs/core';
import { Field, FieldSection, SwitchField } from '../../../h3-kit/form';
import type { PdbOptions } from '../types';

interface PdbOptionsPaneProps {
  options: PdbOptions;
  onChange: (updated: PdbOptions) => void;
}

export const PdbOptionsPane: React.FC<PdbOptionsPaneProps> = ({ options, onChange }) => {
  const set = (key: keyof PdbOptions) => (checked: boolean) => {
    onChange({ ...options, [key]: checked });
  };

  return (
    <div className="fod-section">
      <FieldSection title="Structure Options">
        <Field label="Load MODEL records" inline>
          <SwitchField checked={options.loadModel} onChange={set('loadModel')} />
        </Field>
        <Field label="Load anisotropic U (ANISOU)" inline>
          <SwitchField checked={options.loadAnisou} onChange={set('loadAnisou')} />
        </Field>
        <Field label="Load alternate conformations" inline>
          <SwitchField checked={options.loadAltConf} onChange={set('loadAltConf')} />
        </Field>
        <Field label="Use SEGID as chain ID" inline>
          <SwitchField checked={options.loadSegid} onChange={set('loadSegid')} />
        </Field>
        <Divider />
        <Field label="Calculate secondary structure" inline>
          <SwitchField checked={options.build2ndry} onChange={set('build2ndry')} />
        </Field>
        <Field label="Auto-generate topology" inline>
          <SwitchField checked={options.autoTopology} onChange={set('autoTopology')} />
        </Field>
      </FieldSection>
    </div>
  );
};
