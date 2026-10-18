/**
 * @file features/update/UpdateBridge.tsx
 * @description Shows the app update status (main/updater) as notifications and dialogs.
 *
 * Main owns the flow and pushes the whole status on every change
 * (`IPC.UPDATE_STATUS`); this component turns each status into one
 * notification (kept and updated in place), opens the confirm dialog when a
 * download completes, shows the modal progress while the new app is
 * unpacked, and starts the restart once it is staged. The previous update's
 * outcome gets a notification of its own.
 *
 * In a dev build `dev.updateSample` feeds made-up statuses instead, so the
 * UI can be inspected without a release (task inspect_tritium_ui).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { UpdatePhase, UpdateStatus, UpdateSwapResult } from '@shared/types/update'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useNotify, type NotificationInput } from '@renderer/shell/notifications'
import { useShowUpdateConfirmDialog } from './UpdateConfirmDialog'
import { UpdateProgressDialog } from './UpdateProgressDialog'
import { sampleUpdateStatus } from './updateSamples'
import { useUpdateStatus } from './useUpdateStatus'
import { getUpdateOrigin, setUpdateOrigin } from './updateOrigin'

const SOURCE = 'CueMol3 Update'

/** The update channels a button sends; all take no argument. */
type UpdateChannel =
  | typeof IPC.UPDATE_DOWNLOAD | typeof IPC.UPDATE_CANCEL | typeof IPC.UPDATE_INSTALL
  | typeof IPC.UPDATE_RESTART | typeof IPC.UPDATE_OPEN_RELEASE | typeof IPC.UPDATE_DISMISS_RESULT

function send(channel: UpdateChannel): void {
  void window.electronAPI?.invoke(channel)
}

