/**
 * @file shared/naviCtxMenu.ts
 * @description Template for the 3D-view atom right-click ("navi") context
 * menu, as platform-neutral `MenuNode`s. One source feeds both presentation
 * paths: the React `MenuPanel` on Windows / Linux (renderer) and the native
 * Electron menu on macOS (`main/naviContextMenu.ts` via `toElectronTemplate`).
 */
import type { MenuNode } from './menuNodes'
import type { NaviCtxAction, NaviCtxMenuPayload } from './ipcTypes'

type Node = MenuNode<NaviCtxAction>

/** Build the navi context-menu nodes for the clicked atom / renderer. */
export function buildNaviCtxMenuNodes(payload: Omit<NaviCtxMenuPayload, 'x' | 'y'>): Node[] {
  const aroundByresSubmenu: Node[] = [
    { label: '3 Å', action: 'arByres3' },
    { label: '5 Å', action: 'arByres5' },
    { label: '7 Å', action: 'arByres7' },
    { label: '10 Å', action: 'arByres10' },
  ]

  const aroundSubmenu: Node[] = [
    { label: '3 Å', action: 'around3' },
    { label: '5 Å', action: 'around5' },
    { label: '7 Å', action: 'around7' },
    { label: '10 Å', action: 'around10' },
  ]

  return [
    { label: payload.atomLabel, enabled: false },
    { label: payload.rendLabel, enabled: false },
    ...(payload.isSymm && payload.symmLabel
      ? [{ label: `symop: ${payload.symmLabel}`, enabled: false } as Node]
      : []),
    { type: 'separator' },
    { label: 'Center at this atom', action: 'centerAt' },
    { type: 'separator' },
    { label: 'Select Atom', action: 'selectAtom' },
    { label: 'Select Residue', action: 'selectResid' },
    { label: 'Select Chain', action: 'selectChain' },
    { label: 'Select Molecule', action: 'selectMol' },
    { type: 'separator' },
    { label: 'Add Select Atom', action: 'addSelectAtom' },
    { label: 'Add Select Residue', action: 'addSelectResid' },
    { label: 'Add Select Chain', action: 'addSelectChain' },
    { type: 'separator' },
    { label: 'Unselect', action: 'unselect' },
    { label: 'Invert Selection', action: 'invertSel' },
    { label: 'Toggle Sidechain', action: 'toggleSidechain' },
    { type: 'separator' },
    { label: 'Around Byres', submenu: aroundByresSubmenu },
    { label: 'Around', submenu: aroundSubmenu },
    ...(payload.isSymm
      ? [
          { type: 'separator' } as Node,
          { label: 'Center at SYMM atom', action: 'centerAtSymm' } as Node,
          { label: 'Create SYMM mol...', enabled: false } as Node,
        ]
      : []),
  ]
}
