/**
 * @file worker/server/services/clipboard/clipboard.service.ts
 * @description Copy and paste of scene nodes: the registry entry.
 *
 * These services are stateless. Copy returns the serialized bytes and paste
 * takes them back as an argument; the clipboard itself is the OS clipboard,
 * owned by the main process (`main/cuemolClipboard.ts`), so a payload can be
 * exchanged with the UXP CueMol2 app and -- once the single-instance lock is
 * lifted -- between two CueMol3 instances. A worker-side cache in front of it
 * would go stale the moment another process copied, which is exactly the case
 * it would exist to serve.
 *
 * XML crosses the boundary as raw bytes (`copyToTypedArray`) because a C++
 * ByteArray reference is meaningless outside this thread.
 */

import { copyNode, copyNodes } from './copy';
import { pasteNode } from './paste';
export const services = {
    copyNode,
    copyNodes,
    pasteNode,
};

export type * from './types';
