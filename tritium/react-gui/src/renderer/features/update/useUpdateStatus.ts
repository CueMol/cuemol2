/**
 * @file features/update/useUpdateStatus.ts
 * @description The app update status from main (`IPC.UPDATE_STATUS`), kept current.
 *
 * The first read is an invoke, since the window may mount after main's first
 * push; every change after that arrives as a push.
 */

import { useEffect, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { UpdateStatus } from '@shared/types/update'

/** The latest status, or null until the first read returns. */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    let alive = true
    void api.invoke(IPC.UPDATE_GET_STATUS).then((s) => { if (alive) setStatus((cur) => cur ?? s) })
    const off = api.onPush(IPC.UPDATE_STATUS, (s) => setStatus(s))
    return () => { alive = false; off() }
  }, [])
  return status
}
