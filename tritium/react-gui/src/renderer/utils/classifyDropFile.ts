/**
 * @file utils/classifyDropFile.ts
 * @description Classifies a file dropped from the OS (Finder/Explorer) as an
 * object file (molecule, density map, ...), a scene file, or unsupported,
 * by matching its name against the reader filter lists from the C++
 * StreamManager (via the getOpenFilters worker service).
 *
 * Parity with UXP dragdropopen.js openNsFileImpl: object readers (category 0)
 * are tried before scene readers (category 3).
 *
 * Also holds the MIME deny-list used while a drag is still in flight. During
 * dragover the DnD security model exposes no file names and no contents --
 * only the MIME type the OS derived from the extension -- so a drag can be
 * rejected before the drop, but only for types that are certainly unopenable.
 */

import type { ElectronFileFilter } from '@shared/ipcTypes'

/** InOutHandler categories (src/qsys/InOutHandler.hpp IOH_CAT_*). */
export const IOH_CAT_OBJREADER = 0
export const IOH_CAT_SCEREADER = 3

export type DropKind = 'obj' | 'scene' | 'unsupported'

export interface DropClassification {
  kind: DropKind
  /**
   * For 'obj': true when the extension matches more than one reader, so the
   * load should sniff the file content to pick the reader (same heuristic as
   * main/helpers/inferContentFirst.ts). Always false for 'scene'.
   */
  contentFirst: boolean
}

/**
 * Concrete filter rows only: getOpenFilters prepends an 'All Supported'
 * union row and appends an 'All Files' wildcard row -- neither identifies
 * a specific reader.
 */
function concreteFilters(filters: ElectronFileFilter[]): ElectronFileFilter[] {
  return filters.filter((f) => f.name !== 'All Supported' && !f.extensions.includes('*'))
}

/**
 * Suffix match against a filter's extension list. Extensions from parseFext
 * can be compound ('pdb.gz'), so compare with endsWith on the full name
 * rather than the last dot-segment. Case-insensitive.
 */
function matchesFilter(lowerName: string, filter: ElectronFileFilter): boolean {
  return filter.extensions.some((ext) => lowerName.endsWith('.' + ext.toLowerCase()))
}

/**
 * Classify a dropped file name against object-reader and scene-reader
 * filter lists.
 *
 * @param fileName - Base name of the dropped file (extension is what matters)
 * @param objFilters - Result of getOpenFilters(IOH_CAT_OBJREADER)
 * @param sceneFilters - Result of getOpenFilters(IOH_CAT_SCEREADER)
 */
export function classifyDropFile(
  fileName: string,
  objFilters: ElectronFileFilter[],
  sceneFilters: ElectronFileFilter[],
): DropClassification {
  const lowerName = fileName.toLowerCase()

  const objMatches = concreteFilters(objFilters).filter((f) => matchesFilter(lowerName, f))
  if (objMatches.length > 0) {
    return { kind: 'obj', contentFirst: objMatches.length !== 1 }
  }

  if (concreteFilters(sceneFilters).some((f) => matchesFilter(lowerName, f))) {
    return { kind: 'scene', contentFirst: false }
  }

  return { kind: 'unsupported', contentFirst: false }
}

// --- Drag-time MIME rejection ---

/**
 * MIME types no CueMol reader can ever open.
 *
 * Deliberately a deny-list, not an allow-list: the molecular formats CueMol
 * reads are mostly unknown to the OS, which reports them as an empty type or
 * as a generic one (`text/plain`, `application/octet-stream`), and `.pdb.gz`
 * arrives as `application/gzip`. Denying anything not explicitly recognised
 * would reject valid files on some platforms, so only types that are
 * definitely documents, media or archives are listed here.
 */
const DENIED_MIME_EXACT: readonly string[] = [
  'application/pdf',
  'application/msword',
  'text/html',
  // Archives and disk images. Plain gzip is absent on purpose: .pdb.gz.
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/java-archive',
  'application/x-apple-diskimage',
]

const DENIED_MIME_PREFIXES: readonly string[] = [
  // Office (OOXML + legacy Excel/PowerPoint), OpenDocument, iWork.
  'application/vnd.openxmlformats-officedocument.',
  'application/vnd.ms-',
  'application/vnd.oasis.opendocument.',
  'application/vnd.apple.',
  // Media and fonts.
  'image/',
  'video/',
  'audio/',
  'font/',
]

/**
 * True when a dragged item's MIME type is certainly not openable.
 *
 * @param mime - `DataTransferItem.type` (may be empty)
 */
export function isDeniedMime(mime: string): boolean {
  const m = mime.trim().toLowerCase()
  if (m === '') return false
  return DENIED_MIME_EXACT.includes(m) || DENIED_MIME_PREFIXES.some((p) => m.startsWith(p))
}

/**
 * True when at least one dragged file might be openable, so the drag should
 * be accepted as a drop target.
 *
 * Fails open: an absent / unreadable item list, or a list with no file
 * entries, returns true. Only a drag whose every file entry carries a denied
 * MIME type is rejected, which keeps a mixed drag (one molecule plus one
 * document) droppable -- the document is reported after the drop instead.
 *
 * @param items - `DataTransfer.items` observed during a drag event
 */
export function dragItemsMayContainOpenable(items: DataTransferItemList | undefined): boolean {
  if (!items) return true
  let fileCount = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || item.kind !== 'file') continue
    fileCount += 1
    if (!isDeniedMime(item.type ?? '')) return true
  }
  return fileCount === 0
}
