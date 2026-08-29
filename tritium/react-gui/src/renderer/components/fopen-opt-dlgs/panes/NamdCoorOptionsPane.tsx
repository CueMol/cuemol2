/**
 * @file panes/NamdCoorOptionsPane.tsx
 * @description Option pane for NAMD binary coordinate files. Mirrors the UXP
 * fopen-namdcooropt page: a PSF topology path text box plus a "Change..."
 * button that opens a native file picker filtered to *.psf. The default path
 * (last-used history, else the coordinate path with a .psf extension) is
 * seeded by FileOpenOptionDialog.
 */
import React, { useCallback } from 'react';
import { Field, FieldSection, FormButton, TextField } from '@renderer/h3-kit/form';
import type { NamdCoorOptions } from '../types';
import { IPC } from '@shared/ipcChannels';

interface NamdCoorOptionsPaneProps {
  options: NamdCoorOptions;
  onChange: (updated: NamdCoorOptions) => void;
}

export const NamdCoorOptionsPane: React.FC<NamdCoorOptionsPaneProps> = ({ options, onChange }) => {
  const handleBrowse = useCallback(async () => {
    try {
      const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
        title: 'Select PSF file',
        filters: [
          { name: 'PSF file', extensions: ['psf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (res && !res.canceled && res.filePath) onChange({ psfFilePath: res.filePath });
    } catch {
      /* dialog unavailable (e.g. Vite dev server) -- ignore */
    }
  }, [onChange]);

  return (
    <div className="fod-section">
      <FieldSection title="Topology">
        <Field label="PSF topology file">
          <div className="fod-path-row">
            <TextField
              value={options.psfFilePath}
              placeholder="/path/to/topology.psf"
              onChange={(v) => onChange({ psfFilePath: v })}
            />
            <FormButton text="Change..." onClick={handleBrowse} />
          </div>
        </Field>
        <div className="fod-hint">Required to assign atom types and connectivity</div>
      </FieldSection>
    </div>
  );
};
