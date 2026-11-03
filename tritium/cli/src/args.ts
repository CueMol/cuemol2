/**
 * @file args.ts
 * @description What the command line asked for, and the usage text.
 *
 * gh-style: a first word that names a subcommand (`skill`, `mcp`, `status`,
 * `help`, `version`) is that subcommand; anything else is the console's own
 * command line (files, `-c`, or nothing for the interactive prompt). A file
 * named like a subcommand is opened as `./skill`.
 */

import type { ConsoleDialectId } from '@cuemol/console-kit'

/** A mistake on the command line (exit status 2, with the usage). */
export class UsageError extends Error {}

/** The console: interactive, `-c`, files, or what is piped in. */
export interface RunCommand {
  kind: 'run'
  dialect: ConsoleDialectId
  echo: boolean
  launch: boolean
  /** `-c`: commands to run after the files. */
  command: string | null
  /** Positional arguments: data files to load, a scene, a script, or `-` for stdin. */
  files: string[]
  /** `-i`: go on to the interactive prompt afterwards. */
  interactive: boolean
}

export type CliCommand =
  | RunCommand
  | { kind: 'skill'; install: boolean; dir: string | null; force: boolean }
  | { kind: 'mcp'; launch: boolean }
  | { kind: 'status' }
  | { kind: 'help'; topic: SubcommandName | null }
  | { kind: 'version' }

export const SUBCOMMANDS = ['skill', 'mcp', 'status', 'help', 'version'] as const
export type SubcommandName = (typeof SUBCOMMANDS)[number]

const isSubcommand = (a: string): a is SubcommandName => (SUBCOMMANDS as readonly string[]).includes(a)

export const USAGE = `usage: tritium_cli [OPTIONS] [FILE...] [-c COMMANDS] [-i]
       tritium_cli <command> [ARGS]

Runs CueMol console commands in the running app, against the active tab.
Starts CueMol3 when it is not running (unless --no-launch).

  tritium_cli                     interactive prompt (Tab completes, Ctrl-C stops a run)
  tritium_cli -c "fetch 1crn; create_renderer 1crn, ribbon"
  tritium_cli 1crn.pdb map.ccp4   open files (the reader is picked from the content,
                                  as File > Open does), then exit
  tritium_cli scene.qsc           open a scene in a tab
  tritium_cli script.qax          run a script (.qax, .pml in PyMOL syntax, .txt commands)
  cat cmds.txt | tritium_cli      run what is piped in (or FILE "-")

Commands:
  skill [install]   print (or install) the agent skill describing tritium_cli
  mcp               serve CueMol's MCP tools on stdin/stdout
  status            say whether CueMol is running (does not start it)
  help [COMMAND]    show this, or a command's help
  version           print the versions (same as --version)

Options:
  -c, --command CMDS     run CMDS (after any FILE)
  -i, --interactive      after FILE / -c, go on to the interactive prompt
  --dialect native|pymol speak PyMOL instead of native
  --echo                 print each command before its output
  --no-launch            fail instead of starting CueMol
  -V, --version          print the versions
  -h, --help             show this help

In the prompt, "native" / "pymol" switch dialect, "exit" or Ctrl-D leaves, and
"quit" quits CueMol itself (it asks to save; "quit --force" does not).

Exit status: 0 success, 1 a command failed, 2 usage error, 130 interrupted.`

export const SUBCOMMAND_USAGE: Record<SubcommandName, string> = {
  skill: `usage: tritium_cli skill
       tritium_cli skill install [--dir DIR] [--force]

Prints the agent skill (SKILL.md): how an AI agent drives CueMol through
tritium_cli. "install" writes it to ~/.claude/skills/cuemol/SKILL.md, or to
DIR/SKILL.md; an existing file with other content is kept unless --force.`,
  mcp: `usage: tritium_cli mcp [--no-launch]

Serves CueMol's MCP tools to an MCP client over stdin/stdout (the stdio
transport), relaying to the running app. Starts CueMol3 when it is not running
and opens its MCP server for that run, even when the MCP Server plugin is off
(its settings are left alone). Register it as, e.g.:

  claude mcp add cuemol -- tritium_cli mcp`,
  status: `usage: tritium_cli status

Says whether CueMol is running, on which port, and which endpoints it has
open. Does not start it. Exit status 0 when it is running, 1 when not.`,
  help: `usage: tritium_cli help [COMMAND]`,
  version: `usage: tritium_cli version

Prints tritium_cli's version and, when CueMol is running, the app's.
Does not start it.`,
}

