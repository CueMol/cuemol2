/**
 * @file worker/server/services/navi/navi.service.ts
 * @description Picking and measuring in the 3D view: the registry entry.
 *
 * These are the services behind a click in the view. Each takes a hit test
 * result and acts on what was under the pointer, which is why they are
 * grouped by the interaction rather than by what they change.
 */

import { bondEditListBonds, bondEditPick, bondEditRemoveBond, bondEditReset } from './bondEdit';
import { measureListTargets, measurePick, measureReset } from './measure';
import { naviCenterAt, naviCenterAtSymm, naviCtxAddSelect, naviCtxAround, naviCtxInvertSel, naviCtxSelect, naviCtxToggleSidechain, naviCtxUnselect } from './naviCtxtMenu';
import { naviClickAtom, naviHitTest, naviResidSel } from './naviTool';

export const services = {
    bondEditPick,
    bondEditReset,
    bondEditListBonds,
    bondEditRemoveBond,
    measurePick,
    measureReset,
    measureListTargets,
    naviCenterAt,
    naviCenterAtSymm,
    naviCtxSelect,
    naviCtxAddSelect,
    naviCtxUnselect,
    naviCtxInvertSel,
    naviCtxToggleSidechain,
    naviCtxAround,
    naviHitTest,
    naviClickAtom,
    naviResidSel,
};

export type * from './bondEdit';
export type * from './measure';
export type * from './naviCtxtMenu';
export type * from './naviTool';
