/**
 * @file panes/MtzOptionsPane.tsx
 * @description Option pane for MTZ reflection data files. Mirrors the UXP
 * fopen-mtzopt-page: amplitude / phase / weight columns are chosen from
 * dropdowns populated by the actual column labels in the file, phase and
 * weight are each gated by a checkbox (disabled when the file has no column
 * of that type), and resolution / grid spacing follow the UXP controls.
 */

import React, { useState } from 'react';
import { Checkbox, HTMLSelect, NumericInput, FormGroup } from '@blueprintjs/core';
import type { MtzOptions } from '../types';
import type { GetMtzColumnInfoResult } from '../../../worker/server/services/getMtzColumnInfo.service';

interface MtzOptionsPaneProps {
  options: MtzOptions;
  onChange: (updated: MtzOptions) => void;
  /** Column info read from the file; null while the header is being read. */
  columnInfo: GetMtzColumnInfoResult | null;
}

// UXP grid-spacing presets (fopen-mtzopt-page.xul).
const GRID_PRESETS = [
  { label: 'Fine (0.25)', value: 0.25 },
  { label: 'Coarse (0.33)', value: 0.333333 },
];

// UXP's resolution textbox uses decimalplaces="1" / increment="0.1", so every
// shown value and bound is rounded to a single decimal place. Match that here
// rather than exposing the reader's raw shell limit (e.g. 1.69923983).
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export const MtzOptionsPane: React.FC<MtzOptionsPaneProps> = ({ options, onChange, columnInfo }) => {
  // Raw text held while the resolution field is being edited. Blueprint's
  // NumericInput is fully controlled once `value` is set, so without this an
  // empty / transiently-invalid keystroke has no onValueChange to move
  // `value`, and the field immediately snaps back to the last digit instead
  // of letting the user clear it. Mirrors the fix applied to the h3-kit
  // NumericField.
  const [resoEdit, setResoEdit] = useState<string | null>(null);

  if (!columnInfo || !columnInfo.ok) {
    return (
      <div className="fod-section">
        <div className="fod-section-title">Column Selection</div>
        <div className="fod-hint">Reading MTZ header...</div>
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

  const renderColumnSelect = (
    id: string,
    cols: string[],
    value: string,
    disabled: boolean,
    onSelect: (v: string) => void,
  ) => (
    <HTMLSelect
      id={id}
      className="h3-form-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onSelect(e.currentTarget.value)}
      fill
    >
      {cols.length === 0 && <option value="">(none)</option>}
      {cols.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </HTMLSelect>
  );

  return (
    <div className="fod-section">
      <div className="fod-section-title">Column Selection</div>

      <FormGroup label="Amplitude (F)" labelFor="mtz-col-f" className="fod-form-group">
        {renderColumnSelect('mtz-col-f', fCols, options.columnF, !hasF, (v) =>
          onChange({ ...options, columnF: v }),
        )}
      </FormGroup>

      <FormGroup className="fod-form-group">
        <Checkbox
          label="Phase"
          checked={options.phaseEnabled && hasP}
          disabled={!hasP}
          onChange={(e) => onChange({ ...options, phaseEnabled: e.currentTarget.checked })}
        />
        {renderColumnSelect('mtz-col-phi', pCols, options.columnPhi, !hasP || !options.phaseEnabled, (v) =>
          onChange({ ...options, columnPhi: v }),
        )}
      </FormGroup>

      <FormGroup className="fod-form-group">
        <Checkbox
          label="Weight"
          checked={options.weightEnabled && hasW}
          disabled={!hasW}
          onChange={(e) => onChange({ ...options, weightEnabled: e.currentTarget.checked })}
        />
        {renderColumnSelect('mtz-col-w', wCols, options.columnW, !hasW || !options.weightEnabled, (v) =>
          onChange({ ...options, columnW: v }),
        )}
      </FormGroup>

      <div className="fod-section-title" style={{ marginTop: 12 }}>Map Parameters</div>
      <FormGroup label="Max resolution (A)" labelFor="mtz-reso" className="fod-form-group">
        <NumericInput
          id="mtz-reso"
          value={resoEdit ?? String(options.resolutionLimit)}
          onValueChange={(val, s) => {
            setResoEdit(s);
            if (!isNaN(val)) onChange({ ...options, resolutionLimit: round1(val) });
          }}
          onBlur={() => setResoEdit(null)}
          min={resoMin > 0 ? resoMin : undefined}
          max={resoMax > 0 ? resoMax : undefined}
          stepSize={0.1}
          minorStepSize={null}
          majorStepSize={null}
          fill
        />
      </FormGroup>
      <FormGroup label="Grid spacing (A)" labelFor="mtz-grid" className="fod-form-group">
        <HTMLSelect
          id="mtz-grid"
          className="h3-form-select"
          value={options.gridSpacing}
          onChange={(e) => onChange({ ...options, gridSpacing: parseFloat(e.currentTarget.value) })}
          fill
        >
          {GRID_PRESETS.map((p) => (
            <option key={p.label} value={p.value}>{p.label}</option>
          ))}
        </HTMLSelect>
      </FormGroup>
    </div>
  );
};
