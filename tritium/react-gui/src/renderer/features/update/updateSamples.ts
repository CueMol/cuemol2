/**
 * @file features/update/updateSamples.ts
 * @description Made-up update statuses for `dev.updateSample` (dev builds, UI inspection).
 */

import type { UpdateRelease, UpdateStatus } from '@shared/types/update'

const RELEASE: UpdateRelease = {
  version: '2.3.22.550',
  htmlUrl: 'https://github.com/CueMol/cuemol2/releases/tag/v2.3.22.550',
  notes: '## CueMol3\n\n- Self-update from the app\n- Notifications in the status bar\n\n## Fixes\n\n- The window reveal waits one task after ready',
  asset: { name: 'CueMol3-2.3.22.550-macOS-arm64-Installer.dmg', url: '', size: 208_675_573, digest: '' },
}

/**
 * A status for `state`: `available`, `available-manual-only`, `downloading`,
 * `downloaded` (`confirm` also opens the confirm dialog), `installing`, `readyToRestart`, `upToDate`, `error`,
 * `result-ok` or `result-rolledBack`.
 */
export function sampleUpdateStatus(state: string): UpdateStatus {
  const base: UpdateStatus = { supported: true, current: '2.3.21.544', canInstall: true, state: { phase: 'idle' } }
  switch (state) {
    case 'available':
      return { ...base, state: { phase: 'available', release: RELEASE } }
    case 'available-manual-only':
      return {
        ...base,
        canInstall: false,
        reason: 'No permission to replace /Applications/CueMol3.app.',
        state: { phase: 'available', release: RELEASE },
      }
    case 'downloading':
      return { ...base, state: { phase: 'downloading', release: RELEASE, received: 87_654_321, total: RELEASE.asset.size } }
    case 'downloaded':
      return { ...base, state: { phase: 'downloaded', release: RELEASE } }
    case 'installing':
      return { ...base, state: { phase: 'installing', release: RELEASE, step: 'copy', fraction: 0.42 } }
    case 'readyToRestart':
      return { ...base, state: { phase: 'readyToRestart', release: RELEASE } }
    case 'upToDate':
      return { ...base, state: { phase: 'upToDate', manual: true } }
    case 'error':
      return {
        ...base,
        state: {
          phase: 'error',
          release: RELEASE,
          message: 'downloaded file does not match the release digest (sha256:9855ab881596a08f2c55f5070f505067b0851c086445bc04073134716d90492c)',
        },
      }
    case 'result-ok':
      return { ...base, lastResult: { outcome: 'ok', from: '2.3.21.543', to: '2.3.21.544', detail: '' } }
    case 'result-rolledBack':
      return {
        ...base,
        lastResult: { outcome: 'rolledBack', from: '2.3.21.544', to: '2.3.22.550', detail: 'the new version did not start' },
      }
    default:
      return base
  }
}
