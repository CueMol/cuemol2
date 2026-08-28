/**
 * @file services/calcApbsPot.service.ts
 * @description Worker service backing the APBS electrostatic-potential tool
 * dialog (`dialog.tool.apbs-calcpot`). Ports UXP `tools/apbs-calcpot.js`:
 *
 *   1. Export the (optionally selection-limited) target molecule to a temp file
 *      -- a PDB for the external pdb2pqr method, or a PQR directly via the
 *      built-in `PQRFileWriter` for the internal method.
 *   2. Compute the APBS grid dimensions from the molecule bounding box and
 *      write an `apbs.in` input file.
 *   3. Run pdb2pqr (if selected) and then APBS as external processes through
 *      the C++ `ProcessManager`, driven by a poll timer.
 *   4. Load the resulting OpenDX `.dx` potential map as an `ElePotMap` object
 *      (with a default `*unitcell` renderer) under one undo txn.
 *
 * The form UI (molecule picker, selection, options) and the external binary
 * paths live client-side (`CalcApbsPotDialog` / `ApbsConfigContext`); this
 * service receives the paths as plain args and holds no path resolution or
 * persistence. Progress is pushed to the renderer over `apbs-progress`.
 *
 * ## Queue ordering
 *
 * `ProcessManager` only advances its queue when `queueTask` is called (its
 * idle-task pump is not driven inside the worker). So the APBS task is NOT
 * chained on pdb2pqr via the `waitfor` dependency; instead the poll loop
 * queues APBS once pdb2pqr has finished -- that `queueTask` call is what starts
 * it. This mirrors the two-phase render pipeline (`renderJob.service.ts`).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ProcessManager } from '@cuemol/core/src/wrappers/ProcessManager';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { PQRFileWriter } from '@cuemol/core/src/wrappers/PQRFileWriter';
import type { PDBFileWriter } from '@cuemol/core/src/wrappers/PDBFileWriter';
import type { OpenDXPotReader } from '@cuemol/core/src/wrappers/OpenDXPotReader';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import {
  APBS_PROGRESS_CHANNEL,
  type ApbsUpdate,
  type ApbsUpdatePhase,
  type CalcApbsStartArgs,
  type CalcApbsStartResult,
  type CalcApbsCancelArgs,
  type CalcApbsCancelResult,
  type ProposeElepotNameArgs,
  type ProposeElepotNameResult,
} from '../../shared/apbsTypes';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

/** Poll interval for process status / stdout. */
const POLL_MS = 300;

/** ProcessManager task states (see LProcMgr). */
const TASK_QUEUED = 0;
const TASK_RUNNING = 1;

/** Grid-derivation constants (UXP `calcGridDim`). */
const COARSE_FACTOR = 1.7;
const FINE_PADDING = 20.0;
const GRID_MULTIPLE = 32;

/** State of one in-flight APBS job. */
interface ApbsJobEntry {
  jobId: string;
  workDir: string;
  /** Current phase. */
  phase: ApbsUpdatePhase;
  /** Task id of the current phase's process (-1 once none). */
  taskId: number;
  /** Expanded APBS executable path, queued after pdb2pqr in the `pqr` phase. */
  apbsExe: string;
  /** APBS input file (`apbs.in`) path. */
  apbsInPath: string;
  /** Expected PQR output path (verified before APBS). */
  pqrPath: string;
  /** Expected `.dx` potential output path (verified before load). */
  potPath: string;
  sceneId: number;
  /** Resolved name for the new ElePotMap object. */
  elepotName: string;
  startedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  cancelled: boolean;
}

const jobs = new Map<string, ApbsJobEntry>();
let jobSeq = 0;

/** Push an APBS update to the renderer. */
function emit(ctx: WorkerContext, update: ApbsUpdate): void {
  ctx.svc.pushMessage(APBS_PROGRESS_CHANNEL, update);
}

/** Expand a leading `~` to the home directory (settings may store `~/...`). */
function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/** Quote a path for a ProcessManager args string (spaces-safe). */
function quote(p: string): string {
  return `"${p}"`;
}

/** Clamp a numeric option to a positive value, falling back to `dflt`. */
function positiveOr(value: number, dflt: number): number {
  return Number.isFinite(value) && value > 0 ? value : dflt;
}

