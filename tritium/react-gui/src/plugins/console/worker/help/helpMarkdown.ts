/**
 * @file plugins/console/worker/help/helpMarkdown.ts
 * @description `help` as Markdown, for both dialects.
 *
 * The structure -- heading, usage, argument table, index tables -- is built
 * here from each command's metadata. The prose is not written here: a
 * command generated from an op shows the op's own `description` and its
 * parameters' descriptions, the very text the MCP server and the agent send
 * a model, so there is one source for both (native/index.ts). Only what has
 * no op behind it (builtins, PyMOL commands, the overviews) is console text.
 */

/** One row of a command's argument table. */
export interface HelpArg {
  name: string
  /** What it takes ("selection", "one of `a`, `b`"); omitted when unknown. */
  type?: string
  /** Its default, "required", or "optional". */
  default: string
  /** Omitted when the command has none (builtins, PyMOL). */
  description?: string
}

/** What one command's help shows. */
export interface CommandHelp {
  name: string
  /** `usageLine`'s text, its `Usage: ` dropped. */
  usage: string
  /** The prose: an op's description, or a command's summary. */
  body: string
  args: readonly HelpArg[]
  /** A remark after the table (what an alias stands for). */
  note?: string
}

/** Text for a table cell: one line, `|` escaped. */
export function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')
}

export function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n')
}

/** One command's help. */
export function commandHelp(h: CommandHelp): string {
  const parts = [`## ${h.name}`, '```\n' + h.usage + '\n```', h.body]
  if (h.args.length > 0) {
    const typed = h.args.some((a) => a.type !== undefined)
    const described = h.args.some((a) => a.description !== undefined)
    const head = ['Argument', ...(typed ? ['Type'] : []), 'Default', ...(described ? ['Description'] : [])]
    const rows = h.args.map((a) => [
      `\`${a.name}\``,
      ...(typed ? [a.type ?? ''] : []),
      a.default,
      ...(described ? [a.description ?? ''] : []),
    ])
    parts.push(table(head, rows))
  }
  if (h.note) parts.push(`> ${h.note}`)
  return parts.join('\n\n')
}

/** A subject's commands as a table, under its heading. */
export function commandTable(title: string, commands: readonly { name: string; summary: string }[]): string {
  return `### ${title}\n\n${table(['Command', 'Summary'], commands.map((c) => [`\`${c.name}\``, c.summary]))}`
}
