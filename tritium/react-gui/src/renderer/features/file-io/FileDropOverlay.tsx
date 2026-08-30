/**
 * @file features/file-io/FileDropOverlay.tsx
 * @description Full-window overlay shown while an OS file drag hovers over
 * the app (useFileDrop's isDragActive). Display-only: pointer-events is
 * disabled in CSS so the overlay never disturbs the drag events or the drop.
 */

import React from 'react'
void React

/** Drop-target indicator rendered while dragging files over the window. */
export const FileDropOverlay: React.FC = () => (
  <div className="file-drop-overlay">
    <div className="file-drop-overlay-box type-subtitle">Drop files to open</div>
  </div>
)
