import { describe, it, expect } from 'vitest'
import { aboutRows, aboutText } from '@renderer/dialogs/aboutInfo'

describe('About dialog copy text', () => {
  it('is the product line then one "Label: value" line per row, in order', () => {
    const rows = aboutRows(
      { version: '2.4.2.548', build: '50606c07' },
      { electron: '42.11.16', chromium: '148.0', node: '24.18.1', v8: '14.8', os: 'Darwin arm64 25.5.0' },
      '2026-11-01T00:00:00Z',
    )
    expect(aboutText('CueMol3', rows)).toBe([
      'CueMol3',
      'Version: 2.4.2.548',
      'Commit: 50606c07',
      'Date: 2026-11-01T00:00:00Z',
      'Electron: 42.11.16',
      'Chromium: 148.0',
      'Node.js: 24.18.1',
      'V8: 14.8',
      'OS: Darwin arm64 25.5.0',
    ].join('\n'))
  })
})
