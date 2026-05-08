// Runs in renderer thread. Calls cross to worker via transport.invokeService.
import { WorkerTransport } from '../WorkerTransport';
import type { NaviClickAtomResult, NaviHitTestResult, NaviResidSelResult } from '../../server/services/naviTool.service';

export async function naviHitTest(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number },
): Promise<NaviHitTestResult | null> {
    return await transport.invokeService('naviHitTest', args);
}

export async function naviClickAtom(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number },
): Promise<NaviClickAtomResult | null> {
    return await transport.invokeService('naviClickAtom', args);
}

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

export async function naviCenterAt(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number; z: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCenterAt', args);
}

export async function naviCenterAtSymm(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; rendId: number; atomId: number; symmId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCenterAtSymm', args);
}

export async function naviCtxSelect(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol' },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxSelect', args);
}

export async function naviCtxAddSelect(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol' },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxAddSelect', args);
}

export async function naviCtxUnselect(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxUnselect', args);
}

export async function naviCtxInvertSel(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxInvertSel', args);
}

export async function naviCtxToggleSidechain(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxToggleSidechain', args);
}

export async function naviCtxAround(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; distance: number; byres: boolean },
): Promise<{ ok: boolean } | null> {
    return await transport.invokeService('naviCtxAround', args);
}
