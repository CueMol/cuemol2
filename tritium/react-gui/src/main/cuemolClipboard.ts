/**
 * @file main/cuemolClipboard.ts
 * @description OS-clipboard I/O for CueMol scene nodes and paint rows.
 *
 * Main owns the clipboard because Electron's `clipboard` module is only
 * reachable here; the renderer relays bytes between the worker and these
 * three channels. Encoding lives in `shared/cuemolClipboard.ts` so main and
 * the unit tests share one implementation.
 *
 * ## Why the write path branches on platform
 *
 * The legacy CueMol2 flavors reach the OS clipboard on Windows
 * (`RegisterClipboardFormatW`) and on GTK (`gdk_atom_intern`), so writing
 * Format A there interoperates with the shipped CueMol2 with no change on
 * its side. On macOS Gecko drops any flavor it does not recognise
 * (`widget/cocoa/nsClipboard.mm:636`), so there is nothing to be
 * byte-compatible WITH -- the exchange has to go through text, which is
 * what Format B is for.
 *
 * Electron cannot put both on at once: `clipboard.writeBuffer` runs its own
 * `ScopedClipboardWriter`, which replaces the clipboard rather than adding
 * to it. Gecko has no such limit, so an updated CueMol2 writes both flavors
 * from one transferable and this side only ever has to pick one.
 *
 * Reading has no branch at all: probe the legacy formats in order, then
 * fall back to the text envelope. A macOS build therefore still reads a
 * Format A payload if one somehow appears, and a Windows build reads an
 * envelope produced anywhere.
 */
import { clipboard } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { handleInvoke } from './ipc/handleInvoke'
import type { CuemolClipPeekRes, CuemolClipReadRes, CuemolClipWriteReq } from '@shared/types/clipboard'
import {
  LEGACY_PROBE_ORDER,
  decodeEnvelope,
  decodeEnvelopeHeader,
  decodeLegacyPayload,
  encodeEnvelope,
  encodeLegacyPayload,
  fromUxpPaintJson,
  legacyFormatFor,
  toUxpPaintJson,
  type ClipForm,
  type ClipKind,
} from '@shared/cuemolClipboard'

/**
 * Whether the clipboard currently carries `format`.
 *
 * `clipboard.has` is the cheap probe, but it is marked experimental and has
 * historically been unimplemented for custom formats on some platforms, so
 * a throw falls back to reading and testing for content.
 */
function hasFormat(format: string): boolean {
  try {
    return clipboard.has(format)
  } catch {
    try {
      return clipboard.readBuffer(format).length > 0
    } catch {
      return false
    }
  }
}

/** The payload bytes plus what they are, from either format. */
interface ClipEntry {
  kind: ClipKind
  form: ClipForm
  name: string
  bytes: Uint8Array
}

/** Read whichever CueMol payload is on the clipboard, or null. */
function readEntry(): ClipEntry | null {
  for (const probe of LEGACY_PROBE_ORDER) {
    if (!hasFormat(probe.format)) continue
    let buf: Buffer
    try {
      buf = clipboard.readBuffer(probe.format)
    } catch {
      continue
    }
    if (buf.length === 0) continue
    // The legacy format carries no source name; the ctxmenu only uses the
    // kind, and the envelope path supplies a name when there is one.
    return {
      kind: probe.kind,
      form: probe.form,
      name: '',
      bytes: decodeLegacyPayload(probe.kind, buf),
    }
  }

  const env = decodeEnvelope(readTextSafe())
  if (!env) return null
  return {
    kind: env.meta.kind,
    form: env.meta.form ?? 'single',
    name: env.meta.name ?? '',
    bytes: env.bytes,
  }
}

function readTextSafe(): string {
  try {
    return clipboard.readText()
  } catch {
    return ''
  }
}

/** Put a CueMol payload on the clipboard in this platform's format. */
export function writeCuemolClipboard(
  req: CuemolClipWriteReq,
): { ok: boolean; error?: string } {
  try {
    const bytes =
      req.kind === 'paint'
        ? new Uint8Array(Buffer.from(toUxpPaintJson(req.entries), 'utf8'))
        : req.bytes
    const form: ClipForm =
      req.kind === 'renderer' ? (req.form ?? 'single') : 'single'
    const name = req.kind === 'paint' ? '' : (req.name ?? '')

    if (process.platform === 'darwin') {
      clipboard.writeText(encodeEnvelope({ kind: req.kind, form, name }, bytes))
    } else {
      clipboard.writeBuffer(
        legacyFormatFor(req.kind, form),
        encodeLegacyPayload(req.kind, bytes, process.platform),
      )
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Pull the CueMol payload off the clipboard, or null when there is none. */
export function readCuemolClipboard(): CuemolClipReadRes {
  const entry = readEntry()
  if (!entry) return null
  if (entry.kind === 'paint') {
    const entries = fromUxpPaintJson(Buffer.from(entry.bytes).toString('utf8'))
    if (!entries || entries.length === 0) return null
    return { kind: 'paint', entries }
  }
  return {
    kind: entry.kind,
    form: entry.form,
    name: entry.name,
    bytes: entry.bytes,
  }
}

/**
 * Report what the clipboard holds without moving the payload.
 *
 * Kept separate from `readCuemolClipboard` so opening a context menu does
 * not copy a multi-megabyte object payload across the boundary just to
 * decide whether Paste is enabled.
 */
export function peekCuemolClipboard(): CuemolClipPeekRes {
  for (const probe of LEGACY_PROBE_ORDER) {
    if (hasFormat(probe.format)) return { kind: probe.kind, name: '' }
  }
  const meta = decodeEnvelopeHeader(readTextSafe())
  if (!meta) return null
  return { kind: meta.kind, name: meta.name ?? '' }
}

/** Register the three clipboard channels. Called once per main window. */
export function registerCuemolClipboardIpc(): void {
  handleInvoke(IPC.CLIPBOARD_CUEMOL_WRITE, (_event, req) =>
    writeCuemolClipboard(req),
  )
  handleInvoke(IPC.CLIPBOARD_CUEMOL_READ, () => readCuemolClipboard())
  handleInvoke(IPC.CLIPBOARD_CUEMOL_PEEK, () => peekCuemolClipboard())
}
