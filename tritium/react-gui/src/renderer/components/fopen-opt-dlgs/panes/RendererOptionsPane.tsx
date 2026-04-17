import React from 'react';
import { InputGroup, HTMLSelect, Switch, FormGroup, Divider } from '@blueprintjs/core';
import type { RendererOptions } from '../types';

interface RendererOptionsPaneProps {
  options: RendererOptions;
  onChange: (updated: RendererOptions) => void;
  rendererTypes: string[];
}

export const RendererOptionsPane: React.FC<RendererOptionsPaneProps> = ({ options, onChange, rendererTypes }) => {
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
          disabled={rendererTypes.length === 0}
        >
          {rendererTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
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
