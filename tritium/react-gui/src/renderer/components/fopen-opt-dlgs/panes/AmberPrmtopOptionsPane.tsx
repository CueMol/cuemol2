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
import { InputGroup, FormGroup, Button, ControlGroup } from '@blueprintjs/core';
import type { AmberPrmtopOptions } from '../types';
import { IPC } from '../../../../shared/ipcChannels';

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
      <div className="fod-section-title">Coordinates</div>
      <FormGroup
        label="Coordinate file (inpcrd / rst7)"
        labelFor="amber-coord"
        helperText="Optional. Leave empty to load topology only (atoms at zero)."
        className="fod-form-group"
      >
        <ControlGroup fill>
          <InputGroup
            id="amber-coord"
            placeholder="/path/to/system.rst7"
            value={options.coordFilePath}
            onChange={(e) => onChange({ coordFilePath: e.target.value })}
            fill
          />
          <Button text="Change..." onClick={handleBrowse} />
        </ControlGroup>
      </FormGroup>
    </div>
  );
};
