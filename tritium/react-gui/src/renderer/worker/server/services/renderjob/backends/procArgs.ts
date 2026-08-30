/**
 * @file worker/server/services/renderjob/backends/procArgs.ts
 * @description Quoting for the single argument string ProcessManager takes.
 *
 * C++ splits that string itself (qlib::PosixProcImpl::parseCmdLine): a token is
 * either a double-quoted run -- in which `\"` stands for a literal quote -- or
 * a run of non-space characters in which `\ ` stands for a literal space.
 * `replaceEsc` then strips the surrounding quotes and undoes those two escapes.
 *
 * So an unquoted path containing a space is split into two arguments. That is
 * not exotic: on Windows `os.tmpdir()` is
 * C:\Users\<account>\AppData\Local\Temp, and any account name with a space in
 * it breaks every path handed to a render backend.
 */

/**
 * Quote one argument for `ProcessManager`.
 *
 * @param value - raw argument (a path, a number, a flag).
 * @returns the quoted token.
 */
export function quoteProcArg(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}
