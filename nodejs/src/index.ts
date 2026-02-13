import path from 'path';
import { fileURLToPath } from 'url';
import bindings from 'bindings';
import { CueMol, CueMolInternal } from './cuemol';

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
console.log(">>>>> bindings: ", bindings);
console.log(">>>>> bindings('cuemol_internal.node'): ", bindings('cuemol_internal.node'));
console.log(">>>>> _internal: ", _internal);

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
  console.log('load_path:', load_path);
  return load_path;
}

/**
 * Create and initialize the CueMol singleton instance
 * @param sysconfig_path - Optional path to system configuration file
 * @returns The CueMol instance
 */
export function createCueMol(sysconfig_path: string = ''): CueMol {
  if (cuemol.value) {
    console.log('cuemol already created');
    return cuemol.value;
  }
  
  cuemol.value = new CueMol({ internal: _internal });
  cuemol.value.initCueMol(sysconfig_path);
  return cuemol.value;
}

