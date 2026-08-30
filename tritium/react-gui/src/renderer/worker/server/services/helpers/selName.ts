/**
 * @file worker/server/services/helpers/selName.ts
 * @description Quoting for chain / residue names embedded in selection strings.
 *
 * Selection strings are compiled by the C++ parser, whose scanner
 * (src/modules/molstr/scanner_sel.lxx) reads an unquoted name as
 * `SEL_TOKEN [_a-zA-Z0-9][_a-zA-Z0-9'*]*` -- so a name containing a space, or
 * any character outside that set, has to be single-quoted or the expression is
 * silently a different one.
 *
 * A name containing a single quote cannot be represented at all. The scanner's
 * `\'` rule appends the whole two-character match to the buffer, so the
 * backslash survives into the value and the compiled name is wrong. Such a name
 * is rejected here rather than compiled into something that would select the
 * wrong atoms.
 */

/**
 * Quote a name for use in a selection string.
 *
 * @param name - chain or residue name straight from the model.
 * @returns the quoted literal, or `null` when the name cannot be represented.
 */
export function quoteSelName(name: string): string | null {
    if (name.includes("'")) return null;
    return `'${name}'`;
}
