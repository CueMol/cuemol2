import type { WorkerService } from '../WorkerService';

const modules = import.meta.glob('./*.service.ts', { eager: true }) as Record<
    string,
    { name: string; default: (ctx: any, args: any) => any }
>;

export function registerAllServices(svc: WorkerService): void {
    for (const path of Object.keys(modules).sort()) {
        const m = modules[path];
        if (!m.name || typeof m.default !== 'function') {
            console.warn(`services: skipping ${path} (missing name or default export)`);
            continue;
        }
        svc.register(m.name, m.default);
    }
}
