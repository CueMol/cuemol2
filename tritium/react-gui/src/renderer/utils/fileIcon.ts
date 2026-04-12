/**
 * @file utils/fileIcon.ts
 * @description Maps file extensions to Blueprint icon names for use in tab labels.
 */

/** Union of Blueprint icon names used by the tab strip. */
export type FileIconName = "document" | "code" | "database" | "application";

/**
 * Returns the appropriate Blueprint icon name for a given filename based
 * on its extension.
 *
 * | Extension(s)   | Icon          | Rationale                        |
 * |---------------|---------------|----------------------------------|
 * | `.pdb`, `.cif` | `"database"`  | Molecular coordinate data files  |
 * | `.py`          | `"code"`      | Python source files              |
 * | `.json`        | `"application"` | Structured data / config       |
 * | *(anything else)* | `"document"` | Generic text / unknown type   |
 *
 * @param filename - The full filename or basename (extension included).
 * @returns A Blueprint `IconName` string.
 *
 * @example
 * getFileIcon("1CRN.pdb");     // → "database"
 * getFileIcon("script.py");    // → "code"
 * getFileIcon("config.json");  // → "application"
 * getFileIcon("README.txt");   // → "document"
 * getFileIcon("no-extension"); // → "document"
 * getFileIcon("");             // → "document"
 */
export const getFileIcon = (filename: string): FileIconName => {
  if (filename.endsWith(".pdb") || filename.endsWith(".cif")) return "database";
  if (filename.endsWith(".py")) return "code";
  if (filename.endsWith(".json")) return "application";
  return "document";
};
