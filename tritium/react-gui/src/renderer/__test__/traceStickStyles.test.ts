/**
 * The `tracestick` renderer's styles as the GUI finds them: the default style
 * list a new renderer gets must name styles that exist in the shipped
 * `data/default_style.xml`, and the renderer Style submenu (which matches
 * `<type_name>$/i`, see rendererStyle.ts) must offer exactly the tracestick
 * styles -- not the ballstick or trace ones, whose names share a suffix.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDefaultStyleName } from '@renderer/worker/server/services/helpers/getDefaultStyleName'

const root = join(__dirname, '..', '..', '..', '..', '..')
const styleXml = readFileSync(join(root, 'data', 'default_style.xml'), 'utf-8')
const styleIds = [...styleXml.matchAll(/<style id="([^"]+)"/g)].map((m) => m[1])

describe('tracestick styles', () => {
  it('default styles exist and the Style submenu offers only tracestick shapes', () => {
    for (const name of getDefaultStyleName('tracestick').split(',')) {
      expect(styleIds).toContain(name)
    }
    const offered = styleIds.filter((id) => /tracestick$/i.test(id))
    expect(offered.sort()).toEqual(
      ['BallTraceStick', 'DefaultTraceStick', 'ThickBallTraceStick', 'ThickTraceStick'],
    )
    expect(offered.some((id) => /ballstick$/i.test(id) || /trace$/i.test(id))).toBe(false)
  })
})
