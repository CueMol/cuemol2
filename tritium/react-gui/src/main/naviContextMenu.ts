import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import type { NaviCtxAction, NaviCtxMenuPayload } from '../shared/ipcTypes'

export function showNaviContextMenu(
  mainWindow: BrowserWindow,
  payload: NaviCtxMenuPayload,
): Promise<NaviCtxAction | null> {
  return new Promise((resolve) => {
    let chosen: NaviCtxAction | null = null

    const action = (a: NaviCtxAction): MenuItemConstructorOptions['click'] =>
      () => { chosen = a }

    const aroundByresSubmenu: MenuItemConstructorOptions[] = [
      { label: '3 Å', click: action('arByres3') },
      { label: '5 Å', click: action('arByres5') },
      { label: '7 Å', click: action('arByres7') },
      { label: '10 Å', click: action('arByres10') },
    ]

    const aroundSubmenu: MenuItemConstructorOptions[] = [
      { label: '3 Å', click: action('around3') },
      { label: '5 Å', click: action('around5') },
      { label: '7 Å', click: action('around7') },
      { label: '10 Å', click: action('around10') },
    ]

    const template: MenuItemConstructorOptions[] = [
      { label: payload.atomLabel, enabled: false },
      { label: payload.rendLabel, enabled: false },
      ...(payload.isSymm && payload.symmLabel
        ? [{ label: `symop: ${payload.symmLabel}`, enabled: false } as MenuItemConstructorOptions]
        : []),
      { type: 'separator' },
      { label: 'Center at this atom', click: action('centerAt') },
      { type: 'separator' },
      { label: 'Select Atom', click: action('selectAtom') },
      { label: 'Select Residue', click: action('selectResid') },
      { label: 'Select Chain', click: action('selectChain') },
      { label: 'Select Molecule', click: action('selectMol') },
      { type: 'separator' },
      { label: 'Add Select Atom', click: action('addSelectAtom') },
      { label: 'Add Select Residue', click: action('addSelectResid') },
      { label: 'Add Select Chain', click: action('addSelectChain') },
      { type: 'separator' },
      { label: 'Unselect', click: action('unselect') },
      { label: 'Invert Selection', click: action('invertSel') },
      { label: 'Toggle Sidechain', click: action('toggleSidechain') },
      { type: 'separator' },
      { label: 'Around Byres', submenu: aroundByresSubmenu },
      { label: 'Around', submenu: aroundSubmenu },
      ...(payload.isSymm
        ? [
            { type: 'separator' } as MenuItemConstructorOptions,
            { label: 'Center at SYMM atom', click: action('centerAtSymm') } as MenuItemConstructorOptions,
            { label: 'Create SYMM mol...', enabled: false } as MenuItemConstructorOptions,
          ]
        : []),
    ]

    const menu = Menu.buildFromTemplate(template)
    menu.popup({
      window: mainWindow,
      x: Math.round(payload.x),
      y: Math.round(payload.y),
      callback: () => resolve(chosen),
    })
  })
}
