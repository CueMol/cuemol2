/**
 * @file dialogs/fopen-opt-dlgs/FileOpenOptionDialog.tsx
 * @description Modal dialog for configuring file-open options before loading a file.
 *
 * Layout (top to bottom):
 *   1. File info bar (filename + format badge)
 *   2. Renderer options -- always visible (object name, type, selection, etc.)
 *   3. Format-specific options -- collapsed by default, revealed on demand
 *
 * UXP parity (uxp_gui/cuemol2/base/content/fopen-renderopt-page.js):
 *   - Renderer name auto-tracks the selected renderer type until the user
 *     manually edits it (`rendererNameIsDefault` flag).
 *   - Renderer type defaults to the last used value for the same C++ object
 *     class (`objType`), persisted in localStorage via `rendTypeHistory`.
 *   - Object name and renderer name are scene-wide unique via the worker
 *     `proposeUniqName` service (resp. `kind: 'object'+tryBare+parens`,
 *     `kind: 'sceneRenderer'`).
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Collapse } from '@blueprintjs/core';
import { DialogShell } from '@renderer/dialogs/DialogShell';
import { AppIcon } from '@renderer/h3-kit/primitives';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';

import {
  type FileOpenOptions,
  type FormatOptions,
  formatKindForReader,
  buildDefaultFormatOptions,
  isFormatOptionsModified,
  mapReaderDefaultsToFormatOptions,
  isMolFormat,
  deriveDefaultPsfPath,
} from './types';
import { useRendererOptions } from './useRendererOptions';
import { computeMtzDefaults } from './mtzColumns';
import { getLastPsfPath, setLastPsfPath } from './psfPathHistory';
import { getLastCoordPath, setLastCoordPath } from './coordPathHistory';
import type { GetMtzColumnInfoResult } from '@renderer/worker/server/services/getMtzColumnInfo.service';

import { PdbOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/PdbOptionsPane';
import { MtzOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/MtzOptionsPane';
import { Ccp4MapOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/Ccp4MapOptionsPane';
import type { MapHeaderInfo } from '@renderer/worker/server/services/probeMapHeader.service';
import { MsmsOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/MsmsOptionsPane';
import { NamdCoorOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/NamdCoorOptionsPane';
import { AmberPrmtopOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/AmberPrmtopOptionsPane';
import { RendererOptionsPane } from '@renderer/dialogs/fopen-opt-dlgs/panes/RendererOptionsPane';
import { pushHistory } from '@renderer/h3-kit/MolSelList';

import type { PdbOptions, MtzOptions, Ccp4MapOptions, MsmsOptions, NamdCoorOptions, AmberPrmtopOptions, PresetTypeEntry } from './types';

// ---- helpers ----

function formatLabel(kind: string): string {
  switch (kind) {
    case 'pdb': return 'PDB';
    case 'mmcif': return 'mmCIF';
    case 'mtz': return 'MTZ';
    case 'ccp4map': return 'CCP4/MRC Map';
    case 'msms': return 'MSMS Surface';
    case 'namdcoor': return 'NAMD Coordinate';
    case 'amberprm': return 'AMBER prmtop';
    default: return '';
  }
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function baseNameNoExt(filePath: string): string {
  return filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'molecule';
}

// ---- props ----

export interface FileOpenOptionDialogProps {
  visible: boolean;
  filePath: string;
  sceneId: number;
  rendererTypes: string[];
  /** Renderer presets for the Renderer pane's "Presets" optgroup. */
  presetTypes?: PresetTypeEntry[];
  /**
   * C++ object class name (e.g. 'MolCoord', 'DensityMap') of the file
   * about to be loaded. Used as the renderer-type history key. Empty
   * string disables history get/set (a safe no-op).
   */
  objType: string;
  /**
   * Reader nickname cuemol/core resolved for this file (e.g. 'pdb',
   * 'mtzmap'). The single source of truth for which format-specific option
   * pane to show -- never re-derived from the extension on the TS side.
   */
  readerName: string;
  onConfirm: (options: FileOpenOptions) => void;
  onCancel: () => void;
}

// ---- component ----

