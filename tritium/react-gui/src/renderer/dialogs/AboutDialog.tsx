import React, { useState, useEffect } from 'react';
import { Button } from '@blueprintjs/core';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { DialogShell } from './DialogShell';
import aboutPng from '@renderer/assets/about.png';
import { APP_PRODUCT_NAME } from '@shared/appInfo';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AboutDialog({ visible, onClose }: Props): React.JSX.Element {
  const { cm } = useCueMol();
  const [version, setVersion] = useState('');
  const [build, setBuild] = useState('');

  useEffect(() => {
    if (!visible || !cm) return;
    cm.getAppInfo().then(({ version: v, build: b }) => {
      setVersion(v);
      setBuild(b);
    }).catch(() => {});
  }, [visible, cm]);

  return (
    <DialogShell
      visible={visible}
      title={`About ${APP_PRODUCT_NAME}`}
      width="xs"
      onCancel={onClose}
      // A splash image bled to the frame edge, not a form: the shared gutter
      // and section gap would inset it.
      bodyClassName="h3-dialog-plain-body"
      footerActions={<Button intent="primary" onClick={onClose}>OK</Button>}
    >
      <>
        <img
          src={aboutPng}
          alt="CueMol3"
          style={{ width: '100%', display: 'block' }}
        />
        <div style={{ paddingBottom: 12 }}>
          <div style={{
            fontSize: 30,
            fontWeight: 'bold',
            fontFamily: 'Verdana, Arial, Helvetica, sans-serif',
            color: 'var(--accent)',
            marginTop: '0.5em',
            marginLeft: 17,
            marginBottom: 4,
          }}>
            {APP_PRODUCT_NAME}
          </div>

          <div style={{
            fontWeight: 'bold',
            color: 'var(--text-secondary)',
            marginLeft: 17,
            marginBottom: 2,
          }}>
            Version: {version || '—'}
          </div>

          <div style={{
            color: 'var(--text-secondary)',
            marginLeft: 17,
            marginBottom: 10,
          }}>
            Build: {build || '—'}
          </div>

          <div style={{
            fontSize: 'var(--fs-sm)',
            marginLeft: 16,
            marginRight: 16,
            marginBottom: 4,
            color: 'var(--text-primary)',
          }}>
            ©1998-2026 Contributors. All Rights Reserved.
          </div>
        </div>
      </>
    </DialogShell>
  );
}
