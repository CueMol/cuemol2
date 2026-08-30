/**
 * @file renderer/features/render/useWindowRelayResponder.ts
 * @description Answers the Rendering window's questions from the main window.
 *
 * The render window has no CueMol worker, so a few of the things it needs to
 * show -- the molview canvas size, a target view's camera, a hatch style spec
 * -- are asked over the relay (see main/ipc/windowRelay.ts). This hook is the
 * other end: one subscription for every kind, dispatching on the `kind` in
 * the request and invoking the reply with the same request id.
 *
 * A question with no answerer is dropped, and the asking side falls back when
 * its timeout expires. That is deliberate: replying with a made-up value
 * would be indistinguishable from a real answer.
 */

import { useEffect, useRef } from 'react';
import { IPC } from '@shared/ipcChannels';
import type { RelayKind, RelayReq, RelayRes } from '@shared/types/renderWindow';

/** One answerer per kind. May be async; a rejection is treated as no answer. */
export type RelayResponders = {
    [K in RelayKind]: (req: RelayReq<K>) => RelayRes<K> | Promise<RelayRes<K>>;
};

/**
 * Subscribe to relay requests and answer them.
 *
 * @param responders - answerer per kind. Read through a ref, so the caller
 *   may rebuild the object every render without churning the subscription.
 */
export function useWindowRelayResponder(responders: RelayResponders): void {
    const respondersRef = useRef(responders);
    respondersRef.current = responders;

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;
        return api.onPush(IPC.RENDER_RELAY_REQUEST, ({ kind, reqId, req }) => {
            const answer = respondersRef.current[kind] as (
                r: unknown,
            ) => unknown | Promise<unknown>;
            const send = (res: unknown): void => {
                api.invoke(IPC.RENDER_RELAY_REPLY, {
                    kind,
                    reqId,
                    res,
                } as never).catch(() => {});
            };
            try {
                Promise.resolve(answer(req)).then(send, () => {});
            } catch {
                // An answerer that throws is a bug on this side; let the
                // asking side time out rather than inventing a reply.
            }
        });
    }, []);
}
