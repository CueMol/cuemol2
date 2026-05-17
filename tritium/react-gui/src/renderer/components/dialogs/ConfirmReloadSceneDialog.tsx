import React from 'react';
import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
  visible: boolean;
  sceneName: string;
  onResult: (proceed: boolean) => void;
}

/**
 * Two-button confirm shown before Reload Scene discards unsaved changes.
 * Mirrors UXP `Qm2Main.onReloadScene`'s modified-scene confirmation.
 */
export function ConfirmReloadSceneDialog({ visible, sceneName, onResult }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const displayName = sceneName ? `"${sceneName}"` : '(unnamed)';

  return (
    <Dialog
      isOpen={visible}
      onClose={() => onResult(false)}
      title="Reload Scene"
      style={{ width: 400, paddingBottom: 0 }}
      portalClassName={isDark ? 'bp5-dark' : ''}
      canOutsideClickClose={false}
      isCloseButtonShown={false}
    >
      <DialogBody>
        <p style={{ margin: 0 }}>
          Scene {displayName} has unsaved changes. Reload from disk and discard
          changes?
        </p>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={() => onResult(false)}>Cancel</Button>
            <Button intent="danger" onClick={() => onResult(true)}>Reload</Button>
          </>
        }
      />
    </Dialog>
  );
}
