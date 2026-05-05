import { WorkerTransport } from '../WorkerTransport';

export async function naviHitTest(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number },
): Promise<{ hit: boolean; raw?: any } | null> {
    const result = await transport.invokeWorker('naviHitTest', args);
    return result?.[0] ?? null;
}

export async function naviClickAtom(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number },
): Promise<{ handled: boolean; statusMessage?: string; hitres?: any } | null> {
    const result = await transport.invokeWorker('naviClickAtom', args);
    return result?.[0] ?? null;
}

export async function naviResidSel(
    transport: WorkerTransport,
    args: {
        viewId: number; x: number; y: number;
        mode: 'toggle' | 'extend';
        prevObjId?: number; prevAtomId?: number;
    },
): Promise<{ handled: boolean; objId?: number; atomId?: number } | null> {
    const result = await transport.invokeWorker('naviResidSel', args);
    return result?.[0] ?? null;
}

export async function naviCenterAt(
    transport: WorkerTransport, args: { viewId: number; x: number; y: number; z: number },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCenterAt', args);
    return result?.[0] ?? null;
}

export async function naviCenterAtSymm(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; rendId: number; atomId: number; symmId: number },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCenterAtSymm', args);
    return result?.[0] ?? null;
}

export async function naviCtxSelect(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol' },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCtxSelect', args);
    return result?.[0] ?? null;
}

export async function naviCtxAddSelect(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol' },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCtxAddSelect', args);
    return result?.[0] ?? null;
}

export async function naviCtxUnselect(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCtxUnselect', args);
    return result?.[0] ?? null;
}

export async function naviCtxInvertSel(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCtxInvertSel', args);
    return result?.[0] ?? null;
}

export async function naviCtxToggleSidechain(
    transport: WorkerTransport, args: { viewId: number; objId: number },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCtxToggleSidechain', args);
    return result?.[0] ?? null;
}

export async function naviCtxAround(
    transport: WorkerTransport,
    args: { viewId: number; objId: number; distance: number; byres: boolean },
): Promise<{ ok: boolean } | null> {
    const result = await transport.invokeWorker('naviCtxAround', args);
    return result?.[0] ?? null;
}
