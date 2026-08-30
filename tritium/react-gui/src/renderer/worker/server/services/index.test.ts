/**
 * @file worker/server/services/index.test.ts
 * @description What the service registry is allowed to find.
 *
 * Registration is a glob over the flat services and one level of folders;
 * every matching module's `services` export becomes a callable name. Two
 * things can go wrong silently with that. Two modules can export the same name, in which case
 * `WorkerService.register` logs a warning and the later one wins -- easy to
 * reach now that a folder can hold a barrel next to the flat services it was
 * split out of. And a module can be a folder's internal part that exports
 * `services` by accident, which would register names nobody declared.
 */

import { describe, it, expect } from 'vitest';
import { ALL_SERVICE_KEYS } from '@renderer/worker/shared/calls';

/** Read exactly as index.ts does. */
const modules = import.meta.glob(['./*.service.ts', './*/*.service.ts'], {
    eager: true,
}) as Record<string, { services?: Record<string, unknown> }>;

/** Every (name, module) pair the registry would install. */
function registrations(): { name: string; path: string }[] {
    const out: { name: string; path: string }[] = [];
    for (const path of Object.keys(modules).sort()) {
        const services = modules[path]?.services;
        if (!services || typeof services !== 'object') continue;
        for (const [name, fn] of Object.entries(services)) {
            if (typeof fn === 'function') out.push({ name, path });
        }
    }
    return out;
}

describe('service registry', () => {
    it('registers each name exactly once', () => {
        const byName = new Map<string, string[]>();
        for (const { name, path } of registrations()) {
            byName.set(name, [...(byName.get(name) ?? []), path]);
        }
        const dupes = [...byName].filter(([, paths]) => paths.length > 1);
        expect(dupes).toEqual([]);
    });

    it('registers only names the call contract declares', () => {
        const declared = new Set<string>(ALL_SERVICE_KEYS);
        const undeclared = registrations()
            .filter((r) => !declared.has(r.name))
            .map((r) => `${r.name} (${r.path})`);
        expect(undeclared).toEqual([]);
    });

    it('finds the services inside a folder, not just the flat ones', () => {
        const paths = new Set(registrations().map((r) => r.path));
        expect([...paths].some((p) => p.split('/').length > 2)).toBe(true);
    });
});
