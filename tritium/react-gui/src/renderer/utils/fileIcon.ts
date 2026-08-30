/**
 * @file utils/fileIcon.ts
 * @description Maps file extensions to semantic `AppIcon` keys for tab labels.
 */

import type { AppIconKey } from "@renderer/h3-kit/primitives";

/** Subset of `AppIconKey` values used by the tab strip. */
export type FileIconName = Extract<AppIconKey, `file.${string}`>;

/**
 * Returns the appropriate `AppIcon` key for a given filename based on its
 * extension.
 *
 * | Extension(s)      | Icon            | Rationale                       |
 * |-------------------|-----------------|---------------------------------|
 * | `.pdb`, `.cif`    | `"file.molData"` | Molecular coordinate data files |
 * | `.py`             | `"file.code"`   | Python source files             |
 * | `.json`           | `"file.config"` | Structured data / config        |
 * | *(anything else)* | `"file.document"` | Generic text / unknown type   |
 *
 * @param filename - The full filename or basename (extension included).
 * @returns An `AppIcon` key string.
 *
 * @example
 * getFileIcon("1CRN.pdb");     // -> "file.molData"
 * getFileIcon("script.py");    // -> "file.code"
 * getFileIcon("config.json");  // -> "file.config"
 * getFileIcon("README.txt");   // -> "file.document"
 */
export const getFileIcon = (filename: string): FileIconName => {
  if (filename.endsWith(".pdb") || filename.endsWith(".cif")) return "file.molData";
  if (filename.endsWith(".py")) return "file.code";
  if (filename.endsWith(".json")) return "file.config";
  return "file.document";
};
