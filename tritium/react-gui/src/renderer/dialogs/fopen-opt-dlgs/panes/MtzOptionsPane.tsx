/**
 * @file dialogs/fopen-opt-dlgs/panes/MtzOptionsPane.tsx
 * @description Option pane for MTZ reflection files: which columns feed the
 * FFT (amplitude / phase / weight) and the map parameters.
 *
 * Built from the h3-kit form catalog. The Phase / Weight toggles GATE their
 * column selectors, so they are checkboxes (`Field inline controlFirst` +
 * `CheckboxField`); see the value / gate rule in
 * `docs/migration/ui-style-guide.md`.
 *
 * Column lists come from the MTZ header (`getMtzColumnInfo`); a column class
 * with no columns disables its row and shows "(none)".
 */

import React from 'react';
import {
  CheckboxField,
  Field,
  FieldSection,
  NumericField,
  SelectField,
} from '@renderer/h3-kit/form';
import type { MtzOptions } from '@renderer/dialogs/fopen-opt-dlgs/types';
import type { GetMtzColumnInfoResult } from '@renderer/worker/server/services/map/map.service';

interface MtzOptionsPaneProps {
  options: MtzOptions;
  onChange: (updated: MtzOptions) => void;
  columnInfo: GetMtzColumnInfoResult | null;
}

const GRID_PRESETS = [
  { label: 'Fine (0.20 A)', value: 0.2 },
  { label: 'Normal (0.25 A)', value: 0.25 },
  { label: 'Coarse (0.33 A)', value: 0.33 },
  { label: 'Very coarse (0.50 A)', value: 0.5 },
];

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export const MtzOptionsPane: React.FC<MtzOptionsPaneProps> = ({ options, onChange, columnInfo }) => {
  if (!columnInfo) {
    return (
      <div className="fod-section">
        <FieldSection title="Column Selection">
          <div className="fod-hint">Reading MTZ header...</div>
        </FieldSection>
      </div>
    );
  }

  if (!columnInfo.ok) {
    return (
      <div className="fod-section">
        <FieldSection title="Column Selection">
          <div className="fod-hint">Could not read the MTZ header.</div>
        </FieldSection>
      </div>
    );
  }

  const fCols = columnInfo.columns.filter((c) => c.type === 'F').map((c) => c.name);
  const pCols = columnInfo.columns.filter((c) => c.type === 'P').map((c) => c.name);
  const wCols = columnInfo.columns.filter((c) => c.type === 'W').map((c) => c.name);

  const hasF = fCols.length > 0;
  const hasP = pCols.length > 0;
  const hasW = wCols.length > 0;

  // Resolution textbox range mirrors UXP: min = highest-resolution shell
  // (maxRes, the smaller number), max = lowest-resolution shell (minRes).
  // Rounded to 1 decimal place like UXP's decimalplaces="1" widget.
  const resoMin = round1(columnInfo.maxRes);
  const resoMax = round1(columnInfo.minRes);

  const columnSelect = (
    cols: string[],
    value: string,
    disabled: boolean,
    onSelect: (v: string) => void,
  ) => (
    <SelectField value={value} disabled={disabled} onChange={onSelect}>
      {cols.length === 0 && <option value="">(none)</option>}
      {cols.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </SelectField>
  );

  return (
    <div className="fod-section">
      <FieldSection title="Column Selection">
        <Field label="Amplitude (F)">
          {columnSelect(fCols, options.columnF, !hasF, (v) => onChange({ ...options, columnF: v }))}
        </Field>

        <Field label="Phase" inline controlFirst>
          <CheckboxField
            checked={options.phaseEnabled && hasP}
            disabled={!hasP}
            onChange={(checked) => onChange({ ...options, phaseEnabled: checked })}
          />
        </Field>
        <Field label="Phase column">
          {columnSelect(pCols, options.columnPhi, !hasP || !options.phaseEnabled, (v) =>
            onChange({ ...options, columnPhi: v }),
          )}
        </Field>

        <Field label="Weight" inline controlFirst>
          <CheckboxField
            checked={options.weightEnabled && hasW}
            disabled={!hasW}
            onChange={(checked) => onChange({ ...options, weightEnabled: checked })}
          />
        </Field>
        <Field label="Weight column">
          {columnSelect(wCols, options.columnW, !hasW || !options.weightEnabled, (v) =>
            onChange({ ...options, columnW: v }),
          )}
        </Field>
      </FieldSection>

      <FieldSection title="Map Parameters">
        <Field label="Max resolution (A)">
          <NumericField
            slider={false}
            value={options.resolutionLimit}
            min={resoMin > 0 ? resoMin : undefined}
            max={resoMax > 0 ? resoMax : undefined}
            step={0.1}
            onChange={(v) => onChange({ ...options, resolutionLimit: round1(v) })}
          />
        </Field>
        <Field label="Grid spacing (A)">
          <SelectField
            value={String(options.gridSpacing)}
            onChange={(v) => onChange({ ...options, gridSpacing: parseFloat(v) })}
          >
            {GRID_PRESETS.map((p) => (
              <option key={p.label} value={p.value}>{p.label}</option>
            ))}
          </SelectField>
        </Field>
      </FieldSection>
    </div>
  );
};
