import React from 'react';
import { Button } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';

export type ConfirmCloseResult = 'save' | 'discard' | 'cancel';

interface Props {
  visible: boolean;
  sceneName: string;
  onResult: (result: ConfirmCloseResult) => void;
}

export function ConfirmCloseTabDialog({ visible, sceneName, onResult }: Props): React.JSX.Element {
  const displayName = sceneName ? `"${sceneName}"` : '(unnamed)';

  return (
    <DialogShell
      visible={visible}
      title="Unsaved Changes"
      width="xl"
      onCancel={() => onResult('cancel')}
      // Three outcomes, not two: the shared Cancel / OK pair cannot express
      // "discard" sitting between them.
      footerActions={
        <>
          <Button onClick={() => onResult('cancel')}>Cancel</Button>
          <Button intent="danger" onClick={() => onResult('discard')}>Don&apos;t Save</Button>
          <Button intent="primary" onClick={() => onResult('save')}>Save</Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        Scene {displayName} is not saved. Save changes?
      </p>
    </DialogShell>
  );
}
