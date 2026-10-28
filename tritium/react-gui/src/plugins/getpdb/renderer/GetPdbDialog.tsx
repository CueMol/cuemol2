/**
 * @file plugins/getpdb/renderer/GetPdbDialog.tsx
 * @description The Get PDB form: a PDB or EMDB accession code, then which of
 * the entry's files to fetch, and from which server.
 *
 * The code is looked up as it is typed (`useEntryLookup`), and the map
 * section follows what the entry is: a crystallographic entry offers its
 * 2Fo-Fc / Fo-Fc maps, a cryo-EM entry its EMDB maps, and an EMDB code typed
 * directly offers that map alone. When the lookup fails the dialog offers
 * what it always did (coordinates and crystallographic maps), so a download
 * never depends on the lookup.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { DialogShell } from '@renderer/plugin-host/api'
import {
  isImeKey,
  CheckboxField,
  ComboBoxField,
  Field,
  FieldSection,
  RadioField,
} from '@renderer/h3-kit/form'
import { getHistory } from './pdbIdHistory'
import { parseAccession } from '@renderer/worker/shared/pdbUrls'
import type { EmdbMapInfo, EntryInfo } from '@renderer/worker/shared/pdbEntryInfo'
import { useEntryLookup, type EmdbInfoMap, type EntryLookup } from './useEntryLookup'

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

/** The lines under the accession field: what the code names, or why not. */
function EntryInfoLines({ lookup, emdbInfo }: { lookup: EntryLookup; emdbInfo: EmdbInfoMap }): React.JSX.Element | null {
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
      return <div className="h3-dialog-error">No entry {lookup.accession.id.toUpperCase()} was found.</div>
    case 'error':
      return (
        <div className="h3-dialog-hint">
          Could not read the entry information ({lookup.message}). The files can still be downloaded.
        </div>
      )
  }
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
    }
  }, [visible])

  const refreshHistory = useCallback((): void => {
    setHistoryItems(getHistory())
  }, [])

  const { lookup, emdbInfo } = useEntryLookup(text, visible)
  const accession = parseAccession(text)
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit && !isImeKey(e.nativeEvent)) {
      e.preventDefault()
      handleOk()
    }
  }

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
        <Field label="PDB or EMDB ID">
          {/* Editable combobox: text + themed, click-to-open history
              dropdown. The chevron and dark-mode popover are handled
              by ComboBoxField (h3-kit), so this dialog adds none of
              that styling. */}
          <ComboBoxField
            id="get-pdb-id"
            value={text}
            onChange={setText}
            options={historyItems}
            onOpen={refreshHistory}
            placeholder="e.g., 1mbn or EMD-11638"
            autoFocus
            invalid={text.trim().length > 0 && accession === null}
            onKeyDown={handleKeyDown}
            emptyText="No history"
            triggerLabel="Show PDB ID history"
            triggerTitle="Recent IDs"
            aria-label="PDB or EMDB ID"
          />
        </Field>
        <EntryInfoLines lookup={lookup} emdbInfo={emdbInfo} />
      </FieldSection>

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
