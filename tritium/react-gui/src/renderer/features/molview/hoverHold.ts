/**
 * @file features/molview/hoverHold.ts
 * @description Freeze the 3D view hover state -- the label chip and the C++
 * hover highlight -- while a context menu owns the pointer.
 *
 * A right-click opens the navi context menu, and the menu (a React overlay on
 * Windows / Linux, a native popup on macOS) takes the pointer away from the
 * canvas. Under the plain hover rules that clears the very hit the menu is
 * about. `withHoverHold` marks the window from the menu appearing until the
 * user picks an item or dismisses it; while it is held `useHoverInfoHandler`
 * keeps the last hit and sends no clear, then resamples on release.
 *
 * Module state rather than a context: the holder (useNaviContextMenu) and the
 * hover controller (inside MolViewHoverLabel) are siblings, and a hold must
 * re-render neither of them.
 */

let holds = 0;
const releaseListeners = new Set<() => void>();

/** True while a context menu (or another pointer owner) holds the hover. */
export function isHoverHeld(): boolean {
    return holds > 0;
}

/** Subscribe to "the last hold ended"; returns the unsubscribe. */
export function onHoverHoldRelease(fn: () => void): () => void {
    releaseListeners.add(fn);
    return () => {
        releaseListeners.delete(fn);
    };
}

/** Hold the hover for as long as `fn` runs; nested holds are counted. */
export async function withHoverHold<T>(fn: () => Promise<T>): Promise<T> {
    holds += 1;
    try {
        return await fn();
    } finally {
        holds -= 1;
        if (holds === 0) {
            for (const listener of [...releaseListeners]) listener();
        }
    }
}
