/**
 * @file worker/shared/dbSources.ts
 * @description Where a structure is downloaded from, given a database and an
 * accession code: the URL, the reader and the name it opens as.
 *
 * Shared (both threads) for the same reason as `pdbUrls.ts`, whose RCSB URLs
 * this reuses: a console dialect fetches by database today, and the Get PDB
 * dialog and a core op are meant to read the same table. The URLs follow
 * ChimeraX's fetchers (`bundles/mmcif`, `bundles/pdb`, `bundles/alphafold`,
 * `bundles/pubchem`), so `pdbe:1abc` here fetches what it fetches there.
 *
 * EMDB maps are not here: `pickEmdbMapUrl` and `fetch_emdb` own them.
 */

import { PDB_ID_RE, pickCoordUrl } from './pdbUrls'

/** The databases a structure can be fetched from by accession code. */
export type StructureSource = 'pdb' | 'pdbe' | 'pdbj' | 'redo' | 'alphafold' | 'pubchem'

export const STRUCTURE_SOURCES: readonly StructureSource[] = ['pdb', 'pdbe', 'pdbj', 'redo', 'alphafold', 'pubchem']

/** The coordinate formats a PDB-like source serves. */
export type StructureFormat = 'mmcif' | 'pdb'

/** How to download and read one entry. */
export interface StructureFetchSpec {
  url: string
  readerName: string
  /** The body is gzip-compressed. */
  gzip: boolean
  /** The object's name when the caller gives none. */
  name: string
}

export type StructureFetch = { ok: true; spec: StructureFetchSpec } | { ok: false; error: string }

/** AlphaFold DB's current version, as ChimeraX's `alphafold` settings default it. */
export const ALPHAFOLD_DB_VERSION = 6

/** A PDB-like source: the URL of an entry in each format. */
const PDB_LIKE: Readonly<Record<'pdbe' | 'pdbj' | 'redo', (id: string, f: StructureFormat) => { url: string; gzip: boolean }>> = {
  pdbe: (id, f) => ({
    url: f === 'pdb'
      ? `https://www.ebi.ac.uk/pdbe/entry-files/download/pdb${id}.ent`
      : `https://www.ebi.ac.uk/pdbe/entry-files/download/${id}.cif`,
    gzip: false,
  }),
  // PDBj answers gzip-compressed, whatever the format.
  pdbj: (id, f) => ({ url: `https://pdbj.org/rest/downloadPDBfile?format=${f === 'pdb' ? 'pdb' : 'mmcif'}&id=${id}`, gzip: true }),
  redo: (id, f) => ({ url: `https://pdb-redo.eu/db/${id}/${id}_final.${f === 'pdb' ? 'pdb' : 'cif'}`, gzip: false }),
}

/**
 * An AlphaFold DB id, as ChimeraX's `_parse_alphafold_id` reads it: a UniProt
 * accession (`P29474`), with an isoform (`Q8N9C0-2`), or a full AlphaFold id
 * (`AF-Q8N9C0-F1-v6`, `AF-Q8N9C0-2-F1-v6`). A UniProt name (`NOS3_HUMAN`)
 * needs a UniProt lookup and is refused.
 */
export function parseAlphaFoldId(text: string): { ok: true; uniprot: string; isoform: string | null; fragment: string; version: string } | { ok: false; error: string } {
  const t = text.trim()
  if (t.includes('_')) return { ok: false, error: `"${t}" is a UniProt name; give its accession (P29474) instead` }
  const f = t.split('-')
  let uniprot: string
  let isoform: string | null = null
  let fragment = '1'
  let version = String(ALPHAFOLD_DB_VERSION)
  if (f.length === 1) {
    uniprot = f[0]
  } else if (f.length === 2) {
    ;[uniprot, isoform] = f
  } else if (f[0].toUpperCase() === 'AF' && (f.length === 4 || f.length === 5)) {
    uniprot = f[1]
    if (f.length === 5) isoform = f[2]
    const [fr, ver] = f.slice(-2)
    if (!/^F\d+$/i.test(fr) || !/^v\d+$/i.test(ver)) return { ok: false, error: `"${t}" is not an AlphaFold id (AF-Q8N9C0-F1-v6)` }
    fragment = fr.slice(1)
    version = ver.slice(1)
  } else {
    return { ok: false, error: `"${t}" is not an AlphaFold id (P29474, Q8N9C0-2, AF-Q8N9C0-F1-v6)` }
  }
  if (!/^[A-Za-z0-9]{6}$|^[A-Za-z0-9]{10}$/.test(uniprot)) {
    return { ok: false, error: `UniProt accessions are 6 or 10 letters and digits, got "${uniprot}"` }
  }
  if (isoform !== null && !/^\d+$/.test(isoform)) return { ok: false, error: `"${isoform}" is not an isoform number` }
  return { ok: true, uniprot: uniprot.toUpperCase(), isoform, fragment, version }
}

