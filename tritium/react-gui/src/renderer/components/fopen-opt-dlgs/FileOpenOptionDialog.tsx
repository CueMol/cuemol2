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

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogBody, DialogFooter, Button, Collapse, Icon } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';
import { useCueMol } from '../../hooks/useCueMol';

import {
  type FileOpenOptions,
  type FormatOptions,
  type RendererOptions,
  detectFormatKind,
  buildDefaultFormatOptions,
  getDefaultRendererOptions,
  isFormatOptionsModified,
  isMolFormat,
} from './types';
import { getDefaultRendType, setDefaultRendType } from './rendTypeHistory';

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

  // Resolve the initial renderer type: history value if still listed,
  // otherwise the first compatible type.
  const initialRendType = useMemo(() => {
    if (rendererTypes.length === 0) return undefined;
    const hist = getDefaultRendType(objType);
    if (hist && rendererTypes.includes(hist)) return hist;
    return rendererTypes[0];
  }, [rendererTypes, objType]);

  // Option state
  const [formatOptions, setFormatOptions] = useState<FormatOptions>(() =>
    buildDefaultFormatOptions(formatKind)
  );
  const [rendererOptions, setRendererOptions] = useState<RendererOptions>(() =>
    getDefaultRendererOptions(filePath, initialRendType)
  );
  const [isFormatExpanded, setIsFormatExpanded] = useState(false);

  // Tracks whether the renderer name is still the auto-generated default
  // (no user edits since the last reset). Mirrors UXP's mRendNameDefault.
  //
  // Stored in a ref — NOT a state — so transitions don't re-fire the
  // auto-fill effect. UXP's XUL <textbox> only fires "change" on commit
  // (blur), so emptying the field mid-edit never re-triggers auto-fill;
  // React's onChange fires per keystroke, so we get the same effect by
  // keeping the flag out of the effect's dependency list.
  const rendererNameIsDefaultRef = useRef(true);

  // Separate stale-response guards so one effect's request doesn't
  // accidentally invalidate the other.
  const objNameSeqRef = useRef(0);
  const rendNameSeqRef = useRef(0);

  // Reset state when a new file is shown (filePath changes between opens)
  const [lastFilePath, setLastFilePath] = useState(filePath);
  if (filePath !== lastFilePath) {
    setLastFilePath(filePath);
    setFormatOptions(buildDefaultFormatOptions(detectFormatKind(filePath)));
    setRendererOptions(getDefaultRendererOptions(filePath, initialRendType));
    setIsFormatExpanded(false);
    rendererNameIsDefaultRef.current = true;
    // Discard any in-flight responses for the previous file.
    objNameSeqRef.current += 1;
    rendNameSeqRef.current += 1;
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

  // Effect: while the renderer name is still the auto-default, resolve a
  // scene-wide unique name for the currently selected renderer type. UXP
  // re-generates the suggestion every time the type changes (only when
  // mRendNameDefault is true).
  //
  // The flag is intentionally read from a ref, NOT listed as a dep, so
  // that toggling it during mid-edit keystrokes does not retrigger this
  // effect. The effect only fires on real navigational changes (type
  // pick, file/scene swap, dialog open).
  useEffect(() => {
    if (!visible || !cm) return;
    if (!rendererOptions.rendererType) return;
    if (!rendererNameIsDefaultRef.current) return;
    const seq = ++rendNameSeqRef.current;
    (async () => {
      const res = await cm.proposeUniqName({
        kind: 'sceneRenderer',
        prefix: rendererOptions.rendererType,
        sceneId,
      });
      if (seq !== rendNameSeqRef.current) return; // stale
      // Re-check after the await: the user may have typed into the field
      // while the worker was resolving. UXP doesn't need this because XUL
      // is synchronous, but in React the fetch is async and the user can
      // race it.
      if (!rendererNameIsDefaultRef.current) return;
      if (!res) return;
      setRendererOptions((prev) => ({ ...prev, rendererName: res.name }));
    })();
  }, [cm, visible, rendererOptions.rendererType, sceneId, filePath]);

  // User edits to the renderer name: propagate the new value into the
  // shared rendererOptions state, and silently update the "is default"
  // ref so the next type-pick respects the customization. Updating the
  // ref does NOT re-fire the auto-fill effect (the flag is not a dep),
  // so emptying the field mid-edit no longer overwrites the input — the
  // bad UX the previous implementation had.
  const handleRendererNameEdit = useCallback((newName: string) => {
    setRendererOptions((prev) => ({ ...prev, rendererName: newName }));
    rendererNameIsDefaultRef.current = newName.length === 0;
  }, []);

  const handleConfirm = useCallback(() => {
    if (rendererOptions.selectionEnabled && rendererOptions.selection) {
      pushHistory(rendererOptions.selection);
    }
    setDefaultRendType(objType, rendererOptions.rendererType);
    onConfirm({ format: formatOptions, renderer: rendererOptions });
  }, [onConfirm, formatOptions, rendererOptions, objType]);

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
          onRendererNameUserEdit={handleRendererNameEdit}
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
