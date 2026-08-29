/**
 * @file shared/types/naviCtxMenu.ts
 * @description Native viewport (3D view) context menu actions and payload.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

export type NaviCtxAction =
  | 'centerAt'
  | 'centerAtSymm'
  | 'createSymmMol'
  | 'selectAtom'
  | 'selectResid'
  | 'selectChain'
  | 'selectMol'
  | 'addSelectAtom'
  | 'addSelectResid'
  | 'addSelectChain'
  | 'unselect'
  | 'invertSel'
  | 'toggleSidechain'
  | 'arByres3'
  | 'arByres5'
  | 'arByres7'
  | 'arByres10'
  | 'around3'
  | 'around5'
  | 'around7'
  | 'around10'

export interface NaviCtxMenuPayload {
  x: number
  y: number
  isSymm: boolean
  atomLabel: string
  rendLabel: string
  symmLabel?: string
}
