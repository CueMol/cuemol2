/**
 * @file panes/Ccp4MapOptionsPane.tsx
 * @description Option pane for CCP4/MRC electron density map files.
 *
 * Besides the UXP-era normalize / truncation options it carries the cryo-EM
 * map mode controls (see docs/architecture/cryo-em-map-mode.md): the map kind
 * override ("Map type": auto / crystallographic / cryo-EM, applied to the
 * loaded DensityMap's `map_type`) and the reader's `subsample`. When the
 * dialog probed the file header (`probe`), the pane shows the grid size and
 * warns about a very large map, suggesting a subsample that keeps the stored
 * voxel count under the large-map threshold.
 *
 * Built from the h3-kit form catalog. Toggle kinds follow the value / gate
 * rule of `docs/migration/ui-style-guide.md`: "Normalize" is a value
 * (`SwitchField`), while the two truncation toggles gate the numeric fields
 * below them (`CheckboxField` in a `controlFirst` row).
 */

import React from 'react';
import { Callout } from '@blueprintjs/core';
import {
  CheckboxField,
  Field,
  FieldSection,
  NumericField,
  SelectField,
  SwitchField,
} from '../../../h3-kit/form';
import type { Ccp4MapOptions, MapTypeChoice } from '../types';
import type { MapHeaderInfo } from '../../../worker/server/services/probeMapHeader.service';
import { LARGE_MAP_VOXELS, suggestSubsample } from '../../../worker/server/services/probeMapHeader.service';

interface Ccp4MapOptionsPaneProps {
  options: Ccp4MapOptions;
  onChange: (updated: Ccp4MapOptions) => void;
  /** Header probe of the file being opened (null while unknown / unavailable). */
  probe?: MapHeaderInfo | null;
}

const MAP_TYPE_CHOICES: { value: MapTypeChoice; label: string }[] = [
  { value: 'auto', label: 'Auto (from header)' },
  { value: 'xtal', label: 'Crystallographic (periodic)' },
  { value: 'em', label: 'Cryo-EM (whole map, level of detail)' },
];

const SUBSAMPLE_CHOICES = [1, 2, 4, 8];

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export const Ccp4MapOptionsPane: React.FC<Ccp4MapOptionsPaneProps> = ({ options, onChange, probe }) => {
  const sub = Math.max(1, options.subsample);
  const storedVoxels = probe ? probe.nvoxels / (sub * sub * sub) : 0;
  const isLarge = !!probe && storedVoxels > LARGE_MAP_VOXELS;
  const suggested = probe ? suggestSubsample(probe.nvoxels) : 1;

  return (
    <div className="fod-section">
      <FieldSection title="Density Map Options">
        {probe && (
          <div className="fod-hint" data-testid="ccp4-probe">
            {`Grid ${probe.nc} x ${probe.nr} x ${probe.ns} (${(probe.nvoxels / 1e6).toFixed(1)} Mvoxel, `}
            {`${formatMB(storedVoxels)} in memory at subsample ${sub})`}
          </div>
        )}
        {isLarge && (
          <Callout intent="warning" compact data-testid="ccp4-large-warning">
            {`Large map: ${formatMB(storedVoxels)} of samples will be kept in memory. `}
            {suggested > sub
              ? `Subsample ${suggested} keeps it under ${formatMB(LARGE_MAP_VOXELS)}.`
              : 'Opening may take a while.'}
          </Callout>
        )}
        <Field label="Map type">
          <SelectField
            value={options.mapType}
            onChange={(v) => onChange({ ...options, mapType: v as MapTypeChoice })}
          >
            {MAP_TYPE_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </SelectField>
        </Field>
        <Field label="Subsample">
          <SelectField
            value={String(sub)}
            onChange={(v) => onChange({ ...options, subsample: Number(v) })}
          >
            {SUBSAMPLE_CHOICES.map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? '1 (full grid)' : `${n} (every ${n}th grid point)`}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Normalize by mean/sigma" inline>
          <SwitchField
            checked={options.normalize}
            onChange={(checked) => onChange({ ...options, normalize: checked })}
          />
        </Field>
      </FieldSection>

      <FieldSection title="Truncation (sigma)">
        <Field label="Truncate minimum" inline controlFirst>
          <CheckboxField
            checked={options.truncateMinEnabled}
            onChange={(checked) => onChange({ ...options, truncateMinEnabled: checked })}
          />
        </Field>
        <Field label="Minimum">
          <NumericField
            slider={false}
            value={options.truncateMin}
            step={0.5}
            disabled={!options.truncateMinEnabled}
            onChange={(v) => onChange({ ...options, truncateMin: v })}
          />
        </Field>
        <Field label="Truncate maximum" inline controlFirst>
          <CheckboxField
            checked={options.truncateMaxEnabled}
            onChange={(checked) => onChange({ ...options, truncateMaxEnabled: checked })}
          />
        </Field>
        <Field label="Maximum">
          <NumericField
            slider={false}
            value={options.truncateMax}
            step={0.5}
            disabled={!options.truncateMaxEnabled}
            onChange={(v) => onChange({ ...options, truncateMax: v })}
          />
        </Field>
      </FieldSection>
    </div>
  );
};