/** The value of `--name VALUE` or `--name=VALUE` at argv[i]; advances `i` through `next`. */
function optionValue(argv: readonly string[], i: number, name: string): { value: string; next: number } | UsageError {
  const a = argv[i]
  if (a.startsWith(`${name}=`)) return { value: a.slice(name.length + 1), next: i }
  if (i + 1 >= argv.length) return new UsageError(`${a} needs a value`)
  return { value: argv[i + 1], next: i + 1 }
}

/** Parse a subcommand's own arguments. */
function parseSubcommand(name: SubcommandName, rest: readonly string[], launch: boolean): CliCommand | UsageError {
  if (rest.includes('-h') || rest.includes('--help')) return { kind: 'help', topic: name }
  switch (name) {
    case 'skill': {
      const cmd = { kind: 'skill' as const, install: false, dir: null as string | null, force: false }
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === 'install' && !cmd.install) cmd.install = true
        else if (cmd.install && a === '--force') cmd.force = true
        else if (cmd.install && (a === '--dir' || a.startsWith('--dir='))) {
          const v = optionValue(rest, i, '--dir')
          if (v instanceof UsageError) return v
          cmd.dir = v.value
          i = v.next
        } else return new UsageError(`skill: unexpected ${a}`)
      }
      return cmd
    }
    case 'mcp': {
      for (const a of rest) {
        if (a === '--no-launch') launch = false
        else return new UsageError(`mcp: unexpected ${a}`)
      }
      return { kind: 'mcp', launch }
    }
    case 'help': {
      if (rest.length > 1) return new UsageError('help takes one command')
      if (rest.length === 0) return { kind: 'help', topic: null }
      if (!isSubcommand(rest[0])) return new UsageError(`no such command: ${rest[0]}`)
      return { kind: 'help', topic: rest[0] }
    }
    case 'status':
    case 'version':
      if (rest.length > 0) return new UsageError(`${name}: unexpected ${rest[0]}`)
      return { kind: name }
  }
}

/** What `argv` (without node and the script) asks for, or why it makes no sense. */
export function parseArgv(argv: readonly string[]): CliCommand | UsageError {
  const run: RunCommand = {
    kind: 'run',
    dialect: 'native',
    echo: false,
    launch: true,
    command: null,
    files: [],
    interactive: false,
  }
  let help = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') help = true
    else if (a === '-V' || a === '--version') return { kind: 'version' }
    else if (a === '--echo') run.echo = true
    else if (a === '--no-launch') run.launch = false
    else if (a === '-i' || a === '--interactive') run.interactive = true
    else if (a === '-c' || a === '--command') {
      if (i + 1 >= argv.length) return new UsageError(`${a} needs the commands to run`)
      run.command = argv[++i]
    } else if (a === '--dialect' || a.startsWith('--dialect=')) {
      const v = optionValue(argv, i, '--dialect')
      if (v instanceof UsageError) return v
      if (v.value !== 'native' && v.value !== 'pymol') return new UsageError('--dialect must be native or pymol')
      run.dialect = v.value
      i = v.next
    } else if (a.startsWith('-') && a !== '-') return new UsageError(`unknown option ${a}`)
    else if (run.files.length === 0 && run.command === null && isSubcommand(a)) {
      return parseSubcommand(a, argv.slice(i + 1), run.launch)
    } else run.files.push(a)
  }
  if (help) return { kind: 'help', topic: null }
  return run
}