/** What the notification buttons do; inert for a dev sample. */
export interface UpdateActions {
  send(channel: UpdateChannel): void
  /** Ask "restart and update now?" and install on yes. */
  confirmInstall(): void
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/** The notification for a status, or null for none. */
export function updateNotification(status: UpdateStatus, act: UpdateActions): NotificationInput | null {
  const s: UpdatePhase = status.state
  const run = (channel: UpdateChannel) => () => act.send(channel)
  const releasePage = { label: 'Release Page', run: run(IPC.UPDATE_OPEN_RELEASE) }
  switch (s.phase) {
    case 'available':
      return {
        severity: 'info',
        persistent: true,
        message: `CueMol3 ${s.release.version} is available.`,
        detail: status.canInstall
          ? `You have ${status.current}.`
          : `You have ${status.current}. ${status.reason ?? ''} Download it from the release page.`,
        source: SOURCE,
        actions: status.canInstall
          ? [releasePage, { label: 'Update', primary: true, run: run(IPC.UPDATE_DOWNLOAD) }]
          : [releasePage],
      }
    case 'downloading':
      return {
        severity: 'info',
        message: `Downloading CueMol3 ${s.release.version}...`,
        source: SOURCE,
        progress: {
          fraction: s.total ? s.received / s.total : null,
          label: s.total
            ? `${mb(s.received)} / ${mb(s.total)} MB (${Math.round((s.received / s.total) * 100)}%)`
            : `${mb(s.received)} MB`,
        },
        actions: [{ label: 'Cancel', run: run(IPC.UPDATE_CANCEL) }],
      }
    case 'downloaded':
      return {
        severity: 'info',
        persistent: true,
        message: `CueMol3 ${s.release.version} has been downloaded.`,
        source: SOURCE,
        actions: [{ label: 'Install and Restart', primary: true, run: () => act.confirmInstall() }],
      }
    case 'installing':
      // The modal UpdateProgressDialog shows this step; a second bar in a
      // notification behind it only repeated it.
      return null
    case 'readyToRestart':
      return {
        severity: 'info',
        persistent: true,
        message: `Restart CueMol3 to finish updating to ${s.release.version}.`,
        source: SOURCE,
        actions: [{ label: 'Restart to Update', primary: true, run: run(IPC.UPDATE_RESTART) }],
      }
    case 'upToDate':
      return s.manual
        ? { severity: 'info', message: `CueMol3 ${status.current} is the latest version.`, source: SOURCE }
        : null
    case 'error':
      return {
        severity: 'error',
        persistent: !!s.release,
        message: s.release ? `Updating to CueMol3 ${s.release.version} failed.` : 'Could not check for updates.',
        detail: s.message,
        source: SOURCE,
        actions: s.release
          ? [releasePage, { label: 'Retry', primary: true, run: run(IPC.UPDATE_DOWNLOAD) }]
          : [releasePage],
      }
    case 'idle':
    case 'checking':
      return null
  }
}

/** The notification reporting the previous update's outcome. */
export function resultNotification(r: UpdateSwapResult, act: UpdateActions): NotificationInput {
  const releasePage = { label: 'Release Page', run: () => act.send(IPC.UPDATE_OPEN_RELEASE) }
  switch (r.outcome) {
    case 'ok':
      return { severity: 'info', message: `CueMol3 has been updated to ${r.to}.`, source: SOURCE }
    case 'rolledBack':
      return {
        severity: 'warning',
        message: `CueMol3 ${r.to} did not start, so ${r.from} was restored.`,
        detail: 'Install the new version by hand from the release page, or report the problem.',
        source: SOURCE,
        actions: [releasePage],
      }
    default:
      return {
        severity: 'warning',
        message: `The update to CueMol3 ${r.to} was not installed.`,
        detail: r.detail,
        source: SOURCE,
        actions: [releasePage],
      }
  }
}

/** See the file header. Mounted once in App; renders only the progress dialog. */
export const UpdateBridge: React.FC = () => {
  const notifyApi = useNotify()
  const showConfirm = useShowUpdateConfirmDialog()
  const real = useUpdateStatus()
  const [sample, setSample] = useState<UpdateStatus | null>(null)
  const status = sample ?? real
  const dev = sample !== null

  const confirmInstall = useCallback((st: UpdateStatus | null) => {
    const ph = st?.state
    if (!st || ph?.phase !== 'downloaded') return
    void showConfirm({ version: ph.release.version, current: st.current, notes: ph.release.notes })
      .then((ok) => { if (ok) send(IPC.UPDATE_INSTALL) })
  }, [showConfirm])

  // --- The flow notification: one, updated in place ---
  const noteId = useRef<number | null>(null)
  const prevPhase = useRef<string>('idle')
  // Set by Help > Check for Updates: show the notification again even when
  // the phase did not change (the update was already on offer, hidden).
  const forceToast = useRef(false)
  useEffect(() => {
    if (!status) return
    const phase = status.state.phase
    const act: UpdateActions = dev
      ? { send: () => {}, confirmInstall: () => {} }
      : {
          send: (ch) => { setUpdateOrigin('notification'); send(ch) },
          confirmInstall: () => { setUpdateOrigin('notification'); confirmInstall(status) },
        }
    // Driven from the Settings row: that row shows every step, so no
    // notification at all (and an earlier one is taken down).
    const fromSettings = getUpdateOrigin() === 'settings'
    const input = fromSettings ? null : updateNotification(status, act)
    const phaseChanged = phase !== prevPhase.current || forceToast.current
    if (phase !== 'checking') forceToast.current = false
    const fromPhase = prevPhase.current
    prevPhase.current = phase

    // Steps of the flow itself, whichever surface shows it -- before the
    // notification part, which has nothing to do for the Settings row.
    if (!dev && phase !== fromPhase) {
      const s = status.state
      // The download just finished: ask now rather than waiting for a click
      // (the Settings row asks with its own Restart and Update button).
      if (s.phase === 'downloaded' && fromPhase === 'downloading' && !fromSettings) confirmInstall(status)
      // Unpacked after the user said yes: go on to the restart.
      if (s.phase === 'readyToRestart' && fromPhase === 'installing') send(IPC.UPDATE_RESTART)
    }

    if (!input) {
      if (noteId.current !== null) notifyApi.dismiss(noteId.current)
      noteId.current = null
      return
    }
    // Fields a later status no longer has must be cleared, not kept.
    const full: NotificationInput = {
      detail: undefined, progress: undefined, actions: undefined, persistent: undefined, ...input,
    }
    if (noteId.current === null) noteId.current = notifyApi.notify(full)
    else notifyApi.update(noteId.current, full, phaseChanged)
  }, [status, dev, notifyApi, confirmInstall])

  // --- The previous update's outcome ---
  const reported = useRef(false)
  useEffect(() => {
    const r = status?.lastResult
    if (!r || reported.current) return
    reported.current = true
    const act: UpdateActions = dev ? { send: () => {}, confirmInstall: () => {} } : { send, confirmInstall: () => {} }
    notifyApi.notify({ ...resultNotification(r, act), onClose: () => act.send(IPC.UPDATE_DISMISS_RESULT) })
  }, [status, dev, notifyApi])

  // --- Commands ---
  useRegisterCommand(CmdId.AppCheckForUpdates, useCallback(async () => {
    setSample(null)
    setUpdateOrigin('notification')
    forceToast.current = true
    if (real && !real.supported) {
      notifyApi.notify({ severity: 'info', message: 'Updates are not available in this build.', source: SOURCE })
      return
    }
    await window.electronAPI?.invoke(IPC.UPDATE_CHECK)
  }, [real, notifyApi]))

  useRegisterCommand(CmdId.DevUpdateSample, useCallback(({ state }: { state: string }) => {
    if (!__DEV_UI__) return
    reported.current = false
    const st = sampleUpdateStatus(state === 'confirm' ? 'downloaded' : state)
    setSample(st)
    // The confirm dialog normally opens on the downloading -> downloaded step.
    if (state === 'confirm' && st.state.phase === 'downloaded') {
      void showConfirm({ version: st.state.release.version, current: st.current, notes: st.state.release.notes })
    }
  }, [showConfirm]))

  const s = status?.state
  return (
    <UpdateProgressDialog
      visible={s?.phase === 'installing'}
      version={s && 'release' in s && s.release ? s.release.version : ''}
      step={s?.phase === 'installing' ? s.step : 'mount'}
      fraction={s?.phase === 'installing' ? s.fraction : 0}
    />
  )
}
