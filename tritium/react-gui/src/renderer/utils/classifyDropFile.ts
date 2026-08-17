/**
 * @file utils/classifyDropFile.ts
 * @description Classifies a file dropped from the OS (Finder/Explorer) as an
 * object file (molecule, density map, ...), a scene file, or unsupported,
 * by matching its name against the reader filter lists from the C++
 * StreamManager (via the getOpenFilters worker service).
 *
 * Parity with UXP dragdropopen.js openNsFileImpl: object readers (category 0)
 * are tried before scene readers (category 3).
 */

import type { ElectronFileFilter } from '../../shared/ipcTypes'

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
