/**
 * @file plugins/getpdb/renderer/GetPdbDialog.tsx
 * @description The Get PDB form: a PDB or EMDB accession code (or keywords to
 * search for one), then which of the entry's files to fetch, and from which
 * server.
 *
 * The code is looked up as it is typed (`useEntryLookup`), and the map
 * section follows what the entry is: a crystallographic entry offers its
 * 2Fo-Fc / Fo-Fc maps, a cryo-EM entry its EMDB maps, and an EMDB code typed
 * directly offers that map alone. When the lookup fails the dialog offers
 * what it always did (coordinates and crystallographic maps), so a download
 * never depends on the lookup.
 *
 * The one field takes keywords too. Text that is not an accession code is
 * searched for on Enter, and the hits are listed under the field; picking a
 * row makes that entry the one the rest of the form is about, exactly as if
 * its ID had been typed. Typing an ID again closes the list.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { DialogShell } from '@renderer/plugin-host/api'
import {
  isImeKey,
  ButtonRow,
  CheckboxField,
  ComboBoxField,
  Field,
  FieldGrid,
  FieldGridRow,
  FieldSection,
  FormButton,
  RadioField,
  SelectField,
} from '@renderer/h3-kit/form'
import { Listbox, ListRow, TruncatedText } from '@renderer/h3-kit/list'
import { getHistory, pushHistory } from './pdbIdHistory'
import { parseAccession } from '@renderer/worker/shared/pdbUrls'
import type { EmdbMapInfo, EntryInfo, SearchMethodFilter, SearchSort } from '@renderer/worker/shared/pdbEntryInfo'
import { useEntryLookup, type EmdbInfoMap, type EntryLookup } from './useEntryLookup'
import { usePdbSearch, type PdbSearchState } from './usePdbSearch'

// The server choices are shared with the worker (see worker/shared/pdbUrls.ts),
// which builds the URLs for a headless fetch too.
import type {
  Accession,
  CoordServerType,
  EmdbServerType,
  MapServerType,
} from '@renderer/worker/shared/pdbUrls'

export type { CoordServerType, EmdbServerType, MapServerType }

/** One EMDB map to fetch. */
export interface EmMapRequest {
  /** `EMD-<num>`. */
  emdbId: string
  serverType: EmdbServerType
  /** The author's recommended level, when the EMDB record was read. */
  contourLevel: number | null
}

export interface GetPdbDialogResult {
  accession: Accession
  coord:    { serverType: CoordServerType } | null
  map2fofc: { serverType: MapServerType }   | null
  mapFofc:  { serverType: MapServerType }   | null
  emMaps:   EmMapRequest[]
}

interface Props {
  visible: boolean
  onConfirm: (result: GetPdbDialogResult) => void
  onCancel: () => void
}

/** Which map section the dialog shows for a lookup state. */
type MapSection = 'xtal' | 'em' | 'none'

/**
 * The map section for `lookup`: by the entry's kind once it is known, the
 * crystallographic one when the lookup failed (the dialog's old behaviour),
 * and none while it is still pending or found nothing.
 */
function mapSectionFor(lookup: EntryLookup): MapSection {
  switch (lookup.status) {
    case 'pdb':
      return lookup.entry.kind === 'xtal' ? 'xtal' : lookup.entry.kind === 'em' ? 'em' : 'none'
    case 'emdb':
      return 'em'
    case 'error':
      return lookup.accession.kind === 'pdb' ? 'xtal' : 'em'
    default:
      return 'none'
  }
}

/** The EMDB maps the dialog offers for `lookup`, primary first. */
function emdbIdsFor(lookup: EntryLookup): string[] {
  if (lookup.status === 'pdb') return lookup.entry.emdbIds
  if ((lookup.status === 'emdb' || lookup.status === 'error') && lookup.accession.kind === 'emdb') {
    return [lookup.accession.id]
  }
  return []
}

/** `ELECTRON MICROSCOPY` -> `Electron microscopy`. */
function formatMethod(m: string): string {
  const lower = m.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  return `${(n / 1e6).toFixed(1)} MB`
}

