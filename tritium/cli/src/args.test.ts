/**
 * @file args.test.ts
 * @description What a command line means: a subcommand, or the console's own.
 */

import { describe, expect, it } from 'vitest'
import { parseArgv, UsageError } from './args'

describe('parseArgv', () => {
  it('reads a first subcommand word as the subcommand, and anything else as files', () => {
    expect(parseArgv(['--no-launch', 'mcp'])).toEqual({ kind: 'mcp', launch: false })
    expect(parseArgv(['skill', 'install', '--dir', 'd', '--force'])).toEqual({ kind: 'skill', install: true, dir: 'd', force: true })
    expect(parseArgv(['status', '--help'])).toEqual({ kind: 'help', topic: 'status' })
    // A file named like a subcommand, or one after a file, is a file.
    const run = parseArgv(['./skill', 'status', '-c', 'show cartoon', '-i'])
    expect(run).toMatchObject({ kind: 'run', files: ['./skill', 'status'], command: 'show cartoon', interactive: true })
    expect(parseArgv(['--bogus'])).toBeInstanceOf(UsageError)
  })
})
