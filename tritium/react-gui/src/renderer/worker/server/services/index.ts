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
        if (!m.services || typeof m.services !== 'object') {
            console.warn(`services: skipping ${path} (no 'services' export)`);
            continue;
        }
        for (const [serviceName, fn] of Object.entries(m.services)) {
            if (typeof fn === 'function') {
                svc.register(serviceName, fn);
            }
        }
    }
}
