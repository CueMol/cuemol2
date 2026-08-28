import React, { useState, useEffect } from 'react';
import { Dialog, DialogBody, DialogFooter, Button } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';
import { useCueMol } from '../../hooks/useCueMol';
import aboutPng from '../../assets/about.png';
import { APP_PRODUCT_NAME } from '@shared/appInfo';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AboutDialog({ visible, onClose }: Props): React.JSX.Element {
  const { theme } = useTheme();
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

  const isDark = theme === 'dark';

  return (
    <Dialog
      isOpen={visible}
      onClose={onClose}
      title={`About ${APP_PRODUCT_NAME}`}
      style={{ width: 300, paddingBottom: 0 }}
      portalClassName={isDark ? 'bp5-dark' : ''}
      canOutsideClickClose={false}
      isCloseButtonShown={false}
    >
      <DialogBody style={{ padding: 0 }}>
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
      </DialogBody>
      <DialogFooter
        actions={
          <Button intent="primary" onClick={onClose}>OK</Button>
        }
      />
    </Dialog>
  );
}
