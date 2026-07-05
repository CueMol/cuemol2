/**
 * @file components/panes/settings/AtomLabelPreview.tsx
 * @description Live WYSIWYG preview of the atom-label typography, shown in the
 * SettingsPane "Atom Labels" section. Renders sample text with the exact CSS
 * font shorthand the C++ label renderer uses (family, size, weight, style) plus
 * the chosen colour, on a viewport-like dark surface -- so the user sees the
 * result before it is applied. Improves on the UXP preview, which reflected
 * only family/bold/italic (fixed 20px, no colour).
 */

import React from 'react'
import { useAppSettings } from '../../../contexts/AppSettingsContext'
import { buildLabelFontCss } from './labelFont'

/** Residue-like sample covering case + digits, representative of atom labels. */
const SAMPLE_TEXT = 'Ala 123   ABC abc 0129'

export const AtomLabelPreview: React.FC = () => {
  const { labelDefaults } = useAppSettings()
  const font = buildLabelFontCss({
    fontName: labelDefaults.fontName,
    fontSize: labelDefaults.fontSize,
    bold: labelDefaults.bold,
    italic: labelDefaults.italic,
  })
  return (
    <div className="config-label-preview">
      <span className="config-label-preview-caption">Preview</span>
      <div className="config-label-preview-surface">
        <span
          className="config-label-preview-text"
          style={{ font, color: labelDefaults.color }}
        >
          {SAMPLE_TEXT}
        </span>
      </div>
    </div>
  )
}
