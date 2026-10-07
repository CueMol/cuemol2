import * as nodePath from 'path'
import { describe, expect, it } from 'vitest'
import type { OpContext } from './op'
import { desktopDir, outputPath } from './outputFile'

const ctx = (fileAccess?: 'any' | 'desktop') => ({ fileAccess }) as unknown as OpContext

describe('outputPath', () => {
  it('confines a model to a bare name on the desktop, and gives the console an absolute path', () => {
    expect(outputPath(ctx('desktop'), 'pic', '.png')).toEqual({ path: nodePath.join(desktopDir(), 'pic.png') })
    expect(outputPath(ctx('desktop'), '../pic.png', '.png')).toHaveProperty('error')
    expect(outputPath(ctx('desktop'), '/tmp/pic.png', '.png')).toHaveProperty('error')
    expect(outputPath(ctx(), 'sub/pic.png', '.png')).toHaveProperty('error')
    expect(outputPath(ctx('any'), 'sub/pic', '.png')).toEqual({ path: nodePath.resolve('sub/pic.png') })
  })
})
