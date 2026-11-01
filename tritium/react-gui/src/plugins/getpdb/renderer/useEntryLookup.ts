/**
 * @file plugins/getpdb/renderer/useEntryLookup.ts
 * @description Look up the accession typed into the Get PDB dialog: the RCSB
 * entry record for a PDB ID (which says whether it is crystallographic or
 * cryo-EM, and names its EMDB maps), and the EMDB map record of every map
 * the dialog may offer (recommended contour level, file size).
 *
 * The lookup waits for typing to pause, and a result that arrives after the
 * input has changed is dropped. A failed lookup never blocks a download: the
 * dialog falls back to offering what it always offered.
 */

import { useEffect, useState } from 'react'
import { useCueMol } from '@renderer/plugin-host/api'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import { parseAccession, type Accession } from '@renderer/worker/shared/pdbUrls'
import type { EmdbMapInfo, EntryInfo } from '@renderer/worker/shared/pdbEntryInfo'

/** How long typing has to pause before the lookup starts. */
const LOOKUP_DEBOUNCE_MS = 400

export type EntryLookup =
  /** The input is not an accession code. */
  | { status: 'idle' }
  | { status: 'loading'; accession: Accession }
  /** A PDB entry RCSB knows. */
  | { status: 'pdb'; accession: Accession; entry: EntryInfo }
  /** An EMDB entry typed directly (no PDB entry in front of it). */
  | { status: 'emdb'; accession: Accession }
  | { status: 'not-found'; accession: Accession }
  /** The lookup itself failed (offline, server error). */
  | { status: 'error'; accession: Accession; message: string }

/** Per EMDB ID: its map record, still loading, or unreadable. */
export type EmdbInfoMap = Readonly<Record<string, EmdbMapInfo | 'loading' | 'error'>>

export interface EntryLookupState {
  lookup: EntryLookup
  emdbInfo: EmdbInfoMap
}

const IDLE: EntryLookupState = { lookup: { status: 'idle' }, emdbInfo: {} }

/**
 * Look up `text` while `active`, debounced.
 *
 * @param text - the raw accession input
 * @param active - false while the dialog is hidden (the state resets)
 * @returns the entry lookup and the EMDB map records found so far
 */
export function useEntryLookup(text: string, active: boolean): EntryLookupState {
  const { cm } = useCueMol()
  const guard = useStaleGuard()
  const [state, setState] = useState<EntryLookupState>(IDLE)

  const accession = active ? parseAccession(text) : null
  const key = accession ? `${accession.kind}:${accession.id}` : ''

  useEffect(() => {
    guard.invalidate()
    if (!accession || !cm) {
      setState(IDLE)
      return
    }
    setState({ lookup: { status: 'loading', accession }, emdbInfo: {} })
    const token = guard.next()

    const setEmdb = (id: string, v: EmdbMapInfo | 'loading' | 'error') => {
      if (!guard.isCurrent(token)) return
      setState((s) => ({ ...s, emdbInfo: { ...s.emdbInfo, [id]: v } }))
    }
    const loadEmdb = (ids: string[]) => {
      for (const id of ids) {
        setEmdb(id, 'loading')
        cm.invokeService('fetchEmdbMapInfo', { emdbId: id })
          .then((res) => setEmdb(id, res.ok ? res.info : 'error'))
          .catch(() => setEmdb(id, 'error'))
      }
    }

    const run = async (): Promise<void> => {
      if (accession.kind === 'emdb') {
        const res = await cm.invokeService('fetchEmdbMapInfo', { emdbId: accession.id })
        if (!guard.isCurrent(token)) return
        if (res.ok) {
          setState({ lookup: { status: 'emdb', accession }, emdbInfo: { [accession.id]: res.info } })
        } else if (res.code === 'not-found') {
          setState({ lookup: { status: 'not-found', accession }, emdbInfo: {} })
        } else {
          setState({ lookup: { status: 'error', accession, message: res.error }, emdbInfo: {} })
        }
        return
      }
      const res = await cm.invokeService('fetchEntryInfo', { pdbIds: [accession.id] })
      if (!guard.isCurrent(token)) return
      if (!res.ok) {
        setState({ lookup: { status: 'error', accession, message: res.error }, emdbInfo: {} })
        return
      }
      const entry = res.entries.find((e) => e.id === accession.id)
      if (!entry) {
        setState({ lookup: { status: 'not-found', accession }, emdbInfo: {} })
        return
      }
      setState({ lookup: { status: 'pdb', accession, entry }, emdbInfo: {} })
      loadEmdb(entry.emdbIds)
    }

    const timer = setTimeout(() => {
      run().catch((e: unknown) => {
        if (!guard.isCurrent(token)) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ lookup: { status: 'error', accession, message }, emdbInfo: {} })
      })
    }, LOOKUP_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      guard.invalidate()
    }
    // `key` stands for `accession`, which is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cm, guard])

  return state
}
