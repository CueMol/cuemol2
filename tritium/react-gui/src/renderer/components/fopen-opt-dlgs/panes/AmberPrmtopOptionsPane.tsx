/**
 * @file panes/AmberPrmtopOptionsPane.tsx
 * @description Option pane for AMBER prmtop topology files. Analogous to the
 * NAMD coordinate pane: the prmtop is the main stream (topology) and an
 * optional coordinate file (inpcrd / rst7 / restrt) is attached as the
 * reader's "coord" sub-stream. A "Change..." button opens a native file
 * picker filtered to those extensions. Leaving the path empty performs a
 * topology-only load (atoms at default positions).
 */
import React, { useCallback } from 'react';
import { Field, FieldSection, FormButton, TextField } from '../../../h3-kit/form';
import type { AmberPrmtopOptions } from '../types';
import { IPC } from '@shared/ipcChannels';

interface AmberPrmtopOptionsPaneProps {
  options: AmberPrmtopOptions;
  onChange: (updated: AmberPrmtopOptions) => void;
}

export const AmberPrmtopOptionsPane: React.FC<AmberPrmtopOptionsPaneProps> = ({ options, onChange }) => {
  const handleBrowse = useCallback(async () => {
    try {
      const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
        title: 'Select AMBER coordinate file',
        filters: [
          { name: 'AMBER coordinates', extensions: ['rst7', 'inpcrd', 'restrt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (res && !res.canceled && res.filePath) onChange({ coordFilePath: res.filePath });
    } catch {
      /* dialog unavailable (e.g. Vite dev server) -- ignore */
    }
  }, [onChange]);

  return (
    <div className="fod-section">
      <FieldSection title="Coordinates">
        <Field label="Coordinate file (inpcrd / rst7)">
          <div className="fod-path-row">
            <TextField
              value={options.coordFilePath}
              placeholder="/path/to/system.rst7"
              onChange={(v) => onChange({ coordFilePath: v })}
            />
            <FormButton text="Change..." onClick={handleBrowse} />
          </div>
        </Field>
        <div className="fod-hint">Optional. Leave empty to load topology only (atoms at zero).</div>
      </FieldSection>
    </div>
  );
};
