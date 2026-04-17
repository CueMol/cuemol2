/**
 * @file panes/RendererOptionsPane.tsx
 * @description Always-visible renderer options section of the file open dialog.
 *
 * Note: renderer type list and selection validation are placeholder values.
 * Logic integration (fetching available types from SceneManager, unique name
 * generation, selection validation) is deferred to a future implementation session.
 */

import React from 'react';
import { InputGroup, HTMLSelect, Switch, FormGroup, Divider } from '@blueprintjs/core';
import type { RendererOptions } from '../types';

// Placeholder renderer types -- will be fetched from SceneManager in a future session
const RENDERER_TYPE_OPTIONS = [
  { label: 'Simple (ball & stick)', value: 'simple' },
  { label: 'Cartoon (ribbon)', value: 'cartoon' },
  { label: 'CPK (space filling)', value: 'cpk' },
  { label: 'Tube', value: 'tube' },
  { label: 'Surface (solvent)', value: 'molsurf' },
  { label: 'Isosurface (map)', value: 'isosurf' },
];

interface RendererOptionsPaneProps {
  options: RendererOptions;
  onChange: (updated: RendererOptions) => void;
}

export const RendererOptionsPane: React.FC<RendererOptionsPaneProps> = ({ options, onChange }) => {
  const set = <K extends keyof RendererOptions>(key: K) =>
    (value: RendererOptions[K]) => onChange({ ...options, [key]: value });

  return (
    <div className="fod-section">
      <div className="fod-section-title">Object</div>
      <FormGroup label="Object name" labelFor="rend-objname" className="fod-form-group">
        <InputGroup
          id="rend-objname"
          value={options.objectName}
          onChange={(e) => set('objectName')(e.target.value)}
          placeholder="molecule"
        />
      </FormGroup>
      <Divider />
      <div className="fod-section-title">Renderer</div>
      <FormGroup label="Renderer type" labelFor="rend-type" className="fod-form-group">
        <HTMLSelect
          id="rend-type"
          fill
          value={options.rendererType}
          onChange={(e) => set('rendererType')(e.target.value)}
        >
          {RENDERER_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </HTMLSelect>
      </FormGroup>
      <FormGroup label="Renderer name" labelFor="rend-name" className="fod-form-group">
        <InputGroup
          id="rend-name"
          value={options.rendererName}
          onChange={(e) => set('rendererName')(e.target.value)}
          placeholder="simple1"
        />
      </FormGroup>
      <Divider />
      <div className="fod-section-title">Atom Selection</div>
      <FormGroup label="Selection" labelFor="rend-sel" className="fod-form-group">
        <InputGroup
          id="rend-sel"
          value={options.selection}
          onChange={(e) => set('selection')(e.target.value)}
          placeholder="* (all atoms)"
        />
      </FormGroup>
      <Divider />
      <Switch
        label="Center view on molecule after loading"
        checked={options.centerView}
        onChange={(e) => set('centerView')(e.target.checked)}
        className="fod-switch"
      />
    </div>
  );
};
