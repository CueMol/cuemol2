/**
 * @file features/update/UpdateCheckRow.tsx
 * @description Settings > General > Updates: check, download and install from the row itself.
 *
 * Works whether or not the startup check is on, and apart from the
 * notifications: every step is shown here -- the result of Check Now, the
 * download's progress (with Cancel), Restart and Update once it is down,
 * and the release page for a manual install when a newer version is known --
 * and no notification is raised for any of them (updateOrigin.ts). Pressing
 * Restart and Update is the confirmation, so the confirm dialog of the
 * notification route is not shown; the modal unpack progress still is.
 */

import React from 'react'
import { ProgressBar } from '@blueprintjs/core'
import { IPC } from '@shared/ipcChannels'
import type { UpdateStatus } from '@shared/types/update'
import { ButtonRow, FormButton } from '@renderer/h3-kit/form'
import { useUpdateStatus } from './useUpdateStatus'
import { setUpdateOrigin } from './updateOrigin'

/** The update channels a button of this row sends; none takes an argument. */
type RowChannel =
  | typeof IPC.UPDATE_CHECK | typeof IPC.UPDATE_DOWNLOAD | typeof IPC.UPDATE_CANCEL
  | typeof IPC.UPDATE_INSTALL | typeof IPC.UPDATE_RESTART | typeof IPC.UPDATE_OPEN_RELEASE

/** Act on the update from this row, which then shows the flow itself. */
function send(channel: RowChannel): void {
  setUpdateOrigin('settings')
  void window.electronAPI?.invoke(channel)
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/**
 * One line saying where the update stands, or null when there is nothing to
 * add to the version line (not checked yet). The running version has a line
 * of its own: put in this sentence it wrapped mid-phrase in the narrow
 * control column.
 */
function describe(status: UpdateStatus): string | null {
  if (!status.supported) return 'Updates are not available in this build.'
  const s = status.state
  switch (s.phase) {
    case 'idle':
      return null
    case 'checking':
      return 'Checking for updates...'
    case 'upToDate':
      return 'This is the latest version.'
    case 'available':
      return status.canInstall
        ? `CueMol3 ${s.release.version} is available.`
        : `CueMol3 ${s.release.version} is available. ${status.reason ?? ''} Download it from the release page.`
    case 'downloading':
      return `Downloading CueMol3 ${s.release.version}... ${mb(s.received)} / ${mb(s.total)} MB`
    case 'downloaded':
      return `CueMol3 ${s.release.version} has been downloaded. CueMol3 will quit, replace itself and start again.`
    case 'installing':
      return `Installing CueMol3 ${s.release.version}...`
    case 'readyToRestart':
      return `Restart CueMol3 to finish updating to ${s.release.version}.`
    case 'error':
      return s.release ? `Updating to CueMol3 ${s.release.version} failed: ${s.message}` : s.message
  }
}

/** See the file header. */
export const UpdateCheckRow: React.FC = () => {
  const status = useUpdateStatus()
  if (!status) return null
  const s = status.state

  let buttons: React.ReactNode
  switch (s.phase) {
    case 'downloading':
      buttons = <FormButton onClick={() => send(IPC.UPDATE_CANCEL)}>Cancel</FormButton>
      break
    case 'downloaded':
      buttons = (
        <FormButton intent="primary" onClick={() => send(IPC.UPDATE_INSTALL)}>Restart and Update</FormButton>
      )
      break
    case 'installing':
      buttons = null
      break
    case 'readyToRestart':
      buttons = (
        <FormButton intent="primary" onClick={() => send(IPC.UPDATE_RESTART)}>Restart to Update</FormButton>
      )
      break
    default: {
      // idle / checking / upToDate / available / error: check, and update
      // when there is something to install (a failed download can retry).
      // The release page is there for a manual install whenever a newer
      // version is known, also where this install cannot replace itself.
      const hasRelease = s.phase === 'available' || (s.phase === 'error' && !!s.release)
      const canUpdate = status.canInstall && hasRelease
      buttons = (
        <>
          <FormButton disabled={!status.supported || s.phase === 'checking'} onClick={() => send(IPC.UPDATE_CHECK)}>
            Check Now
          </FormButton>
          <FormButton disabled={!hasRelease} onClick={() => send(IPC.UPDATE_OPEN_RELEASE)}>
            Release Page
          </FormButton>
          <FormButton intent="primary" disabled={!canUpdate} onClick={() => send(IPC.UPDATE_DOWNLOAD)}>
            Update
          </FormButton>
        </>
      )
    }
  }

  return (
    <div className="update-check-row">
      {status.supported && (
        <div className="update-check-version type-body">Current version: {status.current}</div>
      )}
      {describe(status) && <div className="update-check-status type-body">{describe(status)}</div>}
      {s.phase === 'downloading' && (
        <ProgressBar intent="primary" value={s.total ? s.received / s.total : undefined} />
      )}
      {buttons && <ButtonRow>{buttons}</ButtonRow>}
    </div>
  )
}
