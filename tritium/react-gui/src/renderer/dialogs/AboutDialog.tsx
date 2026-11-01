import React, { useState, useEffect } from 'react';
import { Button } from '@blueprintjs/core';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { DialogShell } from './DialogShell';
import aboutPng from '@renderer/assets/about.png';
import { APP_PRODUCT_NAME } from '@shared/appInfo';
import { IPC } from '@shared/ipcChannels';
import type { AboutRuntimeInfo } from '@shared/types/aboutInfo';
import { aboutRows, aboutText } from './aboutInfo';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AboutDialog({ visible, onClose }: Props): React.JSX.Element {
  const { cm } = useCueMol();
  const [version, setVersion] = useState('');
  const [build, setBuild] = useState('');
  const [runtime, setRuntime] = useState<AboutRuntimeInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible || !cm) return;
    cm.getAppInfo().then(({ version: v, build: b }) => {
      setVersion(v);
      setBuild(b);
    }).catch(() => {});
  }, [visible, cm]);

  useEffect(() => {
    if (!visible) return;
    setCopied(false);
    window.electronAPI.invoke(IPC.APP_ABOUT_INFO).then(setRuntime).catch(() => {});
  }, [visible]);

  const rows = aboutRows({ version, build }, runtime, __BUILD_DATE__);

  const onCopy = (): void => {
    navigator.clipboard.writeText(aboutText(APP_PRODUCT_NAME, rows))
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <DialogShell
      visible={visible}
      title={`About ${APP_PRODUCT_NAME}`}
      width="xs"
      onCancel={onClose}
      // A splash image bled to the frame edge, not a form: the shared gutter
      // and section gap would inset it.
      bodyClassName="h3-dialog-plain-body"
      footerActions={
        <>
          <Button onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button intent="primary" onClick={onClose}>OK</Button>
        </>
      }
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

          <dl className="h3-about-info type-body">
            {rows.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt>{label}:</dt>
                <dd>{value || '\u2014'}</dd>
              </React.Fragment>
            ))}
          </dl>

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
