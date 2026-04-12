import { AsyncCueMol } from './worker/AsyncCueMol'

// Create a CueMol instance and initialize the underlying C++ library.
//
// sysConfigPath is resolved by the main process (main/index.ts getSysConfigPath):
//   - packaged build: Contents/Resources/cuemol2/share/sysconfig.xml
//   - dev build:      '' → cuemol_internal.node falls back to its compiled-in DEFAULT_CONFIG
//
// The path is forwarded to the Web Worker, which passes it to
// cuemol_internal.initCueMol(path) before any scene operations are performed.
export async function createAndInitCueMol(): Promise<AsyncCueMol> {
    const { sysConfigPath } = await window.electronAPI.getAppPathInfo()
    const instance = new AsyncCueMol()
    await instance.initCueMol(sysConfigPath || undefined)
    return instance
}
