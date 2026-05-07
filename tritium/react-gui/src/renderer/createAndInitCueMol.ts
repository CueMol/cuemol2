import { AsyncCueMol } from './worker/client/AsyncCueMol'

// Create a CueMol instance and initialize the underlying C++ library.
//
// sysConfigPath is resolved by the main process (main/index.ts getSysConfigPath):
//   - packaged build: Contents/Resources/cuemol2/share/sysconfig.xml
//   - dev build:      '' → cuemol_internal.node falls back to its compiled-in DEFAULT_CONFIG
//
// The path is forwarded to the Web Worker, which passes it to
// cuemol_internal.initCueMol(path) before any scene operations are performed.
export async function createAndInitCueMol(): Promise<AsyncCueMol> {
    const { sysConfigPath, userStylePath, userStyleExists } =
        await window.electronAPI.getAppPathInfo()
    const cm = new AsyncCueMol()
    await cm.initCueMol(sysConfigPath || undefined)

    // Load user-defined global styles (uxp_gui cuemol2.js L48-55 equivalent).
    // Pass undefined when the file is missing so Worker falls back to
    // createStyleSet("user", 0).
    await cm.loadUserStyle(userStyleExists ? userStylePath : undefined)

    // Set ViewInputConfig.style (uxp_gui cuemol2.js L57-61 equivalent).
    // The "cuemol2.ui.viewinconf" preference is not yet wired up in tritium;
    // use the default name here. When preferences land, read from UiState.
    const inconf = 'DefaultViewInConf'
    await cm.setViewInputConfigStyle(`${inconf},UserViewConf`)

    return cm
}
