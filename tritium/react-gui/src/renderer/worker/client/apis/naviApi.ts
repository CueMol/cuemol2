/**
 * @file renderer/worker/client/apis/naviApi.ts
 * @description Renderer-thread thin wrappers for the worker `naviTool`
 * services. These drive the on-canvas picker / selection / center
 * gestures exposed by the navigation toolbar and atom context menu.
 *
 * Coordinates `x` / `y` are in canvas-local CSS pixels; `viewId` selects
 * the active view. Every call returns the worker reply or `null` on
 * transport failure.
 */
import { WorkerTransport } from '../WorkerTransport';
import type { NaviClickAtomResult, NaviHitTestResult, NaviResidSelResult } from '../../server/services/naviTool.service';

/**
 * Test whether the cursor at `(x, y)` hits anything renderable in the
 * view. Returns the raw hit-test record for downstream tools.
 *
 * @param transport - Worker transport.
 * @param args - `{ viewId, x, y }` canvas-local coordinates.
 */
export async function naviHitTest(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number },
): Promise<NaviHitTestResult | null> {
    return await transport.invokeService('naviHitTest', args);
}

/**
 * Handle an atom-pick click. Updates the status-bar message with the
 * picked atom identification.
 *
 * @param transport - Worker transport.
 * @param args - `{ viewId, x, y }` canvas-local coordinates.
 */
export async function naviClickAtom(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number },
): Promise<NaviClickAtomResult | null> {
    return await transport.invokeService('naviClickAtom', args);
}

/**
 * Toggle / extend the residue selection at the picked atom.
 *
 * @param transport - Worker transport.
 * @param args - Pick coordinates plus `mode` (`'toggle'` adds/removes a
 *   single residue, `'extend'` extends from `prevObjId` / `prevAtomId`).
 */
export async function naviResidSel(
    transport: WorkerTransport,
    args: {
        viewId: number; x: number; y: number;
        mode: 'toggle' | 'extend';
        prevObjId?: number; prevAtomId?: number;
    },
): Promise<NaviResidSelResult | null> {
    return await transport.invokeService('naviResidSel', args);
}

/**
 * Move the view center to the world coordinate at `(x, y, z)` under the
 * cursor (z is the depth probed by hit-test).
 *
 * @param transport - Worker transport.
 * @param args - View uid and world-space `(x, y, z)`.
 */
export async function naviCenterAt(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number; z: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCenterAt', args);
}

/**
 * Move the view center to a symmetry mate's image of an atom.
 *
 * @param transport - Worker transport.
 * @param args - View uid, object / renderer / atom ids, and `symmId` (the
 *   crystallographic symmetry index).
 */
export async function naviCenterAtSymm(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; rendId: number; atomId: number; symmId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCenterAtSymm', args);
}

/**
 * Atom context-menu "select" handler. Replaces the current selection on
 * the object with atoms matching `mode`.
 *
 * @param transport - Worker transport.
 * @param args - Picked atom plus selection granularity (`'atom'`,
 *   `'residue'`, `'chain'`, `'mol'`).
 */
export async function naviCtxSelect(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol' },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxSelect', args);
}

/**
 * Atom context-menu "add to selection" handler. Adds atoms to the
 * existing selection rather than replacing it.
 *
 * @param transport - Worker transport.
 * @param args - Same shape as {@link naviCtxSelect}.
 */
export async function naviCtxAddSelect(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol' },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxAddSelect', args);
}

/**
 * Clear the selection on the picked object.
 *
 * @param transport - Worker transport.
 * @param args - `{ viewId, objId }`.
 */
export async function naviCtxUnselect(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxUnselect', args);
}

/**
 * Invert the selection on the picked object.
 *
 * @param transport - Worker transport.
 * @param args - `{ viewId, objId }`.
 */
export async function naviCtxInvertSel(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxInvertSel', args);
}

/**
 * Toggle the side-chain selection on the picked object.
 *
 * @param transport - Worker transport.
 * @param args - `{ viewId, objId }`.
 */
export async function naviCtxToggleSidechain(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxToggleSidechain', args);
}

/**
 * "Select within N angstroms" context-menu handler.
 *
 * @param transport - Worker transport.
 * @param args - Object uid, sphere radius `distance` in angstroms, and
 *   `byres` (true = expand to whole residues).
 */
export async function naviCtxAround(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; distance: number; byres: boolean },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxAround', args);
}
