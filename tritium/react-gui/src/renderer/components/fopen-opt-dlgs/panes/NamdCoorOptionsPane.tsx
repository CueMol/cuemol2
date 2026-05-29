/**
 * @file panes/NamdCoorOptionsPane.tsx
 * @description Option pane for NAMD binary coordinate files. Mirrors the UXP
 * fopen-namdcooropt page: a PSF topology path text box plus a "Change..."
 * button that opens a native file picker filtered to *.psf. The default path
 * (last-used history, else the coordinate path with a .psf extension) is
 * seeded by FileOpenOptionDialog.
 */

import React, { useCallback } from 'react';
import { InputGroup, FormGroup, Button, ControlGroup } from '@blueprintjs/core';
import type { NamdCoorOptions } from '../types';
import { IPC } from '../../../../shared/ipcChannels';

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
      <div className="fod-section-title">Topology</div>
      <FormGroup
        label="PSF topology file"
        labelFor="namd-psf"
        helperText="Required to assign atom types and connectivity"
        className="fod-form-group"
      >
        <ControlGroup fill>
          <InputGroup
            id="namd-psf"
            placeholder="/path/to/topology.psf"
            value={options.psfFilePath}
            onChange={(e) => onChange({ psfFilePath: e.target.value })}
            fill
          />
          <Button text="Change..." onClick={handleBrowse} />
        </ControlGroup>
      </FormGroup>
    </div>
  );
};
