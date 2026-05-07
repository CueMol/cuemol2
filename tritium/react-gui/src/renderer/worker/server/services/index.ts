import type { WorkerService } from '../WorkerService';
import type { ServiceFn, ServiceKey } from '../../shared/WorkerCalls';

type AnyServiceFn = ServiceFn<ServiceKey>;

interface ServiceModule {
    name?: string;
    default?: AnyServiceFn;
    services?: Record<string, AnyServiceFn>;
}

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
            if (typeof fn !== 'function') continue;
            // The glob iterates over string keys at runtime; cast to the typed
            // ServiceKey domain so `svc.register` enforces ServiceFn<K>. A name
            // not in ServiceMap would compile but produce a runtime warning at
            // first invocation (unknown method).
            svc.register(serviceName as ServiceKey, fn as ServiceFn<ServiceKey>);
        }
    }
}
