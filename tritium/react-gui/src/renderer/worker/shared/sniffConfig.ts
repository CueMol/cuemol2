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
 * Set so that real-world headers resolve, while pathological /
 * mistakenly-renamed huge files cannot stall the worker scanning
 * gigabytes of garbage. A current PDB mmCIF puts its `_atom_site.` loop
 * hundreds of KB in (271 KB for 5IRE, 462 KB for 7A6A), which the old
 * 64 KB cap could not reach; the mmCIF sniffers now settle on the
 * coordinate categories in the first ~10 KB, and this cap is the
 * fallback for files whose markers sit further in.
 */
export const DEFAULT_SNIFF_CAP = 1048576;
