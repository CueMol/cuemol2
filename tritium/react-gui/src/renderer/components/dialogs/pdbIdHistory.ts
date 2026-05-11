/**
 * @file pdbIdHistory.ts
 * @description localStorage-backed PDB ID input history for the Get PDB
 * dialog. Mirrors UXP `util.History` semantics (LRU, deduplicated, capped),
 * and patterns selHistory.ts in components/widgets/MolSelList/.
 *
 * IDs are normalized to lowercase. Reads validate against the PDB ID regex
 * so corrupted storage (or mixed entries from another app version) cannot
 * surface garbage in the picker.
 */

export const STORAGE_KEY = 'cuemol.getPdbDialog.history';
export const MAX_ENTRIES = 20;

// Same shape as UXP openPDB.js:104-111 — first char digit, remaining alnum.
const PDBID_RE = /^[0-9][0-9a-z]{3}$/i;

function isStorageAvailable(): boolean {
    return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
}

export function getHistory(): string[] {
    if (!isStorageAvailable()) return [];
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (v): v is string => typeof v === 'string' && PDBID_RE.test(v),
        );
    } catch {
        return [];
    }
}

export function pushHistory(value: string): void {
    if (!isStorageAvailable()) return;
    const trimmed = value.trim().toLowerCase();
    if (!PDBID_RE.test(trimmed)) return;
    const current = getHistory().filter((v) => v !== trimmed);
    current.unshift(trimmed);
    if (current.length > MAX_ENTRIES) current.length = MAX_ENTRIES;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function clearHistory(): void {
    if (!isStorageAvailable()) return;
    globalThis.localStorage.removeItem(STORAGE_KEY);
}
