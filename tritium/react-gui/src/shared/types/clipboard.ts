/**
 * @file shared/types/clipboard.ts
 * @description CueMol clipboard (scene nodes + paint rows on the OS clipboard) IPC shapes.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

import type { ClipForm, ClipKind, PaintClipEntry } from '../cuemolClipboard'

/**
 * Payload written to the OS clipboard.
 *
 * Split by kind because the two carry different things across the boundary:
 * a scene node travels as the serialized XML bytes the worker produced,
 * while paint rows travel as their DTOs and are turned into UXP's
 * `qscpaint` JSON by main (the codec lives in one place -- see
 * `shared/cuemolClipboard.ts`).
 */
export type CuemolClipWriteReq =
  | {
      kind: 'object' | 'renderer' | 'camera' | 'style'
      /** Renderer payload shape; 'rendArray' for a group / multi copy. */
      form?: ClipForm
      /** Display hint carried in the text envelope only. */
      name?: string
      bytes: Uint8Array
    }
  | { kind: 'paint'; entries: PaintClipEntry[] }

/** What was found on the clipboard, in the same split as the write request. */
export type CuemolClipReadRes =
  | {
      kind: 'object' | 'renderer' | 'camera' | 'style'
      form: ClipForm
      name: string
      bytes: Uint8Array
    }
  | { kind: 'paint'; entries: PaintClipEntry[] }
  | null

/** Identity of the clipboard content, for gating Paste affordances. */
export type CuemolClipPeekRes = { kind: ClipKind; name: string } | null