/** Remove a working directory, ignoring errors. */
function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function stopTimer(entry: ApbsJobEntry): void {
  if (entry.timer !== null) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
}

/** True while an existing file has non-zero size. */
function fileNonEmpty(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

/**
 * Pick the first available name from `${prefix}`, `${prefix}(1)`, ... --
 * matches UXP `util.makeUniqName2` / `makeMolSurf.service` `uniqName`.
 */
function uniqName(prefix: string, exists: (name: string) => boolean): string {
  if (!exists(prefix)) return prefix;
  for (let i = 1; i < 10000; i++) {
    const candidate = `${prefix}(${i})`;
    if (!exists(candidate)) return candidate;
  }
  return prefix;
}

/**
 * Suggest the default elepot-object name for a molecule -- a unique
 * `pot_<molname>`, mirroring UXP `makeSugName`. The dialog calls this to
 * prefill the name field when the target molecule changes.
 */
function proposeElepotName(
  ctx: WorkerContext,
  args: ProposeElepotNameArgs,
): ProposeElepotNameResult {
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return { name: '' };
  const mol = scene.getObject(args.objId) as CueMolObject | null;
  if (!mol) return { name: '' };
  const molName = (mol as unknown as { name: string }).name ?? 'mol';
  return { name: uniqName(`pot_${molName}`, (n) => !!scene.getObjectByName(n)) };
}

interface Grid {
  pts: { x: number; y: number; z: number };
  coarse: { x: number; y: number; z: number };
  fine: { x: number; y: number; z: number };
}

/**
 * Derive the APBS mg-auto grid from the molecule bounding box (UXP
 * `calcGridDim`): coarse = box * 1.7, fine = min(coarse, box + 20 A), grid
 * points rounded up to `32 * ceil(fine / spacing / 32) + 1` per axis.
 *
 * @remarks When a selection is used, the bounding box is read with the
 * molecule's `sel` temporarily set to it (UXP swaps `tgtmol.sel` and restores),
 * so the grid is sized to the selected atoms.
 */
function computeGrid(
  mol: MolCoord,
  sel: MolSelection | null,
  spacing: number,
): Grid {
  const anyMol = mol as unknown as {
    sel: MolSelection;
    getBoundBoxMin: (b: boolean) => { x: number; y: number; z: number };
    getBoundBoxMax: (b: boolean) => { x: number; y: number; z: number };
  };

  let min: { x: number; y: number; z: number };
  let max: { x: number; y: number; z: number };
  // Sizing the grid to a selection means borrowing mol.sel for two getter
  // calls. Only do that when the current value can be read back: the restore
  // used to be `if (oldSel)`, so a throwing getter -- or a molecule with no
  // selection -- left the user's selection permanently replaced by the APBS
  // one, outside any undo transaction.
  let oldSel: MolSelection | null = null;
  let canRestore = false;
  if (sel) {
    try {
      oldSel = anyMol.sel;
      canRestore = true;
    } catch {
      canRestore = false;
    }
  }
  if (sel && canRestore) {
    anyMol.sel = sel;
    try {
      const vmin = anyMol.getBoundBoxMin(true);
      const vmax = anyMol.getBoundBoxMax(true);
      min = { x: vmin.x, y: vmin.y, z: vmin.z };
      max = { x: vmax.x, y: vmax.y, z: vmax.z };
    } finally {
      try {
        // Assign back exactly what was read, null included -- the point is to
        // leave mol.sel as it was found.
        (anyMol as { sel: MolSelection | null }).sel = oldSel;
      } catch (e) {
        console.warn('APBS grid: could not restore the molecule selection:', e);
      }
    }
  } else {
    const vmin = anyMol.getBoundBoxMin(false);
    const vmax = anyMol.getBoundBoxMax(false);
    min = { x: vmin.x, y: vmin.y, z: vmin.z };
    max = { x: vmax.x, y: vmax.y, z: vmax.z };
  }

  const dim = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  if (Math.abs(dim.x) < 1e-6 && Math.abs(dim.y) < 1e-6 && Math.abs(dim.z) < 1e-6) {
    throw new Error('molecule bounding box is empty');
  }

  const nden = positiveOr(spacing, 1.0);
  const axis = (d: number) => {
    const coarse = d * COARSE_FACTOR;
    const fine = Math.min(coarse, d + FINE_PADDING);
    const cs = Math.ceil(fine / nden / GRID_MULTIPLE);
    const pts = GRID_MULTIPLE * cs + 1;
    return { coarse, fine, pts };
  };
  const ax = axis(dim.x);
  const ay = axis(dim.y);
  const az = axis(dim.z);
  return {
    pts: { x: ax.pts, y: ay.pts, z: az.pts },
    coarse: { x: ax.coarse, y: ay.coarse, z: az.coarse },
    fine: { x: ax.fine, y: ay.fine, z: az.fine },
  };
}

/** Build the `apbs.in` mg-auto input file (UXP `makeAPBSIn`). */
function buildApbsIn(
  pqrPath: string,
  potBase: string,
  grid: Grid,
  opts: { useNpbe: boolean; pdie: number; sdie: number; temp: number },
): string {
  const g = grid;
  return [
    'read',
    `  mol pqr ${pqrPath}`,
    'end',
    'elec',
    '  mg-auto',
    `  dime ${g.pts.x} ${g.pts.y} ${g.pts.z}`,
    `  cglen ${g.coarse.x} ${g.coarse.y} ${g.coarse.z}`,
    `  fglen ${g.fine.x} ${g.fine.y} ${g.fine.z}`,
    '  mol 1',
    '  cgcent mol 1',
    '  fgcent mol 1',
    `  ${opts.useNpbe ? 'npbe' : 'lpbe'}`,
    '  bcfl sdh',
    `  pdie ${opts.pdie}`,
    `  sdie ${opts.sdie}`,
    `  temp ${opts.temp}`,
    '  chgm spl2',
    '  srad 1.4',
    '  swin 0.3',
    '  sdens 10.0',
    '  srfm smol',
    '  calcenergy no',
    '  calcforce no',
    `  write pot dx ${potBase}`,
    'end',
    'quit',
    '',
  ].join('\n');
}

/** Build the platform-specific pdb2pqr argument string (UXP `submitPdb2Pqr`). */
function buildPdb2pqrArgs(forceField: string, inPath: string, outPath: string): string {
  const ff = forceField.toUpperCase();
  const inp = quote(inPath);
  const outp = quote(outPath);
  if (os.platform() === 'win32') {
    return [ff, inp, outp].join(' ');
  }
  return ['--keep-chain', '--nodebump', '--noopt', '--ff', ff, inp, outp].join(' ');
}

/** Write the target molecule to a PQR file via the built-in PQRFileWriter. */
function writePqr(
  ctx: WorkerContext,
  mol: MolCoord,
  sel: MolSelection | null,
  pqrPath: string,
  useH: boolean,
): void {
  const w = ctx.strMgr.createHandler('pqr', 1) as unknown as PQRFileWriter;
  w.use_H = useH;
  if (sel) w.sel = sel;
  w.setPath(pqrPath);
  w.attach(mol as unknown as CueMolObject);
  w.write();
  w.detach();
}

/** Write the target molecule to a PDB file (input for pdb2pqr). */
function writePdb(
  ctx: WorkerContext,
  mol: MolCoord,
  sel: MolSelection | null,
  pdbPath: string,
): void {
  const w = ctx.strMgr.createHandler('pdb', 1) as unknown as PDBFileWriter;
  if (sel) w.sel = sel;
  w.setPath(pdbPath);
  w.attach(mol as unknown as CueMolObject);
  w.write();
  w.detach();
}

/** Load the APBS `.dx` output as an ElePotMap object under one undo txn. */
function loadPotFile(
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

/** Tear down a job and emit a failure. */
function failJob(ctx: WorkerContext, entry: ApbsJobEntry, error: string): void {
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
  emit(ctx, { type: 'error', jobId: entry.jobId, error });
}

/** One poll tick: advance the job's process state machine. */
function pollJob(ctx: WorkerContext, entry: ApbsJobEntry): void {
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
function calcApbsStart(
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

  const jobId = `apbs-${++jobSeq}`;
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
function calcApbsCancel(
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

export const services = { calcApbsStart, calcApbsCancel, proposeElepotName };
