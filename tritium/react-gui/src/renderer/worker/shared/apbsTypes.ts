/**
 * @file worker/shared/apbsTypes.ts
 * @description Types shared by both threads for the APBS electrostatic-potential
 * calculation pipeline (`dialog.tool.apbs-calcpot`): the `calcApbsStart` /
 * `calcApbsCancel` / `proposeElepotName` service contracts and the
 * worker -> renderer `apbs-progress` push payload.
 *
 * Mirrors `renderTypes.ts`. The external executable paths (apbs / pdb2pqr) are
 * machine-level install config edited in the SettingsPane and persisted to
 * electron-store, delivered here as plain `args` -- the worker service holds no
 * path resolution or persistence.
 */

/** Push-channel name for worker -> renderer APBS updates. */
export const APBS_PROGRESS_CHANNEL = 'apbs-progress';

/** Paths to the external binaries the APBS pipeline drives. */
export interface ApbsBinaries {
  /** APBS executable. */
  apbsExe: string;
  /** pdb2pqr executable (only needed for the `pdb2pqr` charge method). */
  pdb2pqrExe: string;
}

/**
 * Last-resort defaults. Empty by design: an unset path is the "not configured"
 * signal the dialog uses to gate its Start action and point the user at
 * Settings. UXP defaulted to `<appdir>/apbs/...`; that main-side resolution can
 * be added later (like render's `defaultRenderBinaries`).
 */
export const DEFAULT_APBS_BINARIES: ApbsBinaries = {
  apbsExe: '',
  pdb2pqrExe: '',
};

/** pdb2pqr force fields offered by the dialog (UXP `pdb2pqr-ff-list`). */
export const PDB2PQR_FORCE_FIELDS = ['charmm', 'amber', 'tyl06', 'peoepb', 'swanson'] as const;
export type Pdb2pqrForceField = (typeof PDB2PQR_FORCE_FIELDS)[number];

/** Default force field (UXP default `charmm`). */
export const DEFAULT_PDB2PQR_FF: Pdb2pqrForceField = 'charmm';

/** Charge-assignment method: external pdb2pqr or the built-in PQR writer. */
export type ApbsChargeMethod = 'pdb2pqr' | 'internal';

/** Arguments for the `calcApbsStart` worker service. */
export interface CalcApbsStartArgs {
  sceneId: number;
  /** Target MolCoord object uid. */
  objId: number;
  /** Atom-selection expression; empty string means "all atoms". */
  selStr: string;
  /** Name for the new ElePotMap object; empty falls back to `pot_<molname>`. */
  elepotName: string;
  /** Charge-assignment method. */
  chargeMethod: ApbsChargeMethod;
  /** Force field for the pdb2pqr method. */
  forceField: Pdb2pqrForceField;
  /** Whether the internal PQR writer includes hydrogens. */
  useHydrogen: boolean;
  /** Solve the non-linear PBE (`npbe`) instead of the linear one (`lpbe`). */
  useNpbe: boolean;
  /** APBS `temp` (K). */
  temperature: number;
  /** Target grid spacing (A) -- UXP "Max grid size". */
  gridSpacing: number;
  /** APBS `sdie` (solvent / water dielectric). */
  waterDielec: number;
  /** APBS `pdie` (solute / protein dielectric). */
  protDielec: number;
  /** External binary paths to use. */
  binaries: ApbsBinaries;
}

export interface CalcApbsStartResult {
  ok: boolean;
  jobId: string;
  error?: string;
}

export interface CalcApbsCancelArgs {
  jobId: string;
}

export interface CalcApbsCancelResult {
  ok: boolean;
}

export interface ProposeElepotNameArgs {
  sceneId: number;
  /** Target MolCoord object uid. */
  objId: number;
}

export interface ProposeElepotNameResult {
  /** Suggested unique elepot name, or '' when the molecule is missing. */
  name: string;
}

/** Coarse phase of a running APBS job. */
export type ApbsUpdatePhase = 'pqr' | 'apbs';

/**
 * Worker -> renderer push payload (channel `apbs-progress`).
 * One discriminated union covers progress, completion and failure.
 */
export type ApbsUpdate =
  | {
      type: 'progress';
      jobId: string;
      phase: ApbsUpdatePhase;
      /** Human-readable status line for the dialog. */
      status: string;
      /** Raw process stdout chunk, if any (also surfaced in the Log panel). */
      logChunk?: string;
    }
  | {
      type: 'complete';
      jobId: string;
      /** UID of the new ElePotMap object. */
      newObjId: number;
      /** Resolved name of the new object. */
      newObjName: string;
      elapsedSec: number;
    }
  | {
      type: 'error';
      jobId: string;
      error: string;
    };
