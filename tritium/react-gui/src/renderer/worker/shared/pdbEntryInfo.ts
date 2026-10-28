/**
 * @file worker/shared/pdbEntryInfo.ts
 * @description What Get PDB knows about an entry before downloading it, and
 * the parsers that read it out of the RCSB and EMDB API responses.
 *
 * The parsers are pure so the rules live in one tested place: an entry is
 * cryo-EM when it has an associated EMDB volume, whatever its method says
 * (Mol* `getStreamingMethod`: electron crystallography entries such as 6AXZ
 * come with an EMDB map that is more useful than one from structure
 * factors), and only then is the method string consulted.
 */

/** The kind of map an entry comes with: what the dialog offers to fetch. */
export type EntryKind = 'xtal' | 'em' | 'other'

export interface EntryInfo {
  /** Lowercased PDB ID. */
  id: string
  title: string
  /** Experimental methods as RCSB spells them (`ELECTRON MICROSCOPY`, ...). */
  methods: string[]
  /** Resolution in angstroms, or null when the entry has none (NMR). */
  resolution: number | null
  /** Associated EMDB volumes, `EMD-<num>`, primary first. */
  emdbIds: string[]
  /** False when the entry is too large for the legacy PDB format. */
  pdbFormatAvailable: boolean
  kind: EntryKind
}

export interface EmdbMapInfo {
  /** `EMD-<num>`. */
  emdbId: string
  /** Entry title, or '' when the admin record could not be read. */
  title: string
  /** The author's recommended contour level, in absolute density units. */
  recommendedLevel: number | null
  /** Size of the gzipped map file in bytes. */
  sizeBytes: number | null
  /** Grid dimensions (columns, rows, sections). */
  dims: [number, number, number] | null
}

/** The GraphQL query `parseRcsbEntries` reads, for the given IDs. */
export function rcsbEntriesQuery(ids: readonly string[]): string {
  const list = ids.map((id) => JSON.stringify(id.toUpperCase())).join(',')
  return `{entries(entry_ids:[${list}]){rcsb_id struct{title} exptl{method} ` +
    'rcsb_entry_info{resolution_combined} rcsb_entry_container_identifiers{emdb_ids} ' +
    'pdbx_database_status{pdb_format_compatible}}}'
}

type Json = Record<string, unknown>

function asObj(v: unknown): Json | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function entryKind(methods: string[], emdbIds: string[]): EntryKind {
  if (emdbIds.length > 0) return 'em'
  const upper = methods.map((m) => m.toUpperCase())
  if (upper.some((m) => m.includes('X-RAY') || m.includes('NEUTRON'))) return 'xtal'
  if (upper.some((m) => m.includes('ELECTRON MICROSCOPY'))) return 'em'
  return 'other'
}

/**
 * The entries of an RCSB GraphQL `entries` response. An ID RCSB does not
 * know comes back as a bare `rcsb_id` with every other field null; it is
 * left out, so a missing entry is simply absent from the result.
 */
export function parseRcsbEntries(json: unknown): EntryInfo[] {
  const entries = asArr(asObj(asObj(json)?.data)?.entries)
  const out: EntryInfo[] = []
  for (const e of entries) {
    const o = asObj(e)
    if (!o || typeof o.rcsb_id !== 'string' || !Array.isArray(o.exptl)) continue
    const methods = asArr(o.exptl)
      .map((x) => asObj(x)?.method)
      .filter((m): m is string => typeof m === 'string')
    const emdbIds = asArr(asObj(o.rcsb_entry_container_identifiers)?.emdb_ids)
      .filter((x): x is string => typeof x === 'string')
    const res = asArr(asObj(o.rcsb_entry_info)?.resolution_combined)[0]
    const compat = asObj(o.pdbx_database_status)?.pdb_format_compatible
    out.push({
      id: o.rcsb_id.toLowerCase(),
      title: typeof asObj(o.struct)?.title === 'string' ? (asObj(o.struct)!.title as string) : '',
      methods,
      resolution: typeof res === 'number' ? res : null,
      emdbIds,
      pdbFormatAvailable: compat !== 'N',
      kind: entryKind(methods, emdbIds),
    })
  }
  return out
}

/**
 * The map record of an EMDB `entry/map` response (plus the title from an
 * `entry/admin` response, when there is one). The contour level is the
 * primary one, else the first one, else none (Mol* `getContourLevelPdbe`).
 */
export function parseEmdbMap(emdbId: string, mapJson: unknown, adminJson?: unknown): EmdbMapInfo {
  const map = asObj(asObj(mapJson)?.map)
  const contours = asArr(asObj(map?.contour_list)?.contour).map(asObj).filter((c): c is Json => c !== null)
  const contour = contours.find((c) => c.primary === true) ?? contours[0]
  const level = contour ? Number(contour.level) : NaN
  const kb = Number(map?.size_kbytes)
  const d = asObj(map?.dimensions)
  const dims = d ? [Number(d.col), Number(d.row), Number(d.sec)] : []
  const title = asObj(asObj(adminJson)?.admin)?.title
  return {
    emdbId,
    title: typeof title === 'string' ? title : '',
    recommendedLevel: Number.isFinite(level) ? level : null,
    sizeBytes: Number.isFinite(kb) && kb > 0 ? kb * 1000 : null,
    dims: dims.length === 3 && dims.every((n) => Number.isFinite(n) && n > 0)
      ? (dims as [number, number, number])
      : null,
  }
}