/** The method as a short tag for a result row (`EM`, `X-ray`, ...). */
function shortMethod(entry: EntryInfo): string {
  const m = entry.methods.map((x) => x.toUpperCase())
  if (m.some((x) => x.includes('ELECTRON MICROSCOPY'))) return 'EM'
  if (m.some((x) => x.includes('X-RAY'))) return 'X-ray'
  if (m.some((x) => x.includes('NMR'))) return 'NMR'
  if (m.some((x) => x.includes('NEUTRON'))) return 'Neutron'
  if (m.some((x) => x.includes('ELECTRON CRYSTALLOGRAPHY'))) return 'ED'
  return entry.methods.length > 0 ? formatMethod(entry.methods[0]) : '?'
}

/** One line of what the entry is: method, resolution, EMDB maps. */
function entrySummary(entry: EntryInfo): string {
  const parts = [entry.methods.map(formatMethod).join(', ') || 'Unknown method']
  if (entry.resolution !== null) parts.push(`${entry.resolution.toFixed(2)} Å`)
  if (entry.emdbIds.length > 0) parts.push(entry.emdbIds.join(', '))
  return parts.join(' | ')
}

/** What the dialog knows about one EMDB map, for the hint under its row. */
function emdbMapSummary(info: EmdbMapInfo | 'loading' | 'error' | undefined): string {
  if (info === undefined || info === 'loading') return 'Reading map information...'
  if (info === 'error') return 'Map information unavailable; the default contour level is used.'
  const parts: string[] = []
  if (info.sizeBytes !== null) parts.push(formatBytes(info.sizeBytes))
  if (info.dims !== null) parts.push(info.dims.join(' x '))
  parts.push(info.recommendedLevel !== null
    ? `recommended level ${info.recommendedLevel}`
    : 'no recommended level (top 1% is used)')
  return parts.join(' | ')
}

/**
 * The lines under the accession field: what the code names, or why not.
 *
 * @param onSearchInstead - offered when an ID-shaped input names no entry, so
 *   a four-letter word that happens to look like an ID can still be searched
 */
function EntryInfoLines({ lookup, emdbInfo, onSearchInstead }: {
  lookup: EntryLookup
  emdbInfo: EmdbInfoMap
  onSearchInstead: () => void
}): React.JSX.Element | null {
  switch (lookup.status) {
    case 'idle':
      return null
    case 'loading':
      return <div className="h3-dialog-hint">Looking up {lookup.accession.id.toUpperCase()}...</div>
    case 'pdb':
      return (
        <>
          <div className="type-body">{lookup.entry.title || lookup.entry.id.toUpperCase()}</div>
          <div className="h3-dialog-hint">{entrySummary(lookup.entry)}</div>
        </>
      )
    case 'emdb': {
      const info = emdbInfo[lookup.accession.id]
      const title = typeof info === 'object' ? info.title : ''
      return (
        <>
          <div className="type-body">{title || lookup.accession.id}</div>
          <div className="h3-dialog-hint">Cryo-EM map, no coordinates</div>
        </>
      )
    }
    case 'not-found':
      return (
        <>
          <div className="h3-dialog-error">No entry {lookup.accession.id.toUpperCase()} was found.</div>
          <ButtonRow>
            <FormButton text="Search as keywords" onClick={onSearchInstead} />
          </ButtonRow>
        </>
      )
    case 'error':
      return (
        <div className="h3-dialog-hint">
          Could not read the entry information ({lookup.message}). The files can still be downloaded.
        </div>
      )
  }
}

const METHOD_FILTER_LABELS: Record<SearchMethodFilter, string> = {
  all: 'All methods',
  xray: 'X-ray',
  em: 'Electron microscopy',
}

const SORT_LABELS: Record<SearchSort, string> = {
  score: 'Relevance',
  resolution: 'Best resolution',
  date: 'Newest',
}

/**
 * The keyword search hits: a method filter and an order, the rows, and paging.
 *
 * @param children - what the picked row is (its information lines), drawn
 *   under the list so picking a row never moves the rows themselves
 */
