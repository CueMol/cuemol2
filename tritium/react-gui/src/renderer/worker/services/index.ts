import type { WorkerService } from '../WorkerService';

type ServiceFn = (ctx: any, args: any) => any;

type ServiceModule = {
    name?: string;
    default?: ServiceFn;
    services?: Record<string, ServiceFn>;
};

const modules = import.meta.glob('./*.service.ts', { eager: true }) as Record<
    string,
    ServiceModule
>;

export function registerAllServices(svc: WorkerService): void {
    for (const path of Object.keys(modules).sort()) {
        const m = modules[path];

        // Multi-service pattern: export const services = { name1: fn1, ... }
        if (m.services && typeof m.services === 'object') {
            for (const [serviceName, fn] of Object.entries(m.services)) {
                if (typeof fn === 'function') {
                    svc.register(serviceName, fn);
                }
            }
            continue;
        }

        // Single-service pattern: export const name + export default function
        if (m.name && typeof m.default === 'function') {
            svc.register(m.name, m.default);
            continue;
        }

        console.warn(`services: skipping ${path} (missing name/default or services)`);
    }
}
