import type { WorkerService } from '@renderer/worker/server/WorkerService';
import type { ServiceFn, ServiceKey } from '@renderer/worker/shared/calls';
import { pluginServiceName } from '@renderer/worker/shared/pluginCalls';

type AnyServiceFn = ServiceFn<ServiceKey>;

interface ServiceModule {
    name?: string;
    default?: AnyServiceFn;
    services?: Record<string, AnyServiceFn>;
}

const modules = import.meta.glob(['./*.service.ts', './*/*.service.ts'], { eager: true }) as Record<
    string,
    ServiceModule
>;

/**
 * Services contributed by the built-in plugins (`src/plugins/<id>/worker/`).
 *
 * A separate glob from the core one on purpose: these register under a
 * namespaced name and are NOT declared in `ServiceMap`, so keeping the two
 * sets apart is what lets `calls/index.test.ts` go on asserting an exact
 * one-for-one match between the map and the core registrations.
 */
const pluginModules = import.meta.glob(['../../../../plugins/*/worker/*.service.ts'], {
    eager: true,
}) as Record<string, ServiceModule>;

/** `.../plugins/<id>/worker/<name>.service.ts` gives `<id>`. */
function pluginIdFromPath(path: string): string | null {
    const m = /\/plugins\/([^/]+)\/worker\//.exec(path);
    return m ? m[1] : null;
}

/** Install every `services` entry a module exports, under `nameOf(entry)`. */
function registerModule(
    svc: WorkerService,
    path: string,
    m: ServiceModule,
    nameOf: (serviceName: string) => string,
): void {
    if (!m.services || typeof m.services !== 'object') {
        console.warn(`services: skipping ${path} (no 'services' export)`);
        return;
    }
    for (const [serviceName, fn] of Object.entries(m.services)) {
        if (typeof fn !== 'function') continue;
        // The glob iterates over string keys at runtime; cast to the typed
        // ServiceKey domain so `svc.register` enforces ServiceFn<K>. A name
        // not in ServiceMap would compile but produce a runtime warning at
        // first invocation (unknown method) -- which is exactly the state a
        // plugin service is in, hence the namespaced name.
        svc.register(nameOf(serviceName) as ServiceKey, fn as ServiceFn<ServiceKey>);
    }
}

export function registerAllServices(svc: WorkerService): void {
    for (const path of Object.keys(modules).sort()) {
        registerModule(svc, path, modules[path], (name) => name);
    }

    for (const path of Object.keys(pluginModules).sort()) {
        const pluginId = pluginIdFromPath(path);
        if (!pluginId) {
            console.warn(`services: skipping ${path} (cannot read the plugin id from the path)`);
            continue;
        }
        registerModule(svc, path, pluginModules[path], (name) =>
            pluginServiceName(pluginId, name),
        );
    }
}
