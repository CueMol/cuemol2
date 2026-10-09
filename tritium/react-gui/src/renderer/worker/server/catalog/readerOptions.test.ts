/**
 * @file worker/server/catalog/readerOptions.test.ts
 * @description Reader options written as key=value text, as load_file takes them.
 */

import { describe, it, expect } from 'vitest'
import type { FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import { applyReaderOptionText } from './readerOptions'

const ccp4: FormatOptions = {
  kind: 'ccp4map',
  options: {
    normalize: true,
    truncateMinEnabled: false,
    truncateMin: 0,
    truncateMaxEnabled: false,
    truncateMax: 0,
    mapType: 'auto',
    subsample: 1,
  },
}

describe('applyReaderOptionText', () => {
  it('reads each value by the type of the option it replaces, and a value implies its switch', () => {
    const res = applyReaderOptionText(ccp4, 'Normalize=off truncatemin=-2.5 mapType=em')
    expect(res).toEqual({
      kind: 'ccp4map',
      options: { ...ccp4.options, normalize: false, truncateMinEnabled: true, truncateMin: -2.5, mapType: 'em' },
    })
  })

  it('refuses an unknown key with the list of options, and a value of the wrong type', () => {
    expect(applyReaderOptionText(ccp4, 'foo=1')).toEqual({ error: expect.stringContaining('normalize, truncateMinEnabled') })
    expect(applyReaderOptionText(ccp4, 'subsample=two')).toEqual({ error: 'subsample takes a number.' })
    expect(applyReaderOptionText(ccp4, 'mapType=cryo')).toEqual({ error: expect.stringContaining('auto, xtal, em') })
  })
})