function SearchResults({ search, method, onMethodChange, sort, onSortChange, selectedId, onSelect, onMore, children }: {
  search: PdbSearchState
  method: SearchMethodFilter
  onMethodChange: (m: SearchMethodFilter) => void
  sort: SearchSort
  onSortChange: (s: SearchSort) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onMore: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  const count = search.loading && search.entries.length === 0
    ? 'Searching...'
    : search.entries.length < search.total
      ? `${search.entries.length} / ${search.total} entries`
      : `${search.total} ${search.total === 1 ? 'entry' : 'entries'}`
  return (
    <FieldSection title="Search results" titleActions={<span className="type-caption">{count}</span>}>
      <FieldGrid>
        <FieldGridRow label="Method">
          <SelectField value={method} onChange={(v) => onMethodChange(v as SearchMethodFilter)}>
            {(Object.keys(METHOD_FILTER_LABELS) as SearchMethodFilter[]).map((m) => (
              <option key={m} value={m}>{METHOD_FILTER_LABELS[m]}</option>
            ))}
          </SelectField>
        </FieldGridRow>
        <FieldGridRow label="Sort">
          <SelectField value={sort} onChange={(v) => onSortChange(v as SearchSort)}>
            {(Object.keys(SORT_LABELS) as SearchSort[]).map((s) => (
              <option key={s} value={s}>{SORT_LABELS[s]}</option>
            ))}
          </SelectField>
        </FieldGridRow>
      </FieldGrid>
      <Listbox framed>
        {search.entries.length === 0 ? (
          <div className="h3-list-empty">
            {search.loading ? 'Searching...' : search.error ? `Search failed: ${search.error}` : 'No entries found.'}
          </div>
        ) : (
          search.entries.map((e) => (
            <ListRow key={e.id} selected={e.id === selectedId} onClick={() => onSelect(e.id)}>
              <span className="type-row getpdb-result-id">{e.id.toUpperCase()}</span>
              <TruncatedText className="type-row getpdb-result-title" text={e.title || e.id.toUpperCase()} />
              <span className="type-caption getpdb-result-meta">
                {e.resolution !== null ? `${shortMethod(e)} ${e.resolution.toFixed(1)} \u00c5` : shortMethod(e)}
              </span>
            </ListRow>
          ))
        )}
      </Listbox>
      {search.entries.length > 0 && search.entries.length < search.total && (
        <ButtonRow>
          <FormButton text={search.loading ? 'Loading...' : 'More'} disabled={search.loading} onClick={onMore} />
        </ButtonRow>
      )}
      {children}
    </FieldSection>
  )
}

export function GetPdbDialog({ visible, onConfirm, onCancel }: Props): React.JSX.Element {
  const [text, setText] = useState('')

  const [coordEnabled, setCoordEnabled] = useState(true)
  const [coordServer, setCoordServer] = useState<CoordServerType>('RCSB_CIF')

  const [map2fofcEnabled, setMap2fofcEnabled] = useState(false)
  const [mapFofcEnabled, setMapFofcEnabled] = useState(false)
  const [mapServer, setMapServer] = useState<MapServerType>('RCSB_CIF')

  // EMDB maps the user switched off; every offered map is on unless listed.
  // Kept as an exclusion set so a freshly looked-up entry needs no reset.
  const [emOff, setEmOff] = useState<ReadonlySet<string>>(() => new Set())
  const [emServer, setEmServer] = useState<EmdbServerType>('WWPDB')

  const [historyItems, setHistoryItems] = useState<string[]>(() => getHistory())

  const search = usePdbSearch()
  const [searchMethod, setSearchMethod] = useState<SearchMethodFilter>('all')
  const [searchSort, setSearchSort] = useState<SearchSort>('score')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setText('')
      setCoordEnabled(true)
      setCoordServer('RCSB_CIF')
      setMap2fofcEnabled(false)
      setMapFofcEnabled(false)
      setMapServer('RCSB_CIF')
      setEmOff(new Set())
      setEmServer('WWPDB')
      setHistoryItems(getHistory())
      search.reset()
      setSearchMethod('all')
      setSearchSort('score')
      setSelectedId(null)
    }
    // `search.reset` is stable; listing `search` would rerun on every result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const refreshHistory = useCallback((): void => {
    setHistoryItems(getHistory())
  }, [])

  // The search list owns the form while it is open: the entry is the picked
  // row, not the text. It stays open while the text is still not an ID, or
  // is the very text that was searched ("Search as keywords" on an ID).
  const typed = parseAccession(text)
  const searchOpen = search.state !== null && (typed === null || search.state.query === text.trim())
  const entryText = searchOpen ? (selectedId ?? '') : text

  const { lookup, emdbInfo } = useEntryLookup(entryText, visible)
  const accession = parseAccession(entryText)
  const section = mapSectionFor(lookup)
  const emdbIds = emdbIdsFor(lookup)

  // A PDB entry has coordinates; an EMDB code typed directly does not.
  const showCoord = accession?.kind === 'pdb' && lookup.status !== 'not-found'
  const pdbFormatAvailable = lookup.status !== 'pdb' || lookup.entry.pdbFormatAvailable
  const effCoordServer: CoordServerType = pdbFormatAvailable ? coordServer : 'RCSB_CIF'

  const coordOn = showCoord && coordEnabled
  const xtalOn = section === 'xtal' && (map2fofcEnabled || mapFofcEnabled)
  const emSelected = section === 'em' ? emdbIds.filter((id) => !emOff.has(id)) : []
  const canSubmit = accession !== null && (coordOn || xtalOn || emSelected.length > 0)

  const toggleEm = (id: string, on: boolean): void => {
    setEmOff((prev) => {
      const next = new Set(prev)
      if (on) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleOk = () => {
    if (!canSubmit || !accession) return
    const level = (id: string): number | null => {
      const info = emdbInfo[id]
      return typeof info === 'object' ? info.recommendedLevel : null
    }
    onConfirm({
      accession,
      coord:    coordOn ? { serverType: effCoordServer } : null,
      map2fofc: section === 'xtal' && map2fofcEnabled ? { serverType: mapServer } : null,
      mapFofc:  section === 'xtal' && mapFofcEnabled  ? { serverType: mapServer } : null,
      emMaps:   emSelected.map((id) => ({ emdbId: id, serverType: emServer, contourLevel: level(id) })),
    })
  }

  // A search is remembered in the history as soon as it runs (an ID is
  // remembered when it is downloaded, by the command).
  const runSearch = (query: string, method = searchMethod, sort = searchSort): void => {
    setSelectedId(null)
    pushHistory(query)
    setHistoryItems(getHistory())
    search.run(query, method, sort)
  }

  // Picking remembered keywords searches for them at once; a picked ID only
  // fills the field, and the lookup follows as if it had been typed.
  const pickHistory = (v: string): void => {
    setText(v)
    if (parseAccession(v) === null) runSearch(v)
  }

  const changeMethod = (m: SearchMethodFilter): void => {
    setSearchMethod(m)
    if (search.state) runSearch(search.state.query, m, searchSort)
  }

  const changeSort = (s: SearchSort): void => {
    setSearchSort(s)
    if (search.state) runSearch(search.state.query, searchMethod, s)
  }

  // Enter downloads what the form is about, unless the text is keywords that
  // have not been searched yet, which it searches first.
  // Up / Down walk the hit list without leaving the field.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isImeKey(e.nativeEvent)) return
    const q = text.trim()
    if (e.key === 'Enter') {
      e.preventDefault()
      const searched = search.state !== null && search.state.query === q
      if (typed === null && q.length > 0 && !searched) runSearch(q)
      else if (canSubmit) handleOk()
      return
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && searchOpen && search.state && search.state.entries.length > 0) {
      e.preventDefault()
      const ids = search.state.entries.map((x) => x.id)
      const cur = selectedId === null ? -1 : ids.indexOf(selectedId)
      const next = e.key === 'ArrowDown' ? Math.min(cur + 1, ids.length - 1) : Math.max(cur - 1, 0)
      setSelectedId(ids[next])
    }
  }

  const keywordsPending = typed === null && text.trim().length > 0 && !searchOpen

  return (
    <DialogShell
      visible={visible}
      title="Get PDB"
      width="lg"
      onCancel={onCancel}
      onOk={handleOk}
      okLabel="Download"
      okDisabled={!canSubmit}
    >
      <FieldSection title="Entry">
        <Field label="PDB or EMDB ID, or keywords">
          {/* Editable combobox: text + themed, click-to-open history
              dropdown. The chevron and dark-mode popover are handled
              by ComboBoxField (h3-kit), so this dialog adds none of
              that styling. */}
          <ComboBoxField
            id="get-pdb-id"
            value={text}
            onChange={setText}
            onPick={pickHistory}
            options={historyItems}
            onOpen={refreshHistory}
            placeholder="1mbn, EMD-11638, or keywords"
            autoFocus
            onKeyDown={handleKeyDown}
            emptyText="No history"
            triggerLabel="Show history"
            triggerTitle="Recent IDs and searches"
            aria-label="PDB or EMDB ID"
          />
        </Field>
        {keywordsPending && (
          <>
            <div className="h3-dialog-hint">Press Enter to search the PDB for these keywords.</div>
            <ButtonRow>
              <FormButton text="Search" onClick={() => runSearch(text)} />
            </ButtonRow>
          </>
        )}
        {!searchOpen && (
          <EntryInfoLines
            lookup={lookup}
            emdbInfo={emdbInfo}
            onSearchInstead={() => runSearch(text)}
          />
        )}
      </FieldSection>

      {searchOpen && search.state && (
        <SearchResults
          search={search.state}
          method={searchMethod}
          onMethodChange={changeMethod}
          sort={searchSort}
          onSortChange={changeSort}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMore={search.more}
        >
          <EntryInfoLines lookup={lookup} emdbInfo={emdbInfo} onSearchInstead={() => {}} />
        </SearchResults>
      )}

      {showCoord && (
        <FieldSection title="Coordinates">
          <Field label="Fetch coordinates" inline controlFirst>
            <CheckboxField checked={coordEnabled} onChange={setCoordEnabled} />
          </Field>
          <Field label="Format">
            <RadioField
              value={effCoordServer}
              onValueChange={setCoordServer}
              disabled={!coordEnabled}
              options={pdbFormatAvailable
                ? [
                    { value: 'RCSB_CIF', label: 'mmCIF (RCSB)' },
                    { value: 'RCSB_PDB', label: 'PDB (RCSB)' },
                  ]
                : [{ value: 'RCSB_CIF', label: 'mmCIF (RCSB)' }]}
            />
          </Field>
          {!pdbFormatAvailable && (
            <div className="h3-dialog-hint">This entry is too large for the PDB format.</div>
          )}
        </FieldSection>
      )}

      {section === 'xtal' && (
        <FieldSection title="Density maps">
          <Field label="2Fo-Fc map" inline controlFirst>
            <CheckboxField checked={map2fofcEnabled} onChange={setMap2fofcEnabled} />
          </Field>
          <Field label="Fo-Fc map" inline controlFirst>
            <CheckboxField checked={mapFofcEnabled} onChange={setMapFofcEnabled} />
          </Field>
          <Field label="Source">
            <RadioField
              value={mapServer}
              onValueChange={setMapServer}
              disabled={!map2fofcEnabled && !mapFofcEnabled}
              options={[
                { value: 'RCSB_CIF', label: 'RCSB (cif.gz)' },
                { value: 'EBI_MTZ', label: 'EBI (MTZ)' },
              ]}
            />
          </Field>
        </FieldSection>
      )}

      {section === 'em' && (
        <FieldSection title="Cryo-EM maps">
          {emdbIds.length === 0 && (
            <div className="h3-dialog-hint">This entry has no associated EMDB map.</div>
          )}
          {emdbIds.map((id) => (
            <React.Fragment key={id}>
              <Field label={`${id} map`} inline controlFirst>
                <CheckboxField checked={!emOff.has(id)} onChange={(on) => toggleEm(id, on)} />
              </Field>
              <div className="h3-dialog-hint">{emdbMapSummary(emdbInfo[id])}</div>
            </React.Fragment>
          ))}
          {emdbIds.length > 0 && (
            <Field label="Source">
              <RadioField
                value={emServer}
                onValueChange={setEmServer}
                disabled={emSelected.length === 0}
                options={[
                  { value: 'WWPDB', label: 'wwPDB' },
                  { value: 'EBI', label: 'EBI' },
                ]}
              />
            </Field>
          )}
        </FieldSection>
      )}
    </DialogShell>
  )
}
