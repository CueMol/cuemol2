import React, { useEffect, useRef } from 'react';
import { Menu, MenuItem, MenuDivider } from '@blueprintjs/core';
import type { HitTestResult } from '../types/HitTestResult';
import { useCueMol } from '../hooks/useCueMol';

export interface NaviContextMenuState {
    open: boolean;
    x: number;
    y: number;
    hitres: HitTestResult | null;
    viewId: number | null;
}

interface NaviContextMenuProps {
    state: NaviContextMenuState;
    onClose: () => void;
}

export const NaviContextMenu: React.FC<NaviContextMenuProps> = ({ state, onClose }) => {
    const { cm } = useCueMol();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!state.open) return;
        const handleOutsideClick = (e: MouseEvent): void => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [state.open, onClose]);

    if (!state.open || !state.hitres || state.viewId == null) return null;

    const hit = state.hitres;
    const viewId = state.viewId;
    const isSymm = hit.rendtype === '*symm';

    const atomLabel = hit.obj_name ? `${hit.obj_name}: ${hit.message}` : hit.message;
    const rendLabel = `${hit.rend_name} (${hit.rendtype})`;

    const handleAction = async (action: string): Promise<void> => {
        if (!cm) { onClose(); return; }
        const objId = hit.obj_id;
        const atomId = hit.atom_id;

        switch (action) {
            case 'centerAt':
                await cm.naviCenterAt({ viewId, x: hit.x, y: hit.y, z: hit.z });
                break;
            case 'centerAtSymm':
                if (hit.symm_id != null) {
                    await cm.naviCenterAtSymm({ viewId, objId, rendId: hit.rend_id, atomId, symmId: hit.symm_id });
                }
                break;
            case 'selectAtom':
                await cm.naviCtxSelect({ viewId, objId, atomId, mode: 'atom' });
                break;
            case 'selectResid':
                await cm.naviCtxSelect({ viewId, objId, atomId, mode: 'residue' });
                break;
            case 'selectChain':
                await cm.naviCtxSelect({ viewId, objId, atomId, mode: 'chain' });
                break;
            case 'selectMol':
                await cm.naviCtxSelect({ viewId, objId, atomId, mode: 'mol' });
                break;
            case 'addSelectAtom':
                await cm.naviCtxAddSelect({ viewId, objId, atomId, mode: 'atom' });
                break;
            case 'addSelectResid':
                await cm.naviCtxAddSelect({ viewId, objId, atomId, mode: 'residue' });
                break;
            case 'addSelectChain':
                await cm.naviCtxAddSelect({ viewId, objId, atomId, mode: 'chain' });
                break;
            case 'unselect':
                await cm.naviCtxUnselect({ viewId, objId });
                break;
            case 'invertSel':
                await cm.naviCtxInvertSel({ viewId, objId });
                break;
            case 'toggleSidechain':
                await cm.naviCtxToggleSidechain({ viewId, objId });
                break;
            case 'arByres3':
                await cm.naviCtxAround({ viewId, objId, distance: 3, byres: true });
                break;
            case 'arByres5':
                await cm.naviCtxAround({ viewId, objId, distance: 5, byres: true });
                break;
            case 'arByres7':
                await cm.naviCtxAround({ viewId, objId, distance: 7, byres: true });
                break;
            case 'arByres10':
                await cm.naviCtxAround({ viewId, objId, distance: 10, byres: true });
                break;
            case 'around3':
                await cm.naviCtxAround({ viewId, objId, distance: 3, byres: false });
                break;
            case 'around5':
                await cm.naviCtxAround({ viewId, objId, distance: 5, byres: false });
                break;
            case 'around7':
                await cm.naviCtxAround({ viewId, objId, distance: 7, byres: false });
                break;
            case 'around10':
                await cm.naviCtxAround({ viewId, objId, distance: 10, byres: false });
                break;
            // TODO: createSymm — requires new-name prompt + renderer setup dialog (not yet implemented)
        }
        onClose();
    };

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                left: state.x + 2,
                top: state.y + 2,
                zIndex: 9999,
            }}
        >
            <Menu>
                <MenuItem text={atomLabel} disabled />
                <MenuItem text={rendLabel} disabled />
                {isSymm && <MenuItem text={`symop: ${hit.symm_name}`} disabled />}
                <MenuDivider />
                <MenuItem text="Center at this atom" onClick={() => handleAction('centerAt')} />
                <MenuDivider />
                <MenuItem text="Select Atom" onClick={() => handleAction('selectAtom')} />
                <MenuItem text="Select Residue" onClick={() => handleAction('selectResid')} />
                <MenuItem text="Select Chain" onClick={() => handleAction('selectChain')} />
                <MenuItem text="Select Molecule" onClick={() => handleAction('selectMol')} />
                <MenuDivider />
                <MenuItem text="Add Select Atom" onClick={() => handleAction('addSelectAtom')} />
                <MenuItem text="Add Select Residue" onClick={() => handleAction('addSelectResid')} />
                <MenuItem text="Add Select Chain" onClick={() => handleAction('addSelectChain')} />
                <MenuDivider />
                <MenuItem text="Unselect" onClick={() => handleAction('unselect')} />
                <MenuItem text="Invert Selection" onClick={() => handleAction('invertSel')} />
                <MenuItem text="Toggle Sidechain" onClick={() => handleAction('toggleSidechain')} />
                <MenuDivider />
                <MenuItem text="Around Byres">
                    <MenuItem text="3 Å" onClick={() => handleAction('arByres3')} />
                    <MenuItem text="5 Å" onClick={() => handleAction('arByres5')} />
                    <MenuItem text="7 Å" onClick={() => handleAction('arByres7')} />
                    <MenuItem text="10 Å" onClick={() => handleAction('arByres10')} />
                </MenuItem>
                <MenuItem text="Around">
                    <MenuItem text="3 Å" onClick={() => handleAction('around3')} />
                    <MenuItem text="5 Å" onClick={() => handleAction('around5')} />
                    <MenuItem text="7 Å" onClick={() => handleAction('around7')} />
                    <MenuItem text="10 Å" onClick={() => handleAction('around10')} />
                </MenuItem>
                {isSymm && (
                    <>
                        <MenuDivider />
                        <MenuItem text="Center at SYMM atom" onClick={() => handleAction('centerAtSymm')} />
                        <MenuItem text="Create SYMM mol..." disabled />
                    </>
                )}
            </Menu>
        </div>
    );
};
