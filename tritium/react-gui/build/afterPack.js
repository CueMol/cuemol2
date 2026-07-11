/**
 * @file build/afterPack.js
 * @description electron-builder afterPack hook that applies a deep ad-hoc code
 * signature to the packaged macOS .app.
 *
 * Why this hook exists instead of `mac.identity`:
 * electron-builder 25.x does NOT ad-hoc sign via `mac.identity: "-"`. It treats
 * "-" as a keychain identity name, finds no matching identity, and logs
 * "skipped macOS application code signing", leaving the bundle with only the
 * linker's per-binary ad-hoc signatures and no _CodeSignature seal -- so
 * `codesign --verify` fails and Gatekeeper still treats the app as damaged.
 *
 * We sign here instead, mirroring the uxp_gui dmg.py ad-hoc recipe:
 *   codesign --force --deep --sign - <App>.app
 * No secure timestamp, no hardened runtime, no entitlements -- ad-hoc only, so
 * it needs no keychain / identity / secrets and works on ephemeral CI runners.
 * afterPack runs after the .app is assembled and before the DMG is built, so the
 * signed bundle is what ends up inside the DMG.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`afterPack: app bundle not found at ${appPath}`);
  }

  console.log(`afterPack: ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  // Fail the build loudly if the ad-hoc signature does not verify, so a green
  // build guarantees a valid signature (not just a skipped signing step).
  execFileSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { stdio: 'inherit' },
  );
};
