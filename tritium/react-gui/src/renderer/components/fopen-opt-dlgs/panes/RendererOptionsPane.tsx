import React from 'react';
import { Divider } from '@blueprintjs/core';
import {
  CheckboxField,
  Field,
  FieldSection,
  SelectField,
  SwitchField,
  TextField,
} from '../../../h3-kit/form';
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
      <FieldSection title="Object">
        <Field label="Object name">
          <TextField value={options.objectName} onChange={set('objectName')} />
        </Field>
      </FieldSection>
      <Divider />
      <FieldSection title="Renderer">
        <Field label="Renderer type">
          <SelectField
            value={options.presetName ?? options.rendererType}
            onChange={onTypeChange}
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
          </SelectField>
        </Field>
        <Field label="Renderer name">
          <TextField
            value={options.rendererName}
            onChange={(v) => {
              if (onRendererNameUserEdit) onRendererNameUserEdit(v);
              else set('rendererName')(v);
            }}
          />
        </Field>
        {isMolFormat && (
          <>
            {/* Gate for the selection list below -> Checkbox (value / gate
              * rule in ui-style-guide.md). A preset's children carry their
              * sel from the style definition, so the dialog selection would
              * be ignored (RendGroup has no sel): disable it while picked. */}
            <Field label="Selection" inline controlFirst>
              <CheckboxField
                checked={options.selectionEnabled}
                disabled={isPreset}
                onChange={set('selectionEnabled')}
              />
            </Field>
            <Field label="Atoms">
              <MolSelList
                sceneID={sceneId}
                molID={molID}
                selectedSel={options.selection}
                onSelectedSelChange={set('selection')}
                disabled={!options.selectionEnabled || isPreset}
                placeholder="* (all atoms)"
              />
            </Field>
          </>
        )}
      </FieldSection>
      <Divider />
      <Field label="Center view on molecule after loading" inline>
        <SwitchField checked={options.centerView} onChange={set('centerView')} />
      </Field>
    </div>
  );
};
