/**
 * @file build/updaterLauncher.js
 * @description Builds `CueMol3 Updater.exe` into a packaged Windows app's resources.
 *
 * The launcher is the elevated half of the Windows self-update; what it does
 * is in build/updater-launcher.nsi. It exists so that the UAC prompt names
 * CueMol3 (file name "CueMol3 Updater.exe", the app's icon; the publisher
 * stays "Unknown" while the app is unsigned), and so that what runs
 * elevated is a fixed program rather than a script read from a directory the
 * user can write to.
 *
 * Built with the same makensis electron-builder uses for the installer
 * (app-builder-lib's NSIS_PATH, downloaded into its cache on first use), so
 * neither the repository nor a build machine carries a binary for it.
 */
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** File name under resources/; the app's WinInstaller looks for exactly this. */
const LAUNCHER_NAME = 'CueMol3 Updater.exe';

/** electron-builder's namespace for the NSIS app GUID (app-builder-lib targets/nsis). */
const ELECTRON_BUILDER_NS_UUID = '50e065bc-3134-11e6-9bab-38c9862bdaf3';

/**
 * The NSIS app GUID electron-builder gives an appId (UUID v5 in its own
 * namespace). The installer names its registry keys with it, and the
 * launcher backs those keys up.
 *
 * @param appId - e.g. `org.cuemol.cuemol3`
 */
function appGuid(appId) {
  const ns = Buffer.from(ELECTRON_BUILDER_NS_UUID.replace(/-/g, ''), 'hex');
  const h = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(appId)])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join('-');
}

/** app-builder-lib as electron-builder resolves it (it is not a direct dependency). */
function appBuilderLib(rel) {
  const eb = require.resolve('electron-builder');
  return require(require.resolve(`app-builder-lib/${rel}`, { paths: [eb] }));
}

/**
 * Write the launcher into the packed app (Windows only).
 *
 * @param context - electron-builder's afterPack context
 * @returns the launcher's path, or null on other platforms
 */
async function buildUpdaterLauncher(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  if (electronPlatformName !== 'win32') return null;
  const { NSIS_PATH } = appBuilderLib('out/targets/nsis/nsisUtil');
  const nsisDir = await NSIS_PATH();
  const makensis = path.join(nsisDir, process.platform === 'win32' ? 'Bin/makensis.exe' : 'linux/makensis');

  const out = path.join(appOutDir, 'resources', LAUNCHER_NAME);
  const defines = {
    OUT_FILE: out,
    ICON: path.join(packager.info.buildResourcesDir, 'icon.ico'),
    VERSION: packager.appInfo.getVersionInWeirdWindowsForm(),
    COPYRIGHT: packager.appInfo.copyright,
    APP_GUID: appGuid(packager.appInfo.id),
  };
  execFileSync(
    makensis,
    [
      '/V2',
      '/INPUTCHARSET',
      'UTF8',
      ...Object.entries(defines).map(([k, v]) => `/D${k}=${v}`),
      path.join(__dirname, 'updater-launcher.nsi'),
    ],
    { stdio: 'inherit' },
  );
  if (!fs.existsSync(out)) throw new Error(`updaterLauncher: makensis did not write ${out}`);
  return out;
}

module.exports = { buildUpdaterLauncher, appGuid, LAUNCHER_NAME };
