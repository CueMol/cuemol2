/**
 * @file FileOpenOptionDialog.tsx
 * @description Modal dialog for configuring file-open options before loading a file.
 *
 * Layout (top to bottom):
 *   1. File info bar (filename + format badge)
 *   2. Renderer options — always visible (object name, type, selection, etc.)
 *   3. Format-specific options — collapsed by default, revealed on demand
 */

import React, { useState, useCallback } from 'react';
import { Dialog, DialogBody, DialogFooter, Button, Collapse, Icon } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

import {
  type FileOpenOptions,
  type FormatOptions,
  type RendererOptions,
  detectFormatKind,
  buildDefaultFormatOptions,
  getDefaultRendererOptions,
  isFormatOptionsModified,
} from './types';

import { PdbOptionsPane } from './panes/PdbOptionsPane';
import { MtzOptionsPane } from './panes/MtzOptionsPane';
import { Ccp4MapOptionsPane } from './panes/Ccp4MapOptionsPane';
import { MsmsOptionsPane } from './panes/MsmsOptionsPane';
import { NamdCoorOptionsPane } from './panes/NamdCoorOptionsPane';
import { RendererOptionsPane } from './panes/RendererOptionsPane';

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

// ---- props ----

export interface FileOpenOptionDialogProps {
  visible: boolean;
  filePath: string;
  rendererTypes: string[];
  onConfirm: (options: FileOpenOptions) => void;
  onCancel: () => void;
}

// ---- component ----

export const FileOpenOptionDialog: React.FC<FileOpenOptionDialogProps> = ({
  visible,
  filePath,
  rendererTypes,
  onConfirm,
  onCancel,
}) => {
  const { theme } = useTheme();
  const formatKind = detectFormatKind(filePath);
  const formatName = formatLabel(formatKind);
  const hasFormatOptions = formatKind !== 'unknown';

  const defaultRendType = rendererTypes.length > 0 ? rendererTypes[0] : undefined;

  // Option state
  const [formatOptions, setFormatOptions] = useState<FormatOptions>(() =>
    buildDefaultFormatOptions(formatKind)
  );
  const [rendererOptions, setRendererOptions] = useState<RendererOptions>(() =>
    getDefaultRendererOptions(filePath, defaultRendType)
  );
  const [isFormatExpanded, setIsFormatExpanded] = useState(false);

  // Reset state when a new file is shown (filePath changes between opens)
  const [lastFilePath, setLastFilePath] = useState(filePath);
  if (filePath !== lastFilePath) {
    setLastFilePath(filePath);
    setFormatOptions(buildDefaultFormatOptions(detectFormatKind(filePath)));
    setRendererOptions(getDefaultRendererOptions(filePath, defaultRendType));
    setIsFormatExpanded(false);
  }

  const handleConfirm = useCallback(() => {
    onConfirm({ format: formatOptions, renderer: rendererOptions });
  }, [onConfirm, formatOptions, rendererOptions]);

  const isModified = hasFormatOptions && isFormatOptionsModified(formatOptions);

  return (
    <Dialog
      isOpen={visible}
      onClose={onCancel}
      title="Open File Options"
      className="fod-dialog"
      portalClassName={theme === 'dark' ? 'bp5-dark' : ''}
      canOutsideClickClose={false}
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
