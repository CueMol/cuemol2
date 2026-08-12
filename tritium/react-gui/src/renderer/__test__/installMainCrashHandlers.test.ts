/**
 * Pins the two behaviours the main-process crash funnel exists for:
 *
 *   1. A closed stdout pipe (`npm start | head`) must be swallowed, not turned
 *      into an uncaught exception -- that is what popped the untranslatable
 *      "A JavaScript error occurred in the main process" dialog.
 *   2. An uncaught exception must also reach stderr, so a piped / headless run
 *      keeps a copy of what the modal dialog shows.
 *
 * The module keeps a "stdio is dead" flag, so each test loads a fresh copy.
 * Listeners are added to the real `process`, so each test removes exactly the
 * ones it added and leaves the runner's own handlers untouched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// installMainCrashHandlers lives in src/main (tsconfig.node project). A
// string-variable dynamic import keeps tsc's cross-project check (TS6307) off
// this file while Vitest still resolves it at runtime -- same trick as
// quitState.test.ts.
const crashHandlersEntry = '../../main/installMainCrashHandlers'

interface CrashHandlersModule {
    installMainCrashHandlers(): void
}

type Listener = (...args: unknown[]) => void

const TARGETS: Array<[NodeJS.EventEmitter, string]> = [
    [process, 'uncaughtException'],
    [process, 'unhandledRejection'],
    [process.stdout, 'error'],
    [process.stderr, 'error'],
]

/** Capture the listener sets that must be restored after each test. */
function snapshot(): Listener[][] {
    return TARGETS.map(([emitter, event]) => emitter.listeners(event) as Listener[])
}

function restore(before: Listener[][]): void {
    TARGETS.forEach(([emitter, event], i) => {
        const kept = new Set(before[i])
        for (const fn of emitter.listeners(event) as Listener[]) {
            if (!kept.has(fn)) emitter.removeListener(event, fn)
        }
    })
}

/** Load and run a pristine copy of the module (module-level flag reset). */
async function install(): Promise<void> {
    vi.resetModules()
    const mod = (await import(crashHandlersEntry)) as CrashHandlersModule
    mod.installMainCrashHandlers()
}

/** The single listener `install()` added for TARGETS[index]. */
function addedListener(before: Listener[][], index: number): Listener {
    const [emitter, event] = TARGETS[index]
    const kept = new Set(before[index])
    const added = (emitter.listeners(event) as Listener[]).filter((fn) => !kept.has(fn))
    expect(added).toHaveLength(1)
    return added[0]
}

const UNCAUGHT = 0

function pipeError(): NodeJS.ErrnoException {
    const err: NodeJS.ErrnoException = new Error('write EPIPE')
    err.code = 'EPIPE'
    return err
}

function spyStderrWrite() {
    return vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
}

describe('installMainCrashHandlers', () => {
    let before: Listener[][]
    let writeSpy: ReturnType<typeof spyStderrWrite>

    beforeEach(() => {
        before = snapshot()
        writeSpy = spyStderrWrite()
    })

    afterEach(() => {
        writeSpy.mockRestore()
        restore(before)
    })

    it('swallows an EPIPE on stdout instead of letting it throw', async () => {
        await install()

        // Without a listener, emitting 'error' on an EventEmitter throws.
        expect(() => process.stdout.emit('error', pipeError())).not.toThrow()
        expect(writeSpy).not.toHaveBeenCalled()
    })

    it('reports an uncaught exception to stderr', async () => {
        await install()

        addedListener(before, UNCAUGHT)(new Error('boom'))

        expect(writeSpy).toHaveBeenCalledTimes(1)
        const line = String(writeSpy.mock.calls[0][0])
        expect(line).toContain('uncaughtException')
        expect(line).toContain('boom')
    })

    it('stops writing to stderr once the pipe is known to be broken', async () => {
        await install()

        process.stdout.emit('error', pipeError())
        addedListener(before, UNCAUGHT)(new Error('boom'))

        expect(writeSpy).not.toHaveBeenCalled()
    })
})
