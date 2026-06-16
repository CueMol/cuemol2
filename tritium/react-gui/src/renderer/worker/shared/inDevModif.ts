/**
 * @file worker/shared/inDevModif.ts
 * @description TypeScript mirror of the C++ `InDevEvent` modifier OUTPUT
 * bits. These are the modifier flags the C++ view reports on a
 * `mouseClicked` / `mouseDoubleClicked` event (`args.obj.mod`), so the
 * renderer-side click handlers can decode which mouse button / key was
 * down.
 *
 * SOURCE OF TRUTH: `src/qsys/InDevEvent.hpp` (enum `INDEV_SHIFT` ...
 * `INDEV_RBTN`). Keep these values in sync with that header.
 *
 *     INDEV_SHIFT = (1 << 0)
 *     INDEV_CTRL  = (1 << 1)
 *     INDEV_ALT   = (1 << 2)
 *     INDEV_LBTN  = (1 << 3)
 *     INDEV_MBTN  = (1 << 4)
 *     INDEV_RBTN  = (1 << 5)
 *
 * NOTE: these are NOT the same as the DOM-buttons encoding produced by
 * `inputEvents.ts` `makeModif` (left=1 / right=2 / middle=4 / ctrl=+32 /
 * shift=+64). That is a separate INPUT layer; do not route click decoding
 * through it. The input-vs-output button-mapping divergence is tracked
 * separately.
 */

/** Shift key down (InDevEvent OUTPUT bit). */
export const INDEV_SHIFT = 1 << 0
/** Ctrl / Cmd key down (InDevEvent OUTPUT bit). */
export const INDEV_CTRL = 1 << 1
/** Alt / Option key down (InDevEvent OUTPUT bit). */
export const INDEV_ALT = 1 << 2
/** Left mouse button down (InDevEvent OUTPUT bit). */
export const INDEV_LBTN = 1 << 3
/** Middle mouse button down (InDevEvent OUTPUT bit). */
export const INDEV_MBTN = 1 << 4
/** Right mouse button down (InDevEvent OUTPUT bit). */
export const INDEV_RBTN = 1 << 5

/** Decoded mouse-click payload from a C++ `mouseClicked` event. */
export interface DecodedClick {
    x: number
    y: number
    /** Raw modifier bitmask (`INDEV_*`). */
    mod: number
}

/**
 * Decode the `obj` payload of a C++ mouse-click event into `{ x, y, mod }`,
 * or `null` when any field is missing.
 *
 * The click handlers receive `args` shaped as `{ obj?: { x, y, mod } }`;
 * this helper extracts and validates the three numeric fields so callers
 * can gate on the modifier bits (`decoded.mod & INDEV_LBTN`, etc.).
 *
 * @param args - the raw CueMol event payload.
 * @returns the decoded click, or null if x / y / mod are absent.
 */
export function decodeClick(args: unknown): DecodedClick | null {
    const { x, y, mod } =
        (args as { obj?: { x?: number; y?: number; mod?: number } } | null)?.obj ?? {}
    if (x == null || y == null || mod == null) return null
    return { x, y, mod }
}
