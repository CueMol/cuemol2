import { AsyncCueMol } from './worker/client/AsyncCueMol'
import { IPC } from '../shared/ipcChannels'
import {
    DEFAULT_INPUT_DEVICE_MODE,
    normalizeInputDeviceMode,
    viewInputStyleName,
} from './viewInputConfig'

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
        await window.electronAPI.invoke(IPC.APP_PATH)
    const cm = new AsyncCueMol()
    await cm.initCueMol(sysConfigPath || undefined)

    // Load user-defined global styles (uxp_gui cuemol2.js L48-55 equivalent).
    // Pass undefined when the file is missing so Worker falls back to
    // createStyleSet("user", 0).
    await cm.loadUserStyle(userStyleExists ? userStylePath : undefined)

    // Set ViewInputConfig.style (uxp_gui cuemol2.js L57-61 equivalent),
    // choosing the mouse/trackpad preset from the persisted preference. The
    // SettingsPane re-applies live on change (ViewInputConfigContext).
    let inputMode = DEFAULT_INPUT_DEVICE_MODE
    try {
        const ui = await window.electronAPI.invoke(IPC.UI_LOAD)
        inputMode = normalizeInputDeviceMode(ui?.inputDeviceMode)
    } catch {
        // UI state unavailable (e.g. Vite dev server) -- keep the default.
    }
    await cm.setViewInputConfigStyle(viewInputStyleName(inputMode))

    return cm
}
