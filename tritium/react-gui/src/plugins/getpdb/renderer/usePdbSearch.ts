/**
 * @file plugins/getpdb/renderer/usePdbSearch.ts
 * @description Keyword search for the Get PDB dialog: run a full-text search
 * of the PDB, page through the hits, and drop a result that arrives after a
 * newer search has started.
 */

import { useCallback, useState } from 'react'
import { useCueMol } from '@renderer/plugin-host/api'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import type { EntryInfo, SearchMethodFilter, SearchSort } from '@renderer/worker/shared/pdbEntryInfo'

/** Hits fetched per request (the first page, and each "More"). */
export const SEARCH_PAGE_ROWS = 25

export interface PdbSearchState {
  /** The query as searched (trimmed). */
  query: string
  method: SearchMethodFilter
  sort: SearchSort
  total: number
  entries: EntryInfo[]
  loading: boolean
  error: string | null
}

export interface PdbSearch {
  /** The current search, or null before the first one. */
  state: PdbSearchState | null
  /** Start a new search; the hits of any earlier one are dropped. */
  run: (query: string, method: SearchMethodFilter, sort: SearchSort) => void
  /** Fetch the next page of the current search. */
  more: () => void
  /** Forget the current search (the dialog was closed). */
  reset: () => void
}

/**
 * Keyword search state for one dialog.
 *
 * @returns the current search and the actions that change it
 */
export function usePdbSearch(): PdbSearch {
  const { cm } = useCueMol()
  const guard = useStaleGuard()
  const [state, setState] = useState<PdbSearchState | null>(null)

  const fetchPage = useCallback(
    (base: PdbSearchState, start: number) => {
      if (!cm) return
      const token = guard.next()
      setState({ ...base, loading: true, error: null })
      cm.invokeService('searchPdbEntries', {
        query: base.query, method: base.method, sort: base.sort, start, rows: SEARCH_PAGE_ROWS,
      })
        .then((res) => {
          if (!guard.isCurrent(token)) return
          setState(res.ok
            ? { ...base, total: res.total, entries: [...base.entries, ...res.entries], loading: false, error: null }
            : { ...base, loading: false, error: res.error })
        })
        .catch((e: unknown) => {
          if (!guard.isCurrent(token)) return
          setState({ ...base, loading: false, error: e instanceof Error ? e.message : String(e) })
        })
    },
    [cm, guard],
  )

  const run = useCallback(
    (query: string, method: SearchMethodFilter, sort: SearchSort) => {
      const q = query.trim()
      if (q.length === 0) return
      fetchPage({ query: q, method, sort, total: 0, entries: [], loading: true, error: null }, 0)
    },
    [fetchPage],
  )

  const more = useCallback(() => {
    if (!state || state.loading || state.entries.length >= state.total) return
    fetchPage(state, state.entries.length)
  }, [state, fetchPage])

  const reset = useCallback(() => {
    guard.invalidate()
    setState(null)
  }, [guard])

  return { state, run, more, reset }
}
