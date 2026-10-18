/**
 * @file worker/server/services/apbs/defaults.ts
 * @description The APBS settings a caller without the dialog uses: the
 * executable paths and the default force field from Settings.
 *
 * The dialog passes them with every job. A console command cannot -- it runs
 * in the worker, and the paths live in the renderer's settings -- so the
 * renderer sends them here whenever they are resolved or changed
 * (`ApbsConfigProvider`). A copy only: resolving and saving them stays the
 * renderer's.
 */
import {
  DEFAULT_APBS_BINARIES,
  DEFAULT_PDB2PQR_FF,
  type SetApbsDefaultsArgs,
} from '@renderer/worker/shared/apbsTypes';

let current: SetApbsDefaultsArgs = { binaries: DEFAULT_APBS_BINARIES, forceField: DEFAULT_PDB2PQR_FF };

export function setApbsDefaults(_ctx: unknown, args: SetApbsDefaultsArgs): { ok: true } {
  current = args;
  return { ok: true };
}

/** What Settings says, as last sent. */
export function apbsDefaults(): SetApbsDefaultsArgs {
  return current;
}
