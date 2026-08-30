/**
 * @file worker/server/services/apbs/run.ts
 * @description Running a job: start, poll, cancel.
 *
 * Two external programs run in sequence -- pdb2pqr assigns charges and radii,
 * apbs solves on the grid -- each a `ProcessManager` task that outlives the
 * call that started it. The poll timer advances the phases, reports progress,
 * and loads the resulting map into the scene at the end.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProcessManager } from '@cuemol/core/src/wrappers/ProcessManager';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { OpenDXPotReader } from '@cuemol/core/src/wrappers/OpenDXPotReader';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import {
    type ApbsUpdatePhase,
    type CalcApbsStartArgs,
    type CalcApbsStartResult,
    type CalcApbsCancelArgs,
    type CalcApbsCancelResult,
} from '@renderer/worker/shared/apbsTypes';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from '../withUndoTxn';
import type { ApbsJobEntry } from './types';
import { POLL_MS, TASK_QUEUED, TASK_RUNNING } from './types';
import { cleanupDir, emit, failJob, jobs, nextJobId, stopTimer } from './jobs';
import { computeGrid, positiveOr } from './grid';
import {
    buildApbsIn,
    buildPdb2pqrArgs,
    expandTilde,
    fileNonEmpty,
    quote,
    writePdb,
    writePqr,
} from './inputFiles';
import { uniqName } from './naming';
/** Load the APBS `.dx` output as an ElePotMap object under one undo txn. */
export function loadPotFile(
  ctx: WorkerContext,
  entry: ApbsJobEntry,
): { id: number; name: string } {
  const scene = getSceneOrNull(ctx, entry.sceneId);
  if (!scene) throw new Error('scene not found');

  const reader = ctx.strMgr.createHandler('apbs', 0) as unknown as OpenDXPotReader;
  reader.setPath(entry.potPath);

  let newObjId = -1;
  withUndoTxn(scene, 'Open APBS pot file', () => {
    const newObj = reader.createDefaultObj() as unknown as CueMolObject;
    reader.attach(newObj);
    reader.read();
    reader.detach();

    (newObj as unknown as { name: string }).name = entry.elepotName;
    scene.addObject(newObj);
    (newObj as unknown as { forceEmbed: () => void }).forceEmbed();
    newObjId = (newObj as unknown as { uid: number }).uid;

    const rend = newObj.createRenderer('*unitcell') as unknown as { name: string };
    rend.name = 'unitcell';
  });

  if (newObjId < 0) throw new Error('failed to create ElePotMap object');
  return { id: newObjId, name: entry.elepotName };
}

/** One poll tick: advance the job's process state machine. */
export function pollJob(ctx: WorkerContext, entry: ApbsJobEntry): void {
  if (entry.cancelled) return;
  const pm = ctx.svc.getService('ProcessManager') as ProcessManager;

  const status = pm.getTaskStatus(entry.taskId);
  // getResultOutput also moves an ended task out of its slot.
  const out = pm.getResultOutput(entry.taskId);
  const running = status === TASK_QUEUED || status === TASK_RUNNING;

  const statusLine = entry.phase === 'pqr' ? 'Running pdb2pqr...' : 'Running APBS...';
  if (running) {
    emit(ctx, {
      type: 'progress',
      jobId: entry.jobId,
      phase: entry.phase,
      status: statusLine,
      logChunk: out || undefined,
    });
    return;
  }

  // The current task has ended.
  if (entry.phase === 'pqr') {
    if (!fileNonEmpty(entry.pqrPath)) {
      failJob(ctx, entry, 'pdb2pqr failed: no PQR file produced');
      return;
    }
    // pdb2pqr done -- queuing APBS is what advances the ProcessManager queue.
    // cwd = temp dir so APBS's `io.mc` log-capture file is contained + cleaned.
    const atid = pm.queueTask2(entry.apbsExe, quote(entry.apbsInPath), '', entry.workDir);
    if (atid < 0) {
      failJob(ctx, entry, 'ProcessManager could not queue APBS');
      return;
    }
    entry.phase = 'apbs';
    entry.taskId = atid;
    emit(ctx, {
      type: 'progress',
      jobId: entry.jobId,
      phase: 'apbs',
      status: 'Running APBS...',
      logChunk: out || undefined,
    });
    return;
  }

  // APBS phase ended.
  if (!fileNonEmpty(entry.potPath)) {
    failJob(ctx, entry, 'APBS calculation failed: no potential map produced');
    return;
  }
  let loaded: { id: number; name: string };
  try {
    loaded = loadPotFile(ctx, entry);
  } catch (e) {
    failJob(ctx, entry, `Failed to load APBS potential map: ${String(e)}`);
    return;
  }
  stopTimer(entry);
  jobs.delete(entry.jobId);
  cleanupDir(entry.workDir);
  emit(ctx, {
    type: 'complete',
    jobId: entry.jobId,
    newObjId: loaded.id,
    newObjName: loaded.name,
    elapsedSec: (Date.now() - entry.startedAt) / 1000,
  });
}

