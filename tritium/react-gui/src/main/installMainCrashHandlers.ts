/**
 * @file main/installMainCrashHandlers.ts
 * @description Main-process crash funnel. Mirrors uncaught exceptions and
 * unhandled rejections to the terminal, and keeps a broken stdio pipe from
 * surfacing as a crash.
 *
 * Electron's built-in handler only pops a modal "A JavaScript error occurred
 * in the main process" dialog, whose text cannot be copied and which never
 * reaches the log a headless / piped run captures. This funnel adds the stderr
 * copy.
 *
 * It has to raise the dialog itself, though. Electron's listener (verified in
 * the shipped binary) is:
 *
 *   process.on('uncaughtException', function (e) {
 *     process.listenerCount('uncaughtException') > 1 || ...showErrorBox(...)
 *   })
 *
 * -- so merely registering a listener here suppresses it, and a GUI user would
 * be left with no sign at all that anything went wrong. Neither Electron's
 * handler nor this one exits: staying up after an uncaught exception is
 * Electron's deliberate choice for a desktop app, and this file does not
 * change it.
 *
 * The renderer has its own funnel in `renderer/crash/`; this covers the main
 * process only.
 */

import { dialog } from 'electron';

/** stdio write errors that mean "nobody is reading" rather than a real fault. */
const PIPE_ERROR_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END']);

/** Set once a stdio stream reports a pipe error, to stop writing into it. */
let stdioBroken = false;

/**
 * Write a crash report without ever throwing.
 *
 * @remarks Must not use `console.*` unguarded: a dead stdout is exactly the
 *   case this file exists for, and re-entering the failing path would loop.
 */
function report(kind: string, err: unknown): void {
    if (stdioBroken) return;
    const detail = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
    try {
        process.stderr.write(`[Main] ${kind}: ${detail}\n`);
    } catch {
        // stderr is gone too -- nothing left to report through.
        stdioBroken = true;
    }
}

/**
 * Raise the modal Electron's own handler would have shown, since registering a
 * listener here suppressed it.
 *
 * @remarks Fully guarded: this runs on the crash path, where the dialog API may
 *   be unavailable (before `ready`, in tests), and a throw here would replace
 *   the report with a different crash.
 */
function showErrorDialog(err: unknown): void {
    try {
        const detail =
            err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
        dialog?.showErrorBox(
            'A JavaScript error occurred in the main process',
            `Uncaught Exception:\n${detail}`,
        );
    } catch {
        // No dialog available -- the stderr report above is the whole record.
    }
}

/**
 * Install the main-process crash handlers. Call once, as early as possible in
 * `main/index.ts` (before any window or store access).
 */
export function installMainCrashHandlers(): void {
    // Launching through a pipe that closes early (`npm start | head`) leaves
    // stdout writable but unread; the next console.log fails asynchronously in
    // the stream's write callback. Without an 'error' listener that becomes an
    // uncaught exception and pops the Electron dialog, so the app looks
    // crashed when only the log sink went away.
    for (const stream of [process.stdout, process.stderr] as const) {
        stream.on('error', (err: NodeJS.ErrnoException) => {
            if (PIPE_ERROR_CODES.has(err.code ?? '')) {
                stdioBroken = true;
                return;
            }
            report('stdio error', err);
        });
    }

    process.on('uncaughtException', (err) => {
        report('uncaughtException', err);
        showErrorDialog(err);
    });
    process.on('unhandledRejection', (reason) => report('unhandledRejection', reason));
}
