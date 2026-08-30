/**
 * @file worker/server/services/apbs/types.ts
 * @description What one APBS job is made of, and the numbers that shape it.
 *
 * The grid constants are the UXP defaults: the coarse grid is scaled from the
 * molecule's bounding box, the fine grid is padded around the selection, and
 * both are rounded to a multiple the solver wants.
 */
import { type ApbsUpdatePhase } from '@renderer/worker/shared/apbsTypes';
/** Poll interval for process status / stdout. */
export const POLL_MS = 300;

/** ProcessManager task states (see LProcMgr). */
export const TASK_QUEUED = 0;
export const TASK_RUNNING = 1;

/** Grid-derivation constants (UXP `calcGridDim`). */
export const COARSE_FACTOR = 1.7;
export const FINE_PADDING = 20.0;
export const GRID_MULTIPLE = 32;

/** State of one in-flight APBS job. */
export interface ApbsJobEntry {
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

export interface Grid {
  pts: { x: number; y: number; z: number };
  coarse: { x: number; y: number; z: number };
  fine: { x: number; y: number; z: number };
}