export const FileOpenOptionDialog: React.FC<FileOpenOptionDialogProps> = ({
  visible,
  filePath,
  sceneId,
  rendererTypes,
  presetTypes,
  objType,
  readerName,
  onConfirm,
  onCancel,
}) => {
  const { cm } = useCueMol();
  const formatKind = formatKindForReader(readerName);
  const formatName = formatLabel(formatKind);
  const hasFormatOptions = formatKind !== 'unknown';

  // Renderer-options state + UXP-parity behaviour (type history, default
  // renderer name follow) come from the shared hook.
  const { options: rendererOptions, setOptions: setRendererOptions,
    onRendererNameUserEdit, commitHistory } = useRendererOptions({
    visible,
    sceneId,
    objClassName: objType,
    rendererTypes,
    presetTypes,
    objectName: baseNameNoExt(filePath),
  });

  // Format-specific option state stays dialog-local.
  const [formatOptions, setFormatOptions] = useState<FormatOptions>(() =>
    buildDefaultFormatOptions(formatKind)
  );
  // Baseline defaults the "(modified)" hint compares against. For
  // PDB/mmCIF/CCP4 this is replaced by the C++-sourced defaults once the
  // reader-options fetch resolves; for the other formats it stays the static
  // placeholder.
  const [formatDefaults, setFormatDefaults] = useState<FormatOptions>(() =>
    buildDefaultFormatOptions(formatKind)
  );
  const [isFormatExpanded, setIsFormatExpanded] = useState(false);
  // Stale-response guard for the reader-default-options fetch.
  const readerOptSeqRef = useRef(0);

  // Stale-response guard for the object-name proposeUniqName fetch.
  const objNameSeqRef = useRef(0);

  // MTZ column info read from the file header (null until loaded / non-MTZ).
  const [mtzColumnInfo, setMtzColumnInfo] = useState<GetMtzColumnInfoResult | null>(null);
  const mtzSeqRef = useRef(0);
  // CCP4/MRC header probe (grid size / large-map warning in the map pane)
  const [mapProbe, setMapProbe] = useState<MapHeaderInfo | null>(null);
  const probeSeqRef = useRef(0);

  // Reset format state when a new file is shown (filePath changes between
  // opens). Renderer-options reset is handled by the shared hook on the
  // dialog's visibility transition.
  const [lastFilePath, setLastFilePath] = useState(filePath);
  if (filePath !== lastFilePath) {
    setLastFilePath(filePath);
    setFormatOptions(buildDefaultFormatOptions(formatKind));
    setFormatDefaults(buildDefaultFormatOptions(formatKind));
    setIsFormatExpanded(false);
    setMtzColumnInfo(null);
    // Discard any in-flight responses for the previous file.
    objNameSeqRef.current += 1;
    mtzSeqRef.current += 1;
    readerOptSeqRef.current += 1;
    probeSeqRef.current += 1;
    setMapProbe(null);
  }

  // Effect: resolve a scene-wide unique object name when the dialog opens or
  // the target file/scene changes. UXP tries the bare name first and only
  // falls back to "name(1)", "name(2)", ... on conflict.
  useEffect(() => {
    if (!visible || !cm) return;
    const prefix = baseNameNoExt(filePath);
    const seq = ++objNameSeqRef.current;
    (async () => {
      const res = await cm.invokeService('proposeUniqName', {
        kind: 'object',
        prefix,
        sceneId,
        tryBare: true,
        suffix: 'parens',
      });
      if (seq !== objNameSeqRef.current) return; // stale
      if (!res) return;
      setRendererOptions((prev) => ({ ...prev, objectName: res.name }));
    })();
  }, [cm, visible, filePath, sceneId]);

  // Effect: when an MTZ file is shown, read its column labels + resolution
  // range and seed the dialog's default column selections (UXP onInit +
  // selectDefaultColumns). Runs once per file/scene open.
  useEffect(() => {
    if (!visible || !cm || formatKind !== 'mtz') return;
    const seq = ++mtzSeqRef.current;
    (async () => {
      const info = await cm.getMtzColumnInfo(filePath);
      if (seq !== mtzSeqRef.current) return; // stale
      setMtzColumnInfo(info);
      if (!info.ok) return;
      const defs = computeMtzDefaults(info.columns);
      setFormatOptions({
        kind: 'mtz',
        options: {
          ...defs,
          // Round to 1 decimal place to match UXP's decimalplaces="1" widget.
          resolutionLimit: Math.round(info.resolution * 10) / 10,
          gridSpacing: 0.25,
        },
      });
    })();
  }, [cm, visible, filePath, formatKind]);

  // Effect: when a CCP4/MRC map is shown, read its header (size, mode,
  // statistics) so the map pane can show the grid and warn about a very
  // large map before the whole file is read.
  useEffect(() => {
    if (!visible || !cm || formatKind !== 'ccp4map') return;
    const seq = ++probeSeqRef.current;
    (async () => {
      let res: { ok: boolean; info: MapHeaderInfo | null } | undefined;
      try {
        res = await cm.invokeService('probeMapHeader', { filePath });
      } catch {
        res = undefined;
      }
      if (seq !== probeSeqRef.current) return; // stale
      setMapProbe(res && res.ok ? res.info : null);
    })();
  }, [cm, visible, filePath, formatKind]);

  // Effect: seed PDB / mmCIF / CCP4 option defaults from the C++ reader so the
  // dialog never hardcodes reader-option defaults (UXP fopen-*opt-page onInit,
  // which reads rdr.<prop>). Also sets the "(modified)" baseline. MTZ columns /
  // resolution are seeded by the dedicated effect above; the other formats have
  // no reader-backed value options.
  useEffect(() => {
    if (!visible || !cm) return;
    if (formatKind !== 'pdb' && formatKind !== 'mmcif' && formatKind !== 'ccp4map') return;
    const seq = ++readerOptSeqRef.current;
    (async () => {
      const res = await cm.getReaderDefaultOptions(readerName);
      if (seq !== readerOptSeqRef.current) return; // stale
      if (!res.ok) return;
      const seeded = mapReaderDefaultsToFormatOptions(formatKind, res.values);
      setFormatOptions(seeded);
      setFormatDefaults(seeded);
    })();
  }, [cm, visible, formatKind, readerName]);

  // Effect: when a NAMD coordinate file is shown, seed the PSF topology path
  // from history (last-used) or, failing that, the coordinate path with a
  // `.psf` extension (UXP fopen-namdcooropt onInit). Only seeds while the
  // path is still empty so it never clobbers a user edit.
  useEffect(() => {
    if (!visible || formatKind !== 'namdcoor') return;
    const seeded = getLastPsfPath() ?? deriveDefaultPsfPath(filePath);
    if (!seeded) return;
    setFormatOptions((prev) =>
      prev.kind === 'namdcoor' && prev.options.psfFilePath === ''
        ? { kind: 'namdcoor', options: { psfFilePath: seeded } }
        : prev,
    );
  }, [visible, filePath, formatKind]);

  // Effect: when an AMBER prmtop file is shown, seed the coordinate path from
  // history (last-used). Unlike NAMD's required PSF, the coord sub-stream is
  // optional and its extension (rst7 / inpcrd / restrt) is ambiguous, so there
  // is no path-derivation fallback -- an empty path means topology-only.
  useEffect(() => {
    if (!visible || formatKind !== 'amberprm') return;
    const seeded = getLastCoordPath();
    if (!seeded) return;
    setFormatOptions((prev) =>
      prev.kind === 'amberprm' && prev.options.coordFilePath === ''
        ? { kind: 'amberprm', options: { coordFilePath: seeded } }
        : prev,
    );
  }, [visible, filePath, formatKind]);

  const handleConfirm = useCallback(() => {
    if (rendererOptions.selectionEnabled && rendererOptions.selection) {
      pushHistory(rendererOptions.selection);
    }
    commitHistory();
    // Remember the chosen PSF path for the next NAMD coordinate load (UXP
    // pref "cuemol2.ui.histories.namdcoor.psfpath").
    if (formatOptions.kind === 'namdcoor' && formatOptions.options.psfFilePath) {
      setLastPsfPath(formatOptions.options.psfFilePath);
    }
    // Remember the chosen AMBER coordinate path for the next prmtop load.
    if (formatOptions.kind === 'amberprm' && formatOptions.options.coordFilePath) {
      setLastCoordPath(formatOptions.options.coordFilePath);
    }
    onConfirm({ format: formatOptions, renderer: rendererOptions });
  }, [onConfirm, formatOptions, rendererOptions, commitHistory]);

  const isModified = hasFormatOptions && isFormatOptionsModified(formatOptions, formatDefaults);

  return (
    <DialogShell
      visible={visible}
      title="Open File Options"
      width="6xl"
      onCancel={onCancel}
      onOk={handleConfirm}
      okLabel="Open"
      className="fod-dialog"
      bodyClassName="fod-body"
  >
        {/* File info row */}
        <div className="fod-file-info">
          <AppIcon name="ui.document" size="md" className="fod-file-icon" aria-hidden />
          <span className="fod-file-name" title={filePath}>{basename(filePath)}</span>
          {formatName && (
            <span className="fod-file-format">{formatName}</span>
          )}
        </div>

        {/* Renderer options -- always visible, at the top */}
        <RendererOptionsPane
          options={rendererOptions}
          onChange={setRendererOptions}
          rendererTypes={rendererTypes}
          presetTypes={presetTypes}
          sceneId={sceneId}
          isMolFormat={isMolFormat(formatKind)}
          onRendererNameUserEdit={onRendererNameUserEdit}
        />

        {/* Format-specific options -- progressive disclosure */}
        {hasFormatOptions && (
          <div className="fod-collapsible">
            <button
              type="button"
              className="fod-collapsible-header"
              onClick={() => setIsFormatExpanded((v) => !v)}
            >
              <AppIcon
                name={isFormatExpanded ? 'ui.caretDown' : 'ui.caretRight'}
                size="sm"
                className="fod-collapsible-chevron"
                aria-hidden
              />
              <span className="fod-collapsible-label">
                {formatName}-specific options
              </span>
              <span className={`fod-collapsible-hint${isModified ? ' fod-collapsible-hint--modified' : ''}`}>
                {isModified ? '(modified)' : '(defaults)'}
              </span>
            </button>
            <Collapse isOpen={isFormatExpanded}>
              <div className="fod-collapsible-body">
                {formatKind === 'pdb' && formatOptions.kind === 'pdb' && (
                  <PdbOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: PdbOptions) => setFormatOptions({ kind: 'pdb', options: opts })}
                  />
                )}
                {formatKind === 'mmcif' && formatOptions.kind === 'mmcif' && (
                  <PdbOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: PdbOptions) => setFormatOptions({ kind: 'mmcif', options: opts })}
                  />
                )}
                {formatKind === 'mtz' && formatOptions.kind === 'mtz' && (
                  <MtzOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: MtzOptions) => setFormatOptions({ kind: 'mtz', options: opts })}
                    columnInfo={mtzColumnInfo}
                  />
                )}
                {formatKind === 'ccp4map' && formatOptions.kind === 'ccp4map' && (
                  <Ccp4MapOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: Ccp4MapOptions) => setFormatOptions({ kind: 'ccp4map', options: opts })}
                    probe={mapProbe}
                  />
                )}
                {formatKind === 'msms' && formatOptions.kind === 'msms' && (
                  <MsmsOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: MsmsOptions) => setFormatOptions({ kind: 'msms', options: opts })}
                  />
                )}
                {formatKind === 'namdcoor' && formatOptions.kind === 'namdcoor' && (
                  <NamdCoorOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: NamdCoorOptions) => setFormatOptions({ kind: 'namdcoor', options: opts })}
                  />
                )}
                {formatKind === 'amberprm' && formatOptions.kind === 'amberprm' && (
                  <AmberPrmtopOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: AmberPrmtopOptions) => setFormatOptions({ kind: 'amberprm', options: opts })}
                  />
                )}
              </div>
            </Collapse>
          </div>
        )}
    </DialogShell>
  );
};
