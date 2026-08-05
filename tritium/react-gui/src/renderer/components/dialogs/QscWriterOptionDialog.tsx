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
    const [version, setVersion] = useState<QscVersion>('QDF1');
    const [compress, setCompress] = useState<QscCompress>('xzip');
    const [base64, setBase64] = useState(false);

    useEffect(() => {
        if (visible) {
            // Defaults: QDF1 + embed off + base64 off + xz.
            //
            // UXP qscwriter-option-dlg.js onLoad picks QDF0 ("default: qdf0
            // (compat)"), which predates QDF1 being the established format --
            // and because QDF0 has no notion of compression, that default also
            // silently forces compress=none at OK time, so scenes saved
            // straight through the dialog were never compressed. QDF1 is the
            // default here instead, which leaves the compression option live
            // and lands on xz. Everything else, including the QDF0 disable
            // rule enforced at OK time (see handleOk), stays UXP-faithful.
            setEmbedAll(false);
            setVersion('QDF1');
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
                            className="h3-form-select"
                            value={version}
                            onChange={(e) => setVersion(e.currentTarget.value as QscVersion)}
                            options={VERSION_OPTIONS}
                        />
                    </FormGroup>

                    <FormGroup label="Compression" inline disabled={advancedDisabled}>
                        <HTMLSelect
                            className="h3-form-select"
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
