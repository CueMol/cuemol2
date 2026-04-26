import path from 'path';
import { fileURLToPath } from 'url';
import bindings from 'bindings';
import { CueMol } from './cuemol';
export { CueMol } from './cuemol';
import type { CueMolInternal } from './interfaces';
import { createLogger } from "@/logger";

const log = createLogger(import.meta.url);

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type for the CueMol singleton wrapper
interface CueMolSingleton {
    value: CueMol | null;
}

// Load the native addon
const _internal = bindings('cuemol_internal.node') as CueMolInternal;

// Singleton instance of CueMol
const cuemol: CueMolSingleton = { value: null };

// Debug logging
log.debug("bindings: %s", bindings);
log.debug("bindings('cuemol_internal.node'): %s", bindings('cuemol_internal.node'));
log.debug("_internal: %s", _internal);

/**
 * Get the native CueMol internal module
 * @returns The native addon module
 */
export function getModule(): CueMolInternal {
    return _internal;
}

/**
 * Get the system configuration file path
 * @returns Absolute path to sysconfig.xml
 */
export function getSysConfigPath(): string {
    // Note: __dirname equivalent in ES modules
    const load_path = path.join(__dirname, 'build', 'data', 'sysconfig.xml');
    log.info('load_path: <%s>', load_path);
    return load_path;
}

/**
 * Create and initialize the CueMol singleton instance
 * @param sysconfig_path - Optional path to system configuration file
 * @returns The CueMol instance
 */
export function createCueMol(sysconfig_path: string = ''): CueMol {
    if (cuemol.value) {
        log.info('cuemol already created');
        return cuemol.value;
    }

    cuemol.value = new CueMol({ internal: _internal });
    cuemol.value.initCueMol(sysconfig_path);
    return cuemol.value;
}

