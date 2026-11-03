/**
 * @file skill.ts
 * @description `tritium_cli skill`: the agent skill (skill/SKILL.md), printed
 * or installed where an agent finds it.
 *
 * The text is bundled (esbuild's text loader), so no file is read at run time
 * and no app is needed. It describes using tritium_cli and points the agent at
 * `tritium_cli -c help` for the commands, which the app answers from its own
 * catalogue, so the skill never goes stale against the app.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** Where `skill install` writes by default (Claude Code's user skills). */
export function defaultSkillDir(home: string = os.homedir()): string {
  return path.join(home, '.claude', 'skills', 'cuemol')
}

/**
 * Write `text` to `dir`/SKILL.md.
 *
 * @returns the file written, or an Error when a different SKILL.md is already
 *   there and `force` is not set (the user may have edited it)
 */
export function installSkill(text: string, dir: string, force: boolean): string | Error {
  const file = path.join(dir, 'SKILL.md')
  let existing: string | null = null
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch {
    // Not there yet.
  }
  if (existing !== null && existing !== text && !force) {
    return new Error(`${file} exists with other content; use --force to replace it`)
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, text)
  } catch (e) {
    return new Error(`cannot write ${file}: ${(e as Error).message}`)
  }
  return file
}
