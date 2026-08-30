/**
 * @file renderer/shell/reveal/revealGate.ts
 * @description What is still keeping this window off screen.
 *
 * The window is created hidden and main shows it when this renderer asks
 * (IPC.WINDOW_REVEAL, sent by useRevealWindow). "Ready" is not one fact the
 * shell can state: a pane that loads its content asynchronously on mount --
 * the render history image, a hatch template -- knows about its own load and
 * nothing else does. Such a pane takes a hold for as long as it is loading,
 * and the reveal waits for the count to reach zero.
 *
 * Module state rather than context: a window has exactly one of these, and
 * the holders sit at different depths of two different trees.
 */

type Listener = () => void;

let holds = 0;
const listeners = new Set<Listener>();

/** Keep the window off screen until the returned release is called. */
export function holdReveal(): () => void {
    holds += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds === 0) for (const l of [...listeners]) l();
    };
}

/** How many holds are outstanding. */
export function revealHolds(): number {
    return holds;
}

/** Run `l` each time the hold count drops to zero. */
export function onRevealClear(l: Listener): () => void {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
}

/** Test seam: forget every hold and listener. */
export function resetRevealGate(): void {
    holds = 0;
    listeners.clear();
}
