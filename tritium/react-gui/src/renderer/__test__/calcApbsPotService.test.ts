/**
 * Degrade-detection tests for `calcApbsStart` / `calcApbsCancel` (worker service
 * backing the UXP "APBS elepot calculation" tool dialog, `tools/apbs-calcpot`).
 *
 * Pins the wire contract:
 *   - the pdb2pqr method writes a PDB via `createHandler('pdb', 1)` and queues
 *     pdb2pqr with `queueTask2(exe, "... --ff CHARMM \"in\" \"out\"", "", wdir)`,
 *     WITHOUT queuing APBS yet (phase = pqr)
 *   - the internal method writes a PQR via `createHandler('pqr', 1)` with the
 *     hydrogen flag and queues APBS directly (`queueTask`), no pdb2pqr
 *   - the poll loop queues APBS via `queueTask` only after pdb2pqr ends (the
 *     ProcessManager queue is not chained by `waitfor` inside the worker)
 *   - once APBS ends, the `.dx` is loaded via `createHandler('apbs', 0)` and the
 *     new object + `*unitcell` renderer are created inside an
 *     "Open APBS pot file" undo txn, then a `complete` update is pushed
 *   - a missing executable path fails fast without queuing anything
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { APBS_PROGRESS_CHANNEL, type CalcApbsStartArgs } from '@renderer/worker/shared/apbsTypes'

vi.mock('fs', () => ({
    mkdtempSync: vi.fn(() => '/tmp/cuemol-apbs-test'),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 128 })),
    rmSync: vi.fn(),
}))
vi.mock('os', () => ({
    platform: vi.fn(() => 'linux'),
    tmpdir: vi.fn(() => '/tmp'),
    homedir: vi.fn(() => '/home/user'),
}))
vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import * as fs from 'fs'
import { services } from '@renderer/worker/server/services/apbs/apbs.service'

const { calcApbsStart, calcApbsCancel } = services
const POLL_MS = 300

// --- Test doubles ---

function makeReaderWriters() {
    let capturedUseH: boolean | undefined
    const pdbWriter = {
        sel: undefined as unknown,
        setPath: vi.fn(),
        attach: vi.fn(),
        write: vi.fn(),
        detach: vi.fn(),
    }
    const pqrWriter = {
        set use_H(v: boolean) {
            capturedUseH = v
        },
        get use_H() {
            return capturedUseH as boolean
        },
        sel: undefined as unknown,
        setPath: vi.fn(),
        attach: vi.fn(),
        write: vi.fn(),
        detach: vi.fn(),
    }
    const potRend = { name: '' }
    const potObj = {
        name: '',
        uid: 777,
        forceEmbed: vi.fn(),
        createRenderer: vi.fn(() => potRend),
    }
    const apbsReader = {
        setPath: vi.fn(),
        createDefaultObj: vi.fn(() => potObj),
        attach: vi.fn(),
        read: vi.fn(),
        detach: vi.fn(),
    }
    return {
        pdbWriter,
        pqrWriter,
        apbsReader,
        potObj,
        potRend,
        getUseH: () => capturedUseH,
    }
}

function makeCtx(opts?: { mol?: unknown }) {
    const sid = 100
    const mol = opts?.mol ?? {
        name: '1crn',
        getBoundBoxMin: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
        getBoundBoxMax: vi.fn(() => ({ x: 30, y: 30, z: 30 })),
    }
    const scene = {
        uid: sid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn((id: number) => (id === 1 ? mol : null)),
        getObjectByName: vi.fn(() => null),
        addObject: vi.fn(),
    }
    const pm = {
        getSlotSize: vi.fn(() => 4),
        setSlotSize: vi.fn(),
        queueTask: vi.fn((_exe: string, _args: string, _wait: string) => 42),
        queueTask2: vi.fn(
            (_exe: string, _args: string, _wait: string, _wdir: string) => 41,
        ),
        getTaskStatus: vi.fn(() => 2), // 2 = ended
        getResultOutput: vi.fn(() => ''),
        kill: vi.fn(),
    }
    const rw = makeReaderWriters()
    const createHandler = vi.fn((nick: string) => {
        if (nick === 'pdb') return rw.pdbWriter
        if (nick === 'pqr') return rw.pqrWriter
        if (nick === 'apbs') return rw.apbsReader
        return null
    })
    const pushed: unknown[] = []
    const ctx = {
        sceMgr: { getScene: vi.fn((id: number) => (id === sid ? scene : null)) },
        strMgr: { createHandler },
        svc: {
            getService: vi.fn(() => pm),
            pushMessage: vi.fn((_ch: string, u: unknown) => pushed.push(u)),
        },
    } as unknown as WorkerContext
    return { ctx, scene, pm, rw, pushed, sceneId: sid }
}

function baseArgs(over?: Partial<CalcApbsStartArgs>): CalcApbsStartArgs {
    return {
        sceneId: 100,
        objId: 1,
        selStr: '',
        elepotName: '',
        chargeMethod: 'pdb2pqr',
        forceField: 'charmm',
        useHydrogen: false,
        useNpbe: false,
        temperature: 298.15,
        gridSpacing: 1.0,
        waterDielec: 78.54,
        protDielec: 2.0,
        binaries: { apbsExe: '/opt/apbs', pdb2pqrExe: '/opt/pdb2pqr' },
        ...over,
    }
}

describe('calcApbsStart', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        ;(fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true)
        ;(fs.statSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ size: 128 })
    })
    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
    })

    it('pdb2pqr method: writes PDB and queues pdb2pqr, not APBS', () => {
        const { ctx, pm, rw } = makeCtx()
        const res = calcApbsStart(ctx, baseArgs({ chargeMethod: 'pdb2pqr' }))

        expect(res.ok).toBe(true)
        // PDB written for pdb2pqr input.
        expect(rw.pdbWriter.write).toHaveBeenCalledTimes(1)
        // pdb2pqr queued with cwd; APBS not queued yet.
        expect(pm.queueTask2).toHaveBeenCalledTimes(1)
        expect(pm.queueTask).not.toHaveBeenCalled()
        const [exe, argStr, waitfor, wdir] = pm.queueTask2.mock.calls[0]
        expect(exe).toBe('/opt/pdb2pqr')
        expect(argStr).toContain('--ff CHARMM')
        expect(argStr).toContain('"/tmp/cuemol-apbs-test/apbs_tmp.pdb"')
        expect(argStr).toContain('"/tmp/cuemol-apbs-test/apbs_tmp.pqr"')
        expect(waitfor).toBe('')
        expect(wdir).toBe('/tmp/cuemol-apbs-test')
        // apbs.in written with the linear PBE + dielectric defaults.
        const inWrite = (fs.writeFileSync as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(inWrite[1]).toContain('lpbe')
        expect(inWrite[1]).toContain('pdie 2')
        expect(inWrite[1]).toContain('sdie 78.54')
    })

    it('internal method: writes PQR with hydrogen flag and queues APBS directly', () => {
        const { ctx, pm, rw } = makeCtx()
        const res = calcApbsStart(
            ctx,
            baseArgs({ chargeMethod: 'internal', useHydrogen: true }),
        )

        expect(res.ok).toBe(true)
        expect(rw.pqrWriter.write).toHaveBeenCalledTimes(1)
        expect(rw.getUseH()).toBe(true)
        // APBS queued directly (queueTask2 with the temp dir as cwd); no pdb2pqr.
        expect(pm.queueTask2).toHaveBeenCalledTimes(1)
        expect(pm.queueTask).not.toHaveBeenCalled()
        expect(pm.queueTask2.mock.calls[0][0]).toBe('/opt/apbs')
        expect(pm.queueTask2.mock.calls[0][3]).toBe('/tmp/cuemol-apbs-test')
    })

    it('poll: queues APBS after pdb2pqr ends, then loads the .dx under an undo txn', () => {
        const { ctx, scene, pm, rw, pushed } = makeCtx()
        calcApbsStart(ctx, baseArgs({ chargeMethod: 'pdb2pqr' }))
        // Only pdb2pqr is queued so far (queueTask2 with a cwd); APBS is not.
        expect(pm.queueTask2.mock.calls.some((c) => c[0] === '/opt/apbs')).toBe(false)

        // Tick 1: pdb2pqr ended -> APBS queued (queue advanced by queueTask2),
        // with the temp dir as cwd so `io.mc` is contained.
        vi.advanceTimersByTime(POLL_MS)
        const apbsCall = pm.queueTask2.mock.calls.find((c) => c[0] === '/opt/apbs')
        expect(apbsCall).toBeTruthy()
        expect(apbsCall![3]).toBe('/tmp/cuemol-apbs-test')

        // Tick 2: APBS ended -> load .dx as ElePotMap under a txn.
        vi.advanceTimersByTime(POLL_MS)
        expect(ctx.strMgr.createHandler).toHaveBeenCalledWith('apbs', 0)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Open APBS pot file')
        expect(rw.apbsReader.read).toHaveBeenCalledTimes(1)
        expect(scene.addObject).toHaveBeenCalledWith(rw.potObj)
        expect(rw.potObj.forceEmbed).toHaveBeenCalledTimes(1)
        expect(rw.potObj.createRenderer).toHaveBeenCalledWith('*unitcell')
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)

        const complete = pushed.find(
            (u) => (u as { type: string }).type === 'complete',
        ) as { newObjId: number } | undefined
        expect(complete?.newObjId).toBe(777)
    })

    it('names the new object pot_<mol> when no name is given', () => {
        const { ctx, rw } = makeCtx()
        calcApbsStart(ctx, baseArgs({ chargeMethod: 'internal', elepotName: '' }))
        vi.advanceTimersByTime(POLL_MS) // internal -> single APBS phase, loads on tick 1
        expect(rw.potObj.name).toBe('pot_1crn')
    })

    it('fails fast when the APBS executable is missing (nothing queued)', () => {
        const { ctx, pm } = makeCtx()
        ;(fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
        const res = calcApbsStart(ctx, baseArgs())
        expect(res.ok).toBe(false)
        expect(res.error).toContain('APBS executable not found')
        expect(pm.queueTask).not.toHaveBeenCalled()
        expect(pm.queueTask2).not.toHaveBeenCalled()
    })

    it('pushes an apbs-progress channel update on start', () => {
        const { ctx } = makeCtx()
        calcApbsStart(ctx, baseArgs())
        expect(
            (ctx.svc.pushMessage as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
        ).toBe(APBS_PROGRESS_CHANNEL)
    })
})

describe('calcApbsCancel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
    })

    it('kills the running task and stops the job', () => {
        const { ctx, pm } = makeCtx()
        const res = calcApbsStart(ctx, baseArgs({ chargeMethod: 'internal' }))
        const cancelRes = calcApbsCancel(ctx, { jobId: res.jobId })
        expect(cancelRes.ok).toBe(true)
        expect(pm.kill).toHaveBeenCalled()
        // The poll timer is stopped: advancing does not load anything.
        vi.advanceTimersByTime(POLL_MS * 3)
        expect(ctx.strMgr.createHandler).not.toHaveBeenCalledWith('apbs', 0)
    })
})