/**
 * How to fetch `id` from `source`.
 *
 * @param format - the coordinate format; null takes mmCIF. PubChem serves SDF
 *   only and refuses one.
 */
export function structureFetch(source: StructureSource, id: string, format: StructureFormat | null): StructureFetch {
  const f: StructureFormat = format ?? 'mmcif'
  const reader = f === 'pdb' ? 'pdb' : 'mmcif'
  switch (source) {
    case 'pdb':
    case 'pdbe':
    case 'pdbj':
    case 'redo': {
      const pdbId = id.trim().toLowerCase()
      if (!PDB_ID_RE.test(pdbId)) return { ok: false, error: `"${id}" is not a PDB id (four characters, first a digit)` }
      if (source === 'pdb') {
        const c = pickCoordUrl(pdbId, f === 'pdb' ? 'RCSB_PDB' : 'RCSB_CIF')
        return { ok: true, spec: { url: c.url, readerName: c.readerName, gzip: false, name: pdbId } }
      }
      return { ok: true, spec: { ...PDB_LIKE[source](pdbId, f), readerName: reader, name: pdbId } }
    }
    case 'alphafold': {
      const a = parseAlphaFoldId(id)
      if (!a.ok) return a
      const entry = `AF-${a.uniprot}${a.isoform ? `-${a.isoform}` : ''}-F${a.fragment}`
      const ext = f === 'pdb' ? 'pdb' : 'cif'
      return { ok: true, spec: { url: `https://alphafold.ebi.ac.uk/files/${entry}-model_v${a.version}.${ext}`, readerName: reader, gzip: false, name: entry } }
    }
    case 'pubchem': {
      const cid = id.trim()
      if (!/^\d+$/.test(cid)) return { ok: false, error: `"${id}" is not a PubChem compound id (a number)` }
      if (format !== null) return { ok: false, error: 'PubChem serves SDF only; give no format' }
      return {
        ok: true,
        spec: { url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`, readerName: 'sdf', gzip: false, name: `pubchem_${cid}` },
      }
    }
  }
}

/** Readers by file extension, for a URL. */
const URL_READERS: Readonly<Record<string, string>> = {
  cif: 'mmcif', mmcif: 'mmcif', pdb: 'pdb', ent: 'pdb', sdf: 'sdf', mol: 'sdf', mol2: 'mol2',
}

/**
 * How to fetch a structure file by its URL: the reader from its extension
 * (a trailing `.gz` is decompressed), the name from its file name.
 */
export function urlFetch(url: string): StructureFetch {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: `"${url}" is not an http or https URL` }
  let file = u.split(/[?#]/)[0].split('/').pop() ?? ''
  const gzip = /\.gz$/i.test(file)
  if (gzip) file = file.slice(0, -3)
  const dot = file.lastIndexOf('.')
  const readerName = dot > 0 ? URL_READERS[file.slice(dot + 1).toLowerCase()] : undefined
  if (!readerName) {
    return { ok: false, error: `cannot tell the format of ${u} from its name (${Object.keys(URL_READERS).map((e) => `.${e}`).join(' ')})` }
  }
  return { ok: true, spec: { url: u, readerName, gzip, name: file.slice(0, dot) } }
}

/** An EMDB accession as `fetch_emdb` takes it: `1080` and `emd_1080` become `EMD-1080`; null for neither. */
export function emdbAccession(text: string): string | null {
  const m = /^(?:emd[-_]?)?(\d{4,})$/i.exec(text.trim())
  return m ? `EMD-${m[1]}` : null
}

/** What the Get PDB dialog shows about an AlphaFold DB model or a PubChem compound before downloading it. */
export interface DbEntryInfo {
  /** The protein's or compound's name. */
  title: string
  /** Short facts, in display order (`NOS3`, `Homo sapiens`, ...). */
  details: string[]
}

/**
 * The record that describes `id` in `source`: AlphaFold DB's prediction API,
 * PubChem's compound properties. Null for a source without one, or an id
 * that is not of the source's form.
 */
export function dbEntryInfoUrl(source: 'alphafold' | 'pubchem', id: string): string | null {
  if (source === 'alphafold') {
    const a = parseAlphaFoldId(id)
    return a.ok ? `https://alphafold.ebi.ac.uk/api/prediction/${a.uniprot}${a.isoform ? `-${a.isoform}` : ''}` : null
  }
  const cid = id.trim()
  return /^\d+$/.test(cid)
    ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,IUPACName,MolecularFormula,MolecularWeight/JSON`
    : null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/**
 * Read the record `dbEntryInfoUrl` answers with.
 *
 * @returns the info, or null when the record names nothing
 */
export function parseDbEntryInfo(source: 'alphafold' | 'pubchem', id: string, json: unknown): DbEntryInfo | null {
  if (source === 'alphafold') {
    if (!Array.isArray(json) || json.length === 0) return null
    // One record per fragment: the one the id names (F1 unless it says).
    const a = parseAlphaFoldId(id)
    const fragment = a.ok ? a.fragment : '1'
    const rec = (json.find((r) => typeof r === 'object' && r !== null && str((r as Record<string, unknown>).modelEntityId).endsWith(`-F${fragment}`)) ??
      json[0]) as Record<string, unknown>
    const residues = typeof rec.sequenceEnd === 'number' && typeof rec.sequenceStart === 'number' ? rec.sequenceEnd - rec.sequenceStart + 1 : null
    const plddt = typeof rec.globalMetricValue === 'number' ? rec.globalMetricValue : null
    return {
      title: str(rec.uniprotDescription) || str(rec.uniprotAccession) || id,
      details: [
        str(rec.gene),
        str(rec.organismScientificName),
        residues !== null ? `${residues} residues` : '',
        plddt !== null ? `mean pLDDT ${plddt.toFixed(1)}` : '',
      ].filter((s) => s !== ''),
    }
  }
  const props = (json as { PropertyTable?: { Properties?: Record<string, unknown>[] } })?.PropertyTable?.Properties
  const rec = Array.isArray(props) ? props[0] : undefined
  if (!rec) return null
  const weight = str(rec.MolecularWeight)
  return {
    title: str(rec.Title) || `CID ${id.trim()}`,
    details: [str(rec.MolecularFormula), weight ? `${weight} g/mol` : '', str(rec.IUPACName)].filter((s) => s !== ''),
  }
}

/** A gridded density map at a URL: how to download and read it. */
export interface MapUrlSpec {
  url: string
  readerName: 'ccp4map'
  gzip: boolean
  /** The object's name when the caller gives none (the file name without its extensions). */
  name: string
}

/** File extensions of the gridded maps a URL can name (CCP4 / MRC, read by `ccp4map`). */
const MAP_URL_EXTENSIONS = ['map', 'mrc', 'ccp4']

/**
 * How to fetch a density map by its URL, by its file name's extension
 * (`.map`, `.mrc`, `.ccp4`; a trailing `.gz` is decompressed). Null when the
 * URL does not name one of those, so a caller can try `urlFetch` instead.
 */
export function mapUrlFetch(url: string): MapUrlSpec | null {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return null
  let file = u.split(/[?#]/)[0].split('/').pop() ?? ''
  const gzip = /\.gz$/i.test(file)
  if (gzip) file = file.slice(0, -3)
  const dot = file.lastIndexOf('.')
  if (dot <= 0 || !MAP_URL_EXTENSIONS.includes(file.slice(dot + 1).toLowerCase())) return null
  return { url: u, readerName: 'ccp4map', gzip, name: file.slice(0, dot) }
}
