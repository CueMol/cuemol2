/**
 * @file plugins/chimerax-console/worker/openTarget.ts
 * @description What `open <name>` means: a file, or an entry to fetch from a database.
 *
 * ChimeraX's reading (`open_command/cmd.py` `fetches_vs_files` / `fetch_info`):
 * - `fromDatabase db` names the database; the name is then fetched even when a
 *   file of that name exists (the result must not depend on the directory).
 * - Without it, an existing file wins. Else `db:id` (a prefix of two or more
 *   characters, so `C:\...` stays a path), an http(s) URL, or a bare PDB id.
 *
 * Where each database's files are is core's (`worker/shared/dbSources.ts`);
 * this file only reads ChimeraX's words for them and refuses the ones the
 * console cannot open, saying why.
 */

import { emdbAccession, STRUCTURE_SOURCES, structureFetch, urlFetch } from '@renderer/worker/shared/dbSources'
import type { StructureFetchSpec, StructureFormat, StructureSource } from '@renderer/worker/shared/dbSources'
import { PDB_ID_RE } from '@renderer/worker/shared/pdbUrls'

export type OpenTarget =
  | { kind: 'file' }
  /** A database entry: `fetch_entry`, which records the entry rather than its URL. */
  | { kind: 'entry'; source: StructureSource; id: string; format: StructureFormat | null }
  /** A URL: `fetch_url`. */
  | { kind: 'url'; spec: StructureFetchSpec }
  | { kind: 'emdb'; id: string; mirror: 'WWPDB' | 'EBI' }
  | { kind: 'error'; error: string }

/** EMDB's ChimeraX names and the mirror `fetch_emdb` takes for each. */
const EMDB_MIRRORS: Readonly<Record<string, 'WWPDB' | 'EBI'>> = { emdb: 'WWPDB', emdb_us: 'WWPDB', emdb_europe: 'EBI' }

/** ChimeraX's other fetch sources: refused, with the reason. */
const REFUSED: Readonly<Record<string, string>> = {
  emdb_japan: 'that EMDB mirror is not supported yet; use emdb or emdb_europe',
  emdb_china: 'that EMDB mirror is not supported yet; use emdb or emdb_europe',
  emdb_fits: 'opening the fitted models is not supported yet',
  cod: 'small-molecule crystal CIF files cannot be read',
  pcod: 'small-molecule crystal CIF files cannot be read',
  pdbihm: 'integrative models cannot be read',
  pdbdev: 'integrative models cannot be read',
  smiles: 'it needs a web service to build 3D coordinates',
  alphafold_pae: 'predicted aligned error is not supported',
  alpha_missense: 'AlphaMissense scores are not supported',
  mavedb: 'MaveDB scores are not supported',
  uniprot_variants: 'UniProt variants are not supported',
  cellpack: 'cellPACK models are not supported',
  ftp: 'only http and https downloads are supported',
  help: 'help pages are not opened here',
}

/** The `format` keyword as a coordinate format: null when absent, 'other' for one that is not pdb or mmCIF. */
export function readFormat(text: string): StructureFormat | null | 'other' {
  const f = text.trim().toLowerCase()
  if (f === '') return null
  if (f === 'pdb') return 'pdb'
  if (f === 'mmcif' || f === 'cif') return 'mmcif'
  return 'other'
}

/** An entry of a named database. */
function fetchFrom(db: string, id: string, format: StructureFormat | null | 'other'): OpenTarget {
  const mirror = EMDB_MIRRORS[db]
  if (mirror) {
    const acc = emdbAccession(id)
    return acc ? { kind: 'emdb', id: acc, mirror } : { kind: 'error', error: `Error: open: "${id}" is not an EMDB id (1080, EMD-1080)` }
  }
  const refused = REFUSED[db]
  if (refused) return { kind: 'error', error: `Error: open: ${db} is not supported (${refused})` }
  if (!(STRUCTURE_SOURCES as readonly string[]).includes(db)) {
    const known = [...STRUCTURE_SOURCES, ...Object.keys(EMDB_MIRRORS)].join(', ')
    return { kind: 'error', error: `Error: open: unknown database "${db}" (${known})` }
  }
  if (format === 'other') return { kind: 'error', error: `Error: open: ${db} serves pdb or mmcif; give one of them as the format` }
  const source = db as StructureSource
  // Checked here too, so a malformed id is refused before anything runs.
  const r = structureFetch(source, id, format)
  if (!r.ok) return { kind: 'error', error: `Error: open: ${r.error}` }
  return { kind: 'entry', source, id, format }
}

/**
 * What `open name [fromDatabase db] [format f]` opens.
 *
 * @param exists - whether a file of that name is there (resolved against the
 *   console's directory by the caller)
 */
export function openTarget(name: string, fromDatabase: string, format: string, exists: (name: string) => boolean): OpenTarget {
  const fmt = readFormat(format)
  const db = fromDatabase.trim().toLowerCase()
  if (db !== '') return fetchFrom(db, name, fmt)
  if (exists(name)) return { kind: 'file' }
  if (/^https?:\/\//i.test(name)) {
    const r = urlFetch(name)
    return r.ok ? { kind: 'url', spec: r.spec } : { kind: 'error', error: `Error: open: ${r.error}` }
  }
  const prefixed = /^([A-Za-z][A-Za-z0-9_]+):(.+)$/.exec(name)
  if (prefixed) return fetchFrom(prefixed[1].toLowerCase(), prefixed[2], fmt)
  if (PDB_ID_RE.test(name)) return fetchFrom('pdb', name, fmt)
  return { kind: 'file' }
}
