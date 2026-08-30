/**
 * @file main/handlers/appPath.ts
 * @description Where the app's own files and its bundled external binaries
 * live, and the IPC channel that reports them.
 *
 * Two answers per question: packaged builds resolve from the install tree
 * under `process.resourcesPath`, dev builds from the env vars the Taskfile
 * exports. A field is the empty string when its dev env var is unset, which
 * the renderer reads as "keep your compiled-in default" rather than as a path.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC } from '@shared/ipcChannels';
import type { AppPathInfo } from '@shared/types/appPath';
import { handleInvoke } from '../ipc/handleInvoke';

export function getSysConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cuemol2', 'share', 'sysconfig.xml')
  }
  return ''
}

export function getUserStylePath(): string {
  return path.join(app.getPath('userData'), 'user_styles.xml')
}

/**
 * Resolve the default external render-binary paths (POV-Ray executable +
 * include dir, blendpng). The renderer (RenderConfigContext) uses these as the
 * fallback when the user has not set an explicit path in Settings.
 *
 * - Packaged: resolved from the app install tree under process.resourcesPath,
 *   mirroring getSysConfigPath. On macOS and Windows these are staged into the
 *   bundle by tritium/packaging/collect-cuemol2-runtime.sh + electron-builder.yml
 *   extraResources (povray/ffmpeg/apbs from BUNDLE_APPS, blendpng from the
 *   libcuemol2 install tree). Linux staging is a follow-up (see ADR-0030).
 * - Dev: resolved from the build-output env vars the Taskfile run task exports
 *   -- LIBCUEMOL2_ROOT (cuemol2 install prefix, holds bin/blendpng) and
 *   BUNDLE_APPS (parent of the downloaded povray/ tree). A field is the empty
 *   string when its env var is unset, so the renderer keeps its compiled-in
 *   default.
 */
export function getRenderBinaries(): AppPathInfo['defaultRenderBinaries'] {
  const exe = process.platform === 'win32' ? '.exe' : ''
  if (app.isPackaged) {
    const res = process.resourcesPath
    return {
      povrayExe: path.join(res, 'bundle_apps', 'povray', 'bin', `povray${exe}`),
      povrayInc: path.join(res, 'bundle_apps', 'povray', 'include'),
      blendpng: path.join(res, 'cuemol2', 'bin', `blendpng${exe}`),
      ffmpeg: path.join(res, 'bundle_apps', 'ffmpeg', 'bin', `ffmpeg${exe}`),
    }
  }
  const root = process.env.LIBCUEMOL2_ROOT
  const bundle = process.env.BUNDLE_APPS
  return {
    povrayExe: bundle ? path.join(bundle, 'povray', 'bin', `povray${exe}`) : '',
    povrayInc: bundle ? path.join(bundle, 'povray', 'include') : '',
    blendpng: root ? path.join(root, 'bin', `blendpng${exe}`) : '',
    ffmpeg: bundle ? path.join(bundle, 'ffmpeg', 'bin', `ffmpeg${exe}`) : '',
  }
}

/**
 * Resolve the default APBS / pdb2pqr executable paths. The renderer
 * (ApbsConfigContext) uses these as the fallback when the user has not set an
 * explicit path in Settings. Same strategy as getRenderBinaries: packaged
 * builds resolve from the bundled `bundle_apps/apbs` tree under
 * process.resourcesPath (staged by collect-cuemol2-runtime.sh), dev builds from
 * the BUNDLE_APPS env var. The executable names match the extpkgs layout
 * (UXP parity): `apbs` / `apbs.exe`, and `pdb2pqr` / `pdb2pqr_wrap.bat`.
 */
export function getApbsBinaries(): AppPathInfo['defaultApbsBinaries'] {
  const exe = process.platform === 'win32' ? '.exe' : ''
  const pdb2pqrName = process.platform === 'win32' ? 'pdb2pqr_wrap.bat' : 'pdb2pqr'
  if (app.isPackaged) {
    const res = process.resourcesPath
    return {
      apbsExe: path.join(res, 'bundle_apps', 'apbs', `apbs${exe}`),
      pdb2pqrExe: path.join(res, 'bundle_apps', 'apbs', pdb2pqrName),
    }
  }
  const bundle = process.env.BUNDLE_APPS
  return {
    apbsExe: bundle ? path.join(bundle, 'apbs', `apbs${exe}`) : '',
    pdb2pqrExe: bundle ? path.join(bundle, 'apbs', pdb2pqrName) : '',
  }
}

/** Register the app-path channel. */
export function registerAppPathHandlers(): void {
  handleInvoke(IPC.APP_PATH, async () => {
    const userStylePath = getUserStylePath()
    let userStyleExists = false
    try {
      userStyleExists = fs.existsSync(userStylePath)
    } catch (e) {
      console.warn('userStyle existsSync failed:', e)
    }
    return {
      appPath: app.getAppPath(),
      exePath: app.getPath('exe'),
      modulePath: app.getPath('module'),
      isPackaged: app.isPackaged,
      sysConfigPath: getSysConfigPath(),
      userStylePath,
      userStyleExists,
      defaultRenderBinaries: getRenderBinaries(),
      defaultApbsBinaries: getApbsBinaries(),
    }
  })
}
