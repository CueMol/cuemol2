/**
 * @file quit.test.ts
 * @description The `quit` line the CLI takes over (console-kit quitLine).
 *
 * Every spelling of a forced quit the app's command accepts must be caught
 * here too; a missed one is sent to the app, which quits while the CLI stays.
 */

import { describe, it, expect } from 'vitest'
import { quitLine } from '@cuemol/console-kit'

describe('quitLine', () => {
  it('reads force in every spelling, and leaves exit and bad values to the app', () => {
    expect(['quit', 'quit false', 'quit force=false'].map(quitLine)).toEqual(Array(3).fill({ force: false }))
    expect(['quit --force', 'quit -f', 'quit true', 'quit force=true', ' quit force = TRUE '].map(quitLine)).toEqual(
      Array(5).fill({ force: true }),
    )
    expect(['exit', 'exit -f', 'quit maybe', 'quit -f now', 'quitx'].map(quitLine)).toEqual(Array(5).fill(null))
  })
})
