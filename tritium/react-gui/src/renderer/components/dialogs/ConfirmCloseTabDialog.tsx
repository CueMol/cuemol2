import React from 'react';
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

export type ConfirmCloseResult = 'save' | 'discard' | 'cancel';

interface Props {
  visible: boolean;
  sceneName: string;
  onResult: (result: ConfirmCloseResult) => void;
}

export function ConfirmCloseTabDialog({ visible, sceneName, onResult }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const displayName = sceneName ? `"${sceneName}"` : '(unnamed)';

  return (
    <Dialog
      isOpen={visible}
      onClose={() => onResult('cancel')}
      title="Unsaved Changes"
      style={{ width: 400, paddingBottom: 0 }}
      portalClassName={isDark ? 'bp5-dark' : ''}
      canOutsideClickClose={false}
      isCloseButtonShown={false}
    >
      <DialogBody>
        <p style={{ margin: 0 }}>
          Scene {displayName} is not saved. Save changes?
        </p>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={() => onResult('cancel')}>Cancel</Button>
            <Button intent="danger" onClick={() => onResult('discard')}>Don&apos;t Save</Button>
            <Button intent="primary" onClick={() => onResult('save')}>Save</Button>
          </>
        }
      />
    </Dialog>
  );
}
