import React from 'react';
import { DialogShell } from './DialogShell';

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
  const displayName = sceneName ? `"${sceneName}"` : '(unnamed)';

  return (
    <DialogShell
      visible={visible}
      title="Reload Scene"
      width="xl"
      onCancel={() => onResult(false)}
      onOk={() => onResult(true)}
      okLabel="Reload"
      okIntent="danger"
    >
      <p style={{ margin: 0 }}>
        Scene {displayName} has unsaved changes. Reload from disk and discard
        changes?
      </p>
    </DialogShell>
  );
}
