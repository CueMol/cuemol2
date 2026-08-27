/**
 * @file renderer/worker/shared/sniffConfig.ts
 * @description Worker-side constants for content-sniff routing.
 */

/**
 * Ceiling of the content-sniff byte budget that `pickReaderName` hands
 * to `StreamManager::searchReaderByContent` (`maxBytes`).
 *
 * The C++ side escalates rather than reading this much up front: every
 * reader first sees 64 KiB, and only a reader that was cut off by that
 * budget while still undecided is retried with 8x more (512 KiB, 4 MiB,
 * then this ceiling). Readers that decide, reach EOF, or stop early are
 * never retried, so the ceiling is paid only by undecidable inputs
 * (garbage dropped on a line-scanning reader): at most ~1.3 x 16 MiB
 * read per such reader.
 *
 * 16 MiB comfortably covers any real header (a current PDB mmCIF puts
 * `_atom_site.` a few hundred KB in, 271 KB for 5IRE and 462 KB for
 * 7A6A, while the mmCIF sniffers usually settle on the coordinate
 * categories in the first ~10 KB) and still bounds the worst case so a
 * mistakenly-renamed huge file cannot stall the worker.
 */
export const DEFAULT_SNIFF_CAP = 16 * 1024 * 1024;
