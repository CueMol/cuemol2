import React, { useEffect, useState } from 'react';
import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    FormGroup,
    HTMLSelect,
    Switch,
} from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

export type QscVersion = 'QDF0' | 'QDF1';
export type QscCompress = 'xzip' | 'gzip' | 'none';

export interface QscWriterOptions {
    embedAll: boolean;
    version: QscVersion;
    compress: QscCompress;
    base64: boolean;
}

interface Props {
    visible: boolean;
    onConfirm: (result: QscWriterOptions) => void;
    onCancel: () => void;
}

const VERSION_OPTIONS: { value: QscVersion; label: string }[] = [
    { value: 'QDF0', label: 'Ver 2.2 or later' },
    { value: 'QDF1', label: 'Ver 2.3 or later' },
];

const COMPRESS_OPTIONS: { value: QscCompress; label: string }[] = [
    { value: 'xzip', label: 'xz' },
    { value: 'gzip', label: 'gzip' },
    { value: 'none', label: 'none' },
];

export function QscWriterOptionDialog({ visible, onConfirm, onCancel }: Props): React.JSX.Element {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [embedAll, setEmbedAll] = useState(false);
    const [version, setVersion] = useState<QscVersion>('QDF0');
    const [compress, setCompress] = useState<QscCompress>('xzip');
    const [base64, setBase64] = useState(false);

    useEffect(() => {
        if (visible) {
            // Match qscwriter-option-dlg.js onLoad: defaults are QDF0 +
            // embed off + base64 off + xz. The QDF0 disable rule is enforced
            // at OK time (see handleOk).
            setEmbedAll(false);
            setVersion('QDF0');
            setCompress('xzip');
            setBase64(false);
        }
    }, [visible]);

    const advancedDisabled = version === 'QDF0';

    const handleOk = (): void => {
        // UXP parity (qscwriter-option-dlg.js onDialogAccept): QDF0 has no
        // notion of compression / text encoding, so coerce them at submit
        // time regardless of the (disabled) UI state.
        if (advancedDisabled) {
            onConfirm({ embedAll, version, compress: 'none', base64: false });
        } else {
            onConfirm({ embedAll, version, compress, base64 });
        }
    };

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Scene options"
            style={{ width: 360 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <Switch
                    label="Embed possible"
                    checked={embedAll}
                    onChange={(e) => setEmbedAll(e.currentTarget.checked)}
                />

                <fieldset style={{ marginTop: 8, padding: '8px 12px' }}>
                    <legend style={{ padding: '0 4px' }}>Format</legend>

                    <FormGroup label="Compatibility" inline>
                        <HTMLSelect
                            value={version}
                            onChange={(e) => setVersion(e.currentTarget.value as QscVersion)}
                            options={VERSION_OPTIONS}
                        />
                    </FormGroup>

                    <FormGroup label="Compression" inline disabled={advancedDisabled}>
                        <HTMLSelect
                            value={compress}
                            disabled={advancedDisabled}
                            onChange={(e) => setCompress(e.currentTarget.value as QscCompress)}
                            options={COMPRESS_OPTIONS}
                        />
                    </FormGroup>

                    <Switch
                        label="Enable text encoding"
                        checked={base64}
                        disabled={advancedDisabled}
                        onChange={(e) => setBase64(e.currentTarget.checked)}
                    />
                </fieldset>
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onCancel}>Cancel</Button>
                        <Button intent="primary" onClick={handleOk}>OK</Button>
                    </>
                }
            />
        </Dialog>
    );
}