/** Start an APBS potential calculation job. */
export function calcApbsStart(
  ctx: WorkerContext,
  args: CalcApbsStartArgs,
): CalcApbsStartResult {
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return { ok: false, jobId: '', error: 'scene not found' };
  const mol = scene.getObject(args.objId) as unknown as MolCoord | null;
  if (!mol) return { ok: false, jobId: '', error: 'molecule not found' };

  const apbsExe = expandTilde(args.binaries.apbsExe);
  if (!args.binaries.apbsExe || !fs.existsSync(apbsExe)) {
    return {
      ok: false,
      jobId: '',
      error: `APBS executable not found: ${args.binaries.apbsExe || '(unset)'}`,
    };
  }
  const pdb2pqrExe = expandTilde(args.binaries.pdb2pqrExe);
  if (
    args.chargeMethod === 'pdb2pqr' &&
    (!args.binaries.pdb2pqrExe || !fs.existsSync(pdb2pqrExe))
  ) {
    return {
      ok: false,
      jobId: '',
      error: `pdb2pqr executable not found: ${args.binaries.pdb2pqrExe || '(unset)'}`,
    };
  }

  const hasSel = args.selStr.trim() !== '';
  const sel = makeSel(ctx, hasSel ? args.selStr : '', scene.uid);
  if (!sel) return { ok: false, jobId: '', error: 'invalid selection' };
  const selForWrite = hasSel ? (sel as unknown as MolSelection) : null;

  const molName = (mol as unknown as { name: string }).name ?? 'mol';
  const elepotName =
    args.elepotName.trim() !== ''
      ? args.elepotName.trim()
      : uniqName(`pot_${molName}`, (n) => !!scene.getObjectByName(n));

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-apbs-'));
  const pqrPath = path.join(workDir, 'apbs_tmp.pqr');
  const pdbPath = path.join(workDir, 'apbs_tmp.pdb');
  const apbsInPath = path.join(workDir, 'apbs_tmp.in');
  const potBase = path.join(workDir, 'apbs_pot');
  const potPath = `${potBase}.dx`;

  let phase: ApbsUpdatePhase;
  let taskId: number;
  try {
    const grid = computeGrid(mol, selForWrite, args.gridSpacing);
    const dat = buildApbsIn(pqrPath, potBase, grid, {
      useNpbe: args.useNpbe,
      pdie: positiveOr(args.protDielec, 2.0),
      sdie: positiveOr(args.waterDielec, 78.54),
      temp: positiveOr(args.temperature, 298.15),
    });
    fs.writeFileSync(apbsInPath, dat);

    const pm = ctx.svc.getService('ProcessManager') as ProcessManager;
    if (pm.getSlotSize() < 1) pm.setSlotSize(1);

    if (args.chargeMethod === 'internal') {
      writePqr(ctx, mol, selForWrite, pqrPath, args.useHydrogen);
      // Run APBS with the temp dir as cwd so its `io.mc` log-capture file lands
      // there (and is cleaned up) instead of polluting the app directory.
      taskId = pm.queueTask2(apbsExe, quote(apbsInPath), '', workDir);
      if (taskId < 0) throw new Error('ProcessManager could not queue APBS');
      phase = 'apbs';
    } else {
      writePdb(ctx, mol, selForWrite, pdbPath);
      const p2pArgs = buildPdb2pqrArgs(args.forceField, pdbPath, pqrPath);
      taskId = pm.queueTask2(pdb2pqrExe, p2pArgs, '', workDir);
      if (taskId < 0) throw new Error('ProcessManager could not queue pdb2pqr');
      phase = 'pqr';
    }
  } catch (e) {
    cleanupDir(workDir);
    return { ok: false, jobId: '', error: String(e) };
  }

  const jobId = nextJobId();
  const entry: ApbsJobEntry = {
    jobId,
    workDir,
    phase,
    taskId,
    apbsExe,
    apbsInPath,
    pqrPath,
    potPath,
    sceneId: args.sceneId,
    elepotName,
    startedAt: Date.now(),
    timer: null,
    cancelled: false,
  };
  jobs.set(jobId, entry);
  emit(ctx, {
    type: 'progress',
    jobId,
    phase,
    status: phase === 'pqr' ? 'Running pdb2pqr...' : 'Running APBS...',
  });
  entry.timer = setInterval(() => {
    try {
      pollJob(ctx, entry);
    } catch (e) {
      failJob(ctx, entry, String(e));
    }
  }, POLL_MS);

  return { ok: true, jobId };
}

/** Cancel a running APBS job. */
export function calcApbsCancel(
  ctx: WorkerContext,
  args: CalcApbsCancelArgs,
): CalcApbsCancelResult {
  const entry = jobs.get(args.jobId);
  if (!entry) return { ok: false };
  entry.cancelled = true;
  stopTimer(entry);
  jobs.delete(entry.jobId);
  if (entry.taskId >= 0) {
    try {
      (ctx.svc.getService('ProcessManager') as ProcessManager).kill(entry.taskId);
    } catch {
      /* ignore */
    }
  }
  cleanupDir(entry.workDir);
  return { ok: true };
}

/**
 * Cancel every APBS job still in flight. Same reasoning as
 * cancelAllRenderJobs: apbs / pdb2pqr run as external processes that outlive
 * the app unless they are killed.
 *
 * @returns how many jobs were cancelled.
 */
export function cancelAllApbsJobs(ctx: WorkerContext): number {
  const ids = [...jobs.keys()];
  for (const jobId of ids) {
    try {
      calcApbsCancel(ctx, { jobId });
    } catch (e) {
      console.warn(`calcApbsCancel(${jobId}) failed during shutdown:`, e);
    }
  }
  return ids.length;
}
