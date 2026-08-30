/**
 * @file worker/server/services/apbs/inputFiles.ts
 * @description The files the two external programs read.
 *
 * Everything written here is consumed by a process spawned with a path
 * argument, so paths are quoted and `~` is expanded before they leave.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { PQRFileWriter } from '@cuemol/core/src/wrappers/PQRFileWriter';
import type { PDBFileWriter } from '@cuemol/core/src/wrappers/PDBFileWriter';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { Grid } from './types';
/** Expand a leading `~` to the home directory (settings may store `~/...`). */
export function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/** Quote a path for a ProcessManager args string (spaces-safe). */
export function quote(p: string): string {
  return `"${p}"`;
}

/** True while an existing file has non-zero size. */
export function fileNonEmpty(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

/** Build the `apbs.in` mg-auto input file (UXP `makeAPBSIn`). */
export function buildApbsIn(
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
export function buildPdb2pqrArgs(forceField: string, inPath: string, outPath: string): string {
  const ff = forceField.toUpperCase();
  const inp = quote(inPath);
  const outp = quote(outPath);
  if (os.platform() === 'win32') {
    return [ff, inp, outp].join(' ');
  }
  return ['--keep-chain', '--nodebump', '--noopt', '--ff', ff, inp, outp].join(' ');
}

/** Write the target molecule to a PQR file via the built-in PQRFileWriter. */
export function writePqr(
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
export function writePdb(
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
