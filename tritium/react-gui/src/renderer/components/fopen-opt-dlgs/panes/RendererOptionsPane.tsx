import React from 'react';
import { InputGroup, HTMLSelect, Switch, FormGroup, Divider, Checkbox } from '@blueprintjs/core';
import type { RendererOptions } from '../types';
import { MolSelList } from '../../widgets/MolSelList';

interface RendererOptionsPaneProps {
  options: RendererOptions;
  onChange: (updated: RendererOptions) => void;
  rendererTypes: string[];
  sceneId: number;
  isMolFormat: boolean;
  /**
   * Routes renderer-name keystrokes through the parent so it can track
   * whether the value is still the auto-generated default (UXP
   * mRendNameDefault). When omitted, falls back to setting the field
   * directly via the standard onChange path.
   */
  onRendererNameUserEdit?: (newValue: string) => void;
}

export const RendererOptionsPane: React.FC<RendererOptionsPaneProps> = ({ options, onChange, rendererTypes, sceneId, isMolFormat, onRendererNameUserEdit }) => {
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
          onChange={(e) => {
            if (onRendererNameUserEdit) onRendererNameUserEdit(e.target.value);
            else set('rendererName')(e.target.value);
          }}
        />
      </FormGroup>
      {isMolFormat && (
        <FormGroup
          label={
            <Checkbox
              checked={options.selectionEnabled}
              onChange={(e) => set('selectionEnabled')(e.target.checked)}
              label="Selection"
              style={{ marginBottom: 0 }}
            />
          }
          labelFor="rend-sel"
          className="fod-form-group"
        >
          <MolSelList
            sceneID={sceneId}
            selectedSel={options.selection}
            onSelectedSelChange={set('selection')}
            disabled={!options.selectionEnabled}
            placeholder="* (all atoms)"
          />
        </FormGroup>
      )}
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
