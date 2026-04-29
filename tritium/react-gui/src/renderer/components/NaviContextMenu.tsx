import React, { useEffect, useRef } from 'react';
import { Menu, MenuItem, MenuDivider } from '@blueprintjs/core';
import type { HitTestResult } from '../types/HitTestResult';

export interface NaviContextMenuState {
    open: boolean;
    x: number;
    y: number;
    hitres: HitTestResult | null;
}

interface NaviContextMenuProps {
    state: NaviContextMenuState;
    onClose: () => void;
}

export const NaviContextMenu: React.FC<NaviContextMenuProps> = ({ state, onClose }) => {
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

    if (!state.open || !state.hitres) return null;

    const hit = state.hitres;
    const isSymm = hit.rendtype === '*symm';

    const atomLabel = hit.obj_name ? `${hit.obj_name}: ${hit.message}` : hit.message;
    const rendLabel = `${hit.rend_name} (${hit.rendtype})`;

    const handleAction = (action: string): void => {
        console.log(`TODO: navi context menu action "${action}" for obj=${hit.obj_id} atom=${hit.atom_id}`);
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
                        <MenuItem text="Create SYMM mol..." onClick={() => handleAction('createSymm')} />
                    </>
                )}
            </Menu>
        </div>
    );
};
