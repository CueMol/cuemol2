import path from 'path';
import { fileURLToPath } from 'url';
import bindings from 'bindings';
import { CueMol, EventManager } from './cuemol.js';
// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load the native addon
const _internal = bindings('cuemol_internal.node');
// Singleton instance of CueMol
const cuemol = { value: null };
// Debug logging
console.log(">>>>> bindings: ", bindings);
console.log(">>>>> bindings('cuemol_internal.node'): ", bindings('cuemol_internal.node'));
console.log(">>>>> _internal: ", _internal);
/**
 * Get the native CueMol internal module
 * @returns The native addon module
 */
export function getModule() {
    return _internal;
}
/**
 * Get the system configuration file path
 * @returns Absolute path to sysconfig.xml
 */
export function getSysConfigPath() {
    // Note: __dirname equivalent in ES modules
    const load_path = path.join(__dirname, 'build', 'data', 'sysconfig.xml');
    console.log('load_path:', load_path);
    return load_path;
}
/**
 * Create and initialize the CueMol singleton instance
 * @param sysconfig_path - Optional path to system configuration file
 * @returns The CueMol instance
 */
export function createCueMol(sysconfig_path = '') {
    if (cuemol.value) {
        console.log('cuemol already created');
        return cuemol.value;
    }
    cuemol.value = new CueMol({ internal: _internal });
    cuemol.value.initCueMol(sysconfig_path);
    return cuemol.value;
}
// Event manager singleton
let event_manager = null;
/**
 * Get or create the EventManager singleton
 * @returns The EventManager instance, or null if CueMol is not initialized
 */
export function getEventManager() {
    if (cuemol.value === null) {
        console.log('cuemol not created');
        return null;
    }
    if (event_manager) {
        return event_manager;
    }
    event_manager = new EventManager(cuemol.value);
    return event_manager;
}
