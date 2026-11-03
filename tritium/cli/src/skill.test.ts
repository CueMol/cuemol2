/**
 * @file skill.test.ts
 * @description `skill install` does not overwrite a SKILL.md someone changed.
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { installSkill } from './skill'

describe('installSkill', () => {
  it('writes the skill, keeps an edited copy unless forced', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tcli-skill-')), 'cuemol')
    expect(installSkill('v1', dir, false)).toBe(path.join(dir, 'SKILL.md'))
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'edited')
    expect(installSkill('v2', dir, false)).toBeInstanceOf(Error)
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe('edited')
    expect(installSkill('v2', dir, true)).toBe(path.join(dir, 'SKILL.md'))
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe('v2')
  })
})
