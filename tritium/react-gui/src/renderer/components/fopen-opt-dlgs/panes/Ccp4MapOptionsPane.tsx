/**
 * @file panes/Ccp4MapOptionsPane.tsx
 * @description Option pane for CCP4/MRC electron density map files.
 *
 * Besides the UXP-era normalize / truncation switches it carries the cryo-EM
 * map mode controls (see docs/architecture/cryo-em-map-mode.md): the map kind
 * override ("Map type": auto / crystallographic / cryo-EM, applied to the
 * loaded DensityMap's `map_type`) and the reader's `subsample`. When the
 * dialog probed the file header (`probe`), the pane shows the grid size and
 * warns about a very large map, suggesting a subsample that keeps the stored
 * voxel count under the large-map threshold.
 *
 * Toggle kinds follow the value / gate rule of
 * `docs/migration/ui-style-guide.md`: "Normalize" is a value (Switch), while
 * the two truncation toggles gate the numeric fields below them and are
 * therefore Checkboxes.
 */

import React, { useState } from 'react';
import { Switch, Checkbox, NumericInput, FormGroup, Divider, HTMLSelect, Callout } from '@blueprintjs/core';
import type { Ccp4MapOptions, MapTypeChoice } from '../types';
import type { MapHeaderInfo } from '../../../worker/server/services/probeMapHeader.service';
import { LARGE_MAP_VOXELS, suggestSubsample } from '../../../worker/server/services/probeMapHeader.service';

interface Ccp4MapOptionsPaneProps {
  options: Ccp4MapOptions;
  onChange: (updated: Ccp4MapOptions) => void;
  /** Header probe of the file being opened (null while unknown / unavailable). */
  probe?: MapHeaderInfo | null;
}

type TruncateKey = 'truncateMin' | 'truncateMax';

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

  const sub = Math.max(1, options.subsample);
  const storedVoxels = probe ? probe.nvoxels / (sub * sub * sub) : 0;
  const isLarge = !!probe && storedVoxels > LARGE_MAP_VOXELS;
  const suggested = probe ? suggestSubsample(probe.nvoxels) : 1;

  return (
    <div className="fod-section">
      <div className="fod-section-title">Density Map Options</div>
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
      <FormGroup label="Map type" labelFor="ccp4-map-type" className="fod-form-group">
        <HTMLSelect
          id="ccp4-map-type"
          value={options.mapType}
          onChange={(e) => onChange({ ...options, mapType: e.currentTarget.value as MapTypeChoice })}
          options={MAP_TYPE_CHOICES}
          fill
        />
      </FormGroup>
      <FormGroup label="Subsample" labelFor="ccp4-subsample" className="fod-form-group">
        <HTMLSelect
          id="ccp4-subsample"
          value={String(sub)}
          onChange={(e) => onChange({ ...options, subsample: Number(e.currentTarget.value) })}
          options={SUBSAMPLE_CHOICES.map((n) => ({
            value: String(n),
            label: n === 1 ? '1 (full grid)' : `${n} (every ${n}th grid point)`,
          }))}
          fill
        />
      </FormGroup>
      <Divider />
      <Switch
        label="Normalize by mean/sigma"
        checked={options.normalize}
        onChange={(e) => onChange({ ...options, normalize: e.target.checked })}
        className="fod-switch"
      />
      <Divider />
      <div className="fod-section-title">Truncation (sigma)</div>
      {/* Gate for the Minimum field below -> Checkbox, not Switch
        * (ui-style-guide.md: value = switch, opt-in gate = checkbox). */}
      <Checkbox
        label="Truncate minimum"
        checked={options.truncateMinEnabled}
        onChange={(e) => onChange({ ...options, truncateMinEnabled: e.currentTarget.checked })}
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
      {/* Gate for the Maximum field below (see above) */}
      <Checkbox
        label="Truncate maximum"
        checked={options.truncateMaxEnabled}
        onChange={(e) => onChange({ ...options, truncateMaxEnabled: e.currentTarget.checked })}
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
