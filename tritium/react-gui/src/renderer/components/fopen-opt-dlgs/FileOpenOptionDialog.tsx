/**
 * @file FileOpenOptionDialog.tsx
 * @description Modal dialog for configuring file-open options before loading a file.
 *
 * Layout (top to bottom):
 *   1. File info bar (filename + format badge)
 *   2. Renderer options — always visible (object name, type, selection, etc.)
 *   3. Format-specific options — collapsed by default, revealed on demand
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
import { Dialog, DialogBody, DialogFooter, Button, Collapse, Icon } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';
import { useCueMol } from '../../hooks/useCueMol';

import {
  type FileOpenOptions,
  type FormatOptions,
  detectFormatKind,
  buildDefaultFormatOptions,
  isFormatOptionsModified,
  isMolFormat,
} from './types';
import { useRendererOptions } from './useRendererOptions';

import { PdbOptionsPane } from './panes/PdbOptionsPane';
import { MtzOptionsPane } from './panes/MtzOptionsPane';
import { Ccp4MapOptionsPane } from './panes/Ccp4MapOptionsPane';
import { MsmsOptionsPane } from './panes/MsmsOptionsPane';
import { NamdCoorOptionsPane } from './panes/NamdCoorOptionsPane';
import { RendererOptionsPane } from './panes/RendererOptionsPane';
import { pushHistory } from '../widgets/MolSelList';

import type { PdbOptions, MtzOptions, Ccp4MapOptions, MsmsOptions, NamdCoorOptions } from './types';

// ---- helpers ----

function formatLabel(kind: string): string {
  switch (kind) {
    case 'pdb': return 'PDB';
    case 'mmcif': return 'mmCIF';
    case 'mtz': return 'MTZ';
    case 'ccp4map': return 'CCP4/MRC Map';
    case 'msms': return 'MSMS Surface';
    case 'namdcoor': return 'NAMD Coordinate';
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
  /**
   * C++ object class name (e.g. 'MolCoord', 'DensityMap') of the file
   * about to be loaded. Used as the renderer-type history key. Empty
   * string disables history get/set (a safe no-op).
   */
  objType: string;
  onConfirm: (options: FileOpenOptions) => void;
  onCancel: () => void;
}

// ---- component ----

export const FileOpenOptionDialog: React.FC<FileOpenOptionDialogProps> = ({
  visible,
  filePath,
  sceneId,
  rendererTypes,
  objType,
  onConfirm,
  onCancel,
}) => {
  const { theme } = useTheme();
  const { cm } = useCueMol();
  const formatKind = detectFormatKind(filePath);
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
    objectName: baseNameNoExt(filePath),
  });

  // Format-specific option state stays dialog-local.
  const [formatOptions, setFormatOptions] = useState<FormatOptions>(() =>
    buildDefaultFormatOptions(formatKind)
  );
  const [isFormatExpanded, setIsFormatExpanded] = useState(false);

  // Stale-response guard for the object-name proposeUniqName fetch.
  const objNameSeqRef = useRef(0);

  // Reset format state when a new file is shown (filePath changes between
  // opens). Renderer-options reset is handled by the shared hook on the
  // dialog's visibility transition.
  const [lastFilePath, setLastFilePath] = useState(filePath);
  if (filePath !== lastFilePath) {
    setLastFilePath(filePath);
    setFormatOptions(buildDefaultFormatOptions(detectFormatKind(filePath)));
    setIsFormatExpanded(false);
    // Discard any in-flight object-name response for the previous file.
    objNameSeqRef.current += 1;
  }

  // Effect: resolve a scene-wide unique object name when the dialog opens or
  // the target file/scene changes. UXP tries the bare name first and only
  // falls back to "name(1)", "name(2)", ... on conflict.
  useEffect(() => {
    if (!visible || !cm) return;
    const prefix = baseNameNoExt(filePath);
    const seq = ++objNameSeqRef.current;
    (async () => {
      const res = await cm.proposeUniqName({
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

  const handleConfirm = useCallback(() => {
    if (rendererOptions.selectionEnabled && rendererOptions.selection) {
      pushHistory(rendererOptions.selection);
    }
    commitHistory();
    onConfirm({ format: formatOptions, renderer: rendererOptions });
  }, [onConfirm, formatOptions, rendererOptions, commitHistory]);

  const isModified = hasFormatOptions && isFormatOptionsModified(formatOptions);

  return (
    <Dialog
      isOpen={visible}
      onClose={onCancel}
      title="Open File Options"
      className="fod-dialog"
      portalClassName={theme === 'dark' ? 'bp5-dark' : ''}
      canOutsideClickClose={false}
      isCloseButtonShown={false}
    >
      <DialogBody className="fod-body">
        {/* File info row */}
        <div className="fod-file-info">
          <Icon icon="document" size={14} className="fod-file-icon" />
          <span className="fod-file-name" title={filePath}>{basename(filePath)}</span>
          {formatName && (
            <span className="fod-file-format">{formatName}</span>
          )}
        </div>

        {/* Renderer options — always visible, at the top */}
        <RendererOptionsPane
          options={rendererOptions}
          onChange={setRendererOptions}
          rendererTypes={rendererTypes}
          sceneId={sceneId}
          isMolFormat={isMolFormat(formatKind)}
          onRendererNameUserEdit={onRendererNameUserEdit}
        />

        {/* Format-specific options — progressive disclosure */}
        {hasFormatOptions && (
          <div className="fod-collapsible">
            <button
              type="button"
              className="fod-collapsible-header"
              onClick={() => setIsFormatExpanded((v) => !v)}
            >
              <Icon
                icon={isFormatExpanded ? 'chevron-down' : 'chevron-right'}
                size={12}
                className="fod-collapsible-chevron"
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
                  />
                )}
                {formatKind === 'ccp4map' && formatOptions.kind === 'ccp4map' && (
                  <Ccp4MapOptionsPane
                    options={formatOptions.options}
                    onChange={(opts: Ccp4MapOptions) => setFormatOptions({ kind: 'ccp4map', options: opts })}
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
              </div>
            </Collapse>
          </div>
        )}
      </DialogBody>

      <DialogFooter
        actions={
          <>
            <Button onClick={onCancel}>Cancel</Button>
            <Button intent="primary" onClick={handleConfirm}>Open</Button>
          </>
        }
      />
    </Dialog>
  );
};
