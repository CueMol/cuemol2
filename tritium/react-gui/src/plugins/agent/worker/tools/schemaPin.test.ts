/**
 * @file plugins/agent/worker/tools/schemaPin.test.ts
 * @description The tool list exactly as the model receives it.
 *
 * Pinned as a snapshot because the schemas are generated from the op
 * catalogue: a change to the generator must not silently change what the
 * provider is sent (and it is part of the cached prompt prefix, so even a
 * reordered key costs every user a cache miss). Update the snapshot only for
 * an intended catalogue change.
 */

import { describe, it, expect } from 'vitest'
import { ALL_AGENT_TOOLS } from './index'

describe('the tool list sent to the model', () => {
  it('is unchanged', () => {
    const sent = ALL_AGENT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      mutates: t.mutates,
      parameters: JSON.stringify(t.parameters),
    }))
    expect(sent).toMatchSnapshot()
  })
})
