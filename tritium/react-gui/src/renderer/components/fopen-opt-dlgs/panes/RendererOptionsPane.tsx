import React from 'react';
import { InputGroup, HTMLSelect, Switch, FormGroup, Divider, Checkbox } from '@blueprintjs/core';
import type { PresetTypeEntry, RendererOptions } from '../types';
import { MolSelList } from '../../../h3-kit/MolSelList';

interface RendererOptionsPaneProps {
  options: RendererOptions;
  onChange: (updated: RendererOptions) => void;
  rendererTypes: string[];
  /**
   * Renderer presets shown in a leading "Presets" optgroup (UXP puts them
   * first in the menulist). Empty / omitted keeps the flat plain-type list.
   */
  presetTypes?: PresetTypeEntry[];
  sceneId: number;
  isMolFormat: boolean;
  /**
   * Target molecule uid. Forwarded to MolSelList so the picker can show
   * `current (<sel>)`. Set only when the dialog is attached to an existing
   * molecule (e.g. scene-panel "New Renderer"); omitted for file-open
   * where the object doesn't exist yet.
   */
  molID?: number;
  /**
   * Routes renderer-name keystrokes through the parent so it can track
   * whether the value is still the auto-generated default (UXP
   * mRendNameDefault). When omitted, falls back to setting the field
   * directly via the standard onChange path.
   */
  onRendererNameUserEdit?: (newValue: string) => void;
}

export const RendererOptionsPane: React.FC<RendererOptionsPaneProps> = ({ options, onChange, rendererTypes, presetTypes, sceneId, isMolFormat, molID, onRendererNameUserEdit }) => {
  const set = <K extends keyof RendererOptions>(key: K) =>
    (value: RendererOptions[K]) => onChange({ ...options, [key]: value });

  const presets = presetTypes ?? [];
  const isPreset = !!options.presetName;

  // The ONLY writer of options.presetName: a preset value sets it, a plain
  // type clears it while keeping rendererType (lossless toggle back).
  const onTypeChange = (v: string) => {
    if (presets.some((p) => p.name === v)) {
      onChange({ ...options, presetName: v });
    } else {
      onChange({ ...options, presetName: undefined, rendererType: v });
    }
  };

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
          className="h3-form-select"
          fill
          value={options.presetName ?? options.rendererType}
          onChange={(e) => onTypeChange(e.target.value)}
          disabled={rendererTypes.length === 0 && presets.length === 0}
        >
          {presets.length > 0 ? (
            <>
              <optgroup label="Presets">
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>{p.desc || p.name}</option>
                ))}
              </optgroup>
              <optgroup label="Renderer types">
                {rendererTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </optgroup>
            </>
          ) : (
            rendererTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))
          )}
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
              // A preset's children carry their sel from the style
              // definition; the dialog selection would be ignored
              // (RendGroup has no sel), so disable it while picked.
              disabled={isPreset}
            />
          }
          labelFor="rend-sel"
          className="fod-form-group"
        >
          <MolSelList
            sceneID={sceneId}
            molID={molID}
            selectedSel={options.selection}
            onSelectedSelChange={set('selection')}
            disabled={!options.selectionEnabled || isPreset}
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
