import React, { useState, useEffect } from 'react';
import { Checkbox, FormGroup, InputGroup, Radio, RadioGroup } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';
import { NewSceneSettingsFields } from './NewSceneSettingsFields';
import type { NewSceneDefaults } from '@renderer/data/newSceneDefaults';

export type NewTabMode = 'new-scene' | 'new-view';

export interface NewTabDialogResult {
    mode: NewTabMode;
    name: string;
    inheritViewProps: boolean;
    /** What the new scene should look like; only set for `new-scene`. */
    sceneDefaults?: NewSceneDefaults;
}

interface Props {
    visible: boolean;
    currentSceneName: string | null;
    defaultSceneName: string;
    defaultViewName: string;
    /** Scene settings to open with -- the values last confirmed here. */
    sceneDefaults: NewSceneDefaults;
    onConfirm: (result: NewTabDialogResult) => void;
    onCancel: () => void;
}

export function NewTabDialog({
    visible,
    currentSceneName,
    defaultSceneName,
    defaultViewName,
    sceneDefaults,
    onConfirm,
    onCancel,
}: Props): React.JSX.Element {

    const [mode, setMode] = useState<NewTabMode>('new-scene');
    const [sceneName, setSceneName] = useState(defaultSceneName);
    const [viewName, setViewName] = useState(defaultViewName);
    const [inherit, setInherit] = useState(true);
    const [scene, setScene] = useState<NewSceneDefaults>(sceneDefaults);

    // Reset state when dialog opens
    useEffect(() => {
        if (visible) {
            setMode('new-scene');
            setSceneName(defaultSceneName);
            setViewName(defaultViewName);
            setInherit(true);
            setScene(sceneDefaults);
        }
    }, [visible, defaultSceneName, defaultViewName, sceneDefaults]);

    const handleModeChange = (e: React.FormEvent<HTMLInputElement>) => {
        setMode(e.currentTarget.value as NewTabMode);
    };

    const handleOk = () => {
        const name = mode === 'new-scene' ? sceneName.trim() : viewName.trim();
        onConfirm({
            mode,
            name: name || (mode === 'new-scene' ? defaultSceneName : defaultViewName),
            inheritViewProps: inherit,
            sceneDefaults: mode === 'new-scene' ? scene : undefined,
        });
    };

    const newViewLabel = currentSceneName
        ? `New View for ${currentSceneName}`
        : 'New View (no current scene)';

    return (
        <DialogShell
            visible={visible}
            title="New Tab/Window"
            width="lg"
            onCancel={onCancel}
            onOk={handleOk}
        >
            <p style={{ marginBottom: 10, marginTop: 0 }}>Create new tab for:</p>
            <RadioGroup selectedValue={mode} onChange={handleModeChange}>
                <Radio value="new-scene" label="New Scene" />
                <div style={{ paddingLeft: 24, marginBottom: 8 }}>
                    <FormGroup label="Name:" inline labelFor="new-tab-scene-name" style={{ marginBottom: 0 }}>
                        <InputGroup
                            id="new-tab-scene-name"
                            value={sceneName}
                            onChange={(e) => setSceneName(e.target.value)}
                            disabled={mode !== 'new-scene'}
                            style={{ width: 200 }}
                        />
                    </FormGroup>
                    <NewSceneSettingsFields
                        value={scene}
                        onChange={setScene}
                        disabled={mode !== 'new-scene'}
                    />
                </div>

                <Radio
                    value="new-view"
                    label={newViewLabel}
                    disabled={!currentSceneName}
                />
                <div style={{ paddingLeft: 24, marginBottom: 8 }}>
                    <FormGroup label="Name:" inline labelFor="new-tab-view-name" style={{ marginBottom: 0 }}>
                        <InputGroup
                            id="new-tab-view-name"
                            value={viewName}
                            onChange={(e) => setViewName(e.target.value)}
                            disabled={mode !== 'new-view'}
                            style={{ width: 200 }}
                        />
                    </FormGroup>
                </div>

                <div style={{ paddingLeft: 24 }}>
                    <Checkbox
                        label="Inherit view props"
                        checked={inherit}
                        onChange={(e) => setInherit(e.currentTarget.checked)}
                        disabled={mode !== 'new-view'}
                    />
                </div>
            </RadioGroup>
        </DialogShell>
    );
}
