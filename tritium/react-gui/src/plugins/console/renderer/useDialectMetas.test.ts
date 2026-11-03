/**
 * @file plugins/console/renderer/useDialectMetas.test.ts
 * @description The dialects the console offers: native, then what switched-on plugins declare.
 *
 * The list is what the panel's switch, the history and the endpoint's check
 * read, so a value that is not a dialect meta (a plugin's mistake) must not
 * reach them, and native must always be there whatever the plugins say.
 */

import { describe, expect, it, vi } from 'vitest'
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness'

const contributed = vi.hoisted(() => ({ values: [] as unknown[] }))

vi.mock('@renderer/plugin-host/api', () => ({
  usePluginExtensions: () => contributed.values,
}))

import { useDialectMetas } from './useDialectMetas'

const meta = (id: string) => ({
  id, label: id, prompt: `${id}>`, txnPrefix: `${id}: `, actionSource: id, historyKey: id, scripts: [], cliColor: 'cyan',
})

describe('useDialectMetas', () => {
  it('lists native first, then the contributed metas, skipping malformed ones and a second id', () => {
    contributed.values = [meta('pymol'), { id: 'broken' }, meta('native'), meta('chimerax'), meta('pymol')]
    const h = makeRenderHook(() => useDialectMetas())
    expect(h.result.map((m) => m.id)).toEqual(['native', 'pymol', 'chimerax'])
    h.unmount()
  })
})
