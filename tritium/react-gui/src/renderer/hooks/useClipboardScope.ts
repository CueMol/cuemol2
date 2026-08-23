/**
 * @file hooks/useClipboardScope.ts
 * @description Register a panel as a target for the Edit menu's clipboard
 * actions.
 *
 * Pair this with a `data-clipboard-scope="<id>"` attribute on the panel's
 * container element: the attribute says where the scope is in the DOM, this
 * hook says what it does. See `utils/editClipboard.ts` for the routing.
 */

import { useEffect, useRef } from 'react'
import {
    registerClipboardScope,
    type ClipboardScopeHandlers,
} from '../utils/editClipboard'

/**
 * Register clipboard handlers for `scopeId` while `enabled`.
 *
 * The handlers are read through a ref, so a panel may pass freshly-created
 * closures on every render (the usual case -- they capture the current
 * selection) without re-registering. `enabled` lets a panel that is only
 * sometimes present, like the paint deck, drop out cleanly.
 */
export function useClipboardScope(
    scopeId: string,
    handlers: ClipboardScopeHandlers,
    enabled = true,
): void {
    const ref = useRef(handlers)
    ref.current = handlers

    useEffect(() => {
        if (!enabled) return
        return registerClipboardScope(scopeId, {
            cut: () => ref.current.cut(),
            copy: () => ref.current.copy(),
            paste: () => ref.current.paste(),
        })
    }, [scopeId, enabled])
}
