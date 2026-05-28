/**
 * @file renderer/worker/shared/sniffConfig.ts
 * @description Worker-side constants for content-sniff routing.
 */

/**
 * Default upper bound on bytes each reader's canHandleContent() is
 * allowed to consume from the input stream during sniff. Forwarded to
 * `LoadObjectCommand.max_sniff_bytes` and the `maxBytes` argument of
 * `StreamManager::searchReader{,s}ByContent`.
 *
 * Set so that real-world headers (PDB-derived mmCIF, CNS-padded Xplor
 * map) resolve, while pathological / mistakenly-renamed huge files
 * cannot stall the worker scanning gigabytes of garbage.
 */
export const DEFAULT_SNIFF_CAP = 65536;
