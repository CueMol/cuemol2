import React, { useState, useEffect, useCallback } from 'react';
import {
    Button,
    Checkbox,
    Dialog,
    DialogBody,
    DialogFooter,
    FormGroup,
    Radio,
    RadioGroup,
} from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';
import { ComboBoxField } from '../../h3-kit/form';
import { getHistory } from './pdbIdHistory';

export type CoordServerType = 'RCSB_CIF' | 'RCSB_PDB';
export type MapServerType = 'RCSB_CIF' | 'EBI_MTZ';

export interface GetPdbDialogResult {
    pdbid: string;        // 4-char accession code, lowercased
    coord:    { serverType: CoordServerType } | null;
    map2fofc: { serverType: MapServerType }   | null;
    mapFofc:  { serverType: MapServerType }   | null;
}

interface Props {
    visible: boolean;
    onConfirm: (result: GetPdbDialogResult) => void;
    onCancel: () => void;
}

// Same shape as UXP openPDB.js:104-111: first char digit, remaining alnum.
const PDBID_RE = /^[0-9][0-9a-z]{3}$/i;

export function GetPdbDialog({ visible, onConfirm, onCancel }: Props): React.JSX.Element {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [pdbid, setPdbid] = useState('');

    const [coordEnabled, setCoordEnabled] = useState(true);
    const [coordServer, setCoordServer] = useState<CoordServerType>('RCSB_CIF');

    const [map2fofcEnabled, setMap2fofcEnabled] = useState(false);
    const [mapFofcEnabled, setMapFofcEnabled] = useState(false);
    const [mapServer, setMapServer] = useState<MapServerType>('RCSB_CIF');

    const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory());

    useEffect(() => {
        if (visible) {
            setPdbid('');
            setCoordEnabled(true);
            setCoordServer('RCSB_CIF');
            setMap2fofcEnabled(false);
            setMapFofcEnabled(false);
            setMapServer('RCSB_CIF');
            setHistoryItems(getHistory());
        }
    }, [visible]);

    const refreshHistory = useCallback((): void => {
        setHistoryItems(getHistory());
    }, []);

    const idValid = PDBID_RE.test(pdbid.trim());
    const anySelected = coordEnabled || map2fofcEnabled || mapFofcEnabled;
    const canSubmit = idValid && anySelected;
    const mapServerEnabled = map2fofcEnabled || mapFofcEnabled;

    const handleOk = () => {
        if (!canSubmit) return;
        const lower = pdbid.trim().toLowerCase();
        onConfirm({
            pdbid: lower,
            coord:    coordEnabled    ? { serverType: coordServer } : null,
            map2fofc: map2fofcEnabled  ? { serverType: mapServer }   : null,
            mapFofc:  mapFofcEnabled   ? { serverType: mapServer }   : null,
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && canSubmit) {
            e.preventDefault();
            handleOk();
        }
    };

    return (
        <Dialog
            isOpen={visible}
            onClose={onCancel}
            title="Get PDB"
            style={{ width: 380 }}
            portalClassName={isDark ? 'bp5-dark' : ''}
            canOutsideClickClose={false}
            isCloseButtonShown={false}
        >
            <DialogBody>
                <FormGroup label="PDB Accession Code:" labelFor="get-pdb-id">
                    {/* Editable combobox: text + themed, click-to-open history
                        dropdown. The chevron and dark-mode popover are handled
                        by ComboBoxField (h3-kit), so this dialog adds none of
                        that styling. */}
                    <ComboBoxField
                        id="get-pdb-id"
                        value={pdbid}
                        onChange={setPdbid}
                        options={historyItems}
                        onOpen={refreshHistory}
                        placeholder="e.g., 1mbn"
                        autoFocus
                        invalid={pdbid.length > 0 && !idValid}
                        onKeyDown={handleKeyDown}
                        emptyText="No history"
                        triggerLabel="Show PDB ID history"
                        triggerTitle="Recent PDB IDs"
                        aria-label="PDB Accession Code"
                    />
                </FormGroup>

                <fieldset style={{ marginTop: 12, padding: '8px 12px' }}>
                    <legend style={{ padding: '0 4px' }}>Coordinates</legend>
                    <Checkbox
                        label="Fetch coord file"
                        checked={coordEnabled}
                        onChange={(e) => setCoordEnabled(e.currentTarget.checked)}
                    />
                    <div style={{ paddingLeft: 24 }}>
                        <RadioGroup
                            inline={false}
                            selectedValue={coordServer}
                            onChange={(e) => setCoordServer(e.currentTarget.value as CoordServerType)}
                            disabled={!coordEnabled}
                        >
                            <Radio value="RCSB_CIF" label="RCSB (mmCIF)" />
                            <Radio value="RCSB_PDB" label="RCSB (PDB)" />
                        </RadioGroup>
                    </div>
                </fieldset>

                <fieldset style={{ marginTop: 8, padding: '8px 12px' }}>
                    <legend style={{ padding: '0 4px' }}>Density maps</legend>
                    <Checkbox
                        label="Fetch 2Fo-Fc map"
                        checked={map2fofcEnabled}
                        onChange={(e) => setMap2fofcEnabled(e.currentTarget.checked)}
                    />
                    <Checkbox
                        label="Fetch Fo-Fc map"
                        checked={mapFofcEnabled}
                        onChange={(e) => setMapFofcEnabled(e.currentTarget.checked)}
                    />
                    <div style={{ paddingLeft: 24 }}>
                        <RadioGroup
                            inline={false}
                            selectedValue={mapServer}
                            onChange={(e) => setMapServer(e.currentTarget.value as MapServerType)}
                            disabled={!mapServerEnabled}
                        >
                            <Radio value="RCSB_CIF" label="RCSB (cif.gz)" />
                            <Radio value="EBI_MTZ" label="EBI (MTZ)" />
                        </RadioGroup>
                    </div>
                </fieldset>
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onCancel}>Cancel</Button>
                        <Button intent="primary" onClick={handleOk} disabled={!canSubmit}>
                            Download
                        </Button>
                    </>
                }
            />
        </Dialog>
    );
}
