/**
 * @file shared/cuemolClipboard.ts
 * @description Codec for the two CueMol clipboard interchange formats.
 *
 * Pure functions only -- no Electron import -- so the main process and the
 * unit tests share one implementation. The renderer and the worker never
 * import this: they hand raw bytes across IPC and main does the encoding.
 *
 * ## Format A -- legacy native (byte-compatible with UXP CueMol2)
 *
 * The format name is the UXP flavor string verbatim (`kFlavorMap` in
 * `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/qsc-copipe.js`), which is
 * also the native format name Gecko registers on Windows
 * (`RegisterClipboardFormatW`, `widget/windows/nsClipboard.cpp:117`) and on
 * GTK (`gdk_atom_intern`, `widget/gtk/nsClipboard.cpp:193`).
 *
 * The payload is `nsPrimitiveHelpers`' `ToNewUnicode` of the JS string, i.e.
 * raw UTF-16LE, with a trailing UTF-16 NUL on Windows that is not counted in
 * the declared length. Which JS string, though, differs by kind:
 *
 *   - scenexml kinds: `XPCCueMol.cpp` `ConvBAryToStr` copies the XML bytes
 *     into an `nsACString` one-for-one, and XPConnect's `T_CSTRING` rule
 *     ("c-strings (binary blobs) are deliberately not converted from UTF-8 to
 *     UTF-16", `js/xpconnect/src/XPCConvert.cpp:305-322`) hands them to JS
 *     **latin1-expanded**. Each XML byte is one code unit; the string is not
 *     readable text.
 *   - `paint`: a real `JSON.stringify` result, so ordinary text.
 *
 * That one difference is the whole of `byteEncodingFor` below.
 *
 * ## Format B -- text envelope (new; the only channel that works on macOS)
 *
 * Gecko on macOS refuses to export any flavor it does not recognise
 * (`widget/cocoa/nsClipboard.mm:636`), so the legacy custom formats never
 * reach NSPasteboard at all. `text/unicode` does, which is why the envelope
 * is plain text:
 *
 *     CueMolClipboard/1
 *     {"kind":"renderer","form":"rendArray","name":"cartoon1"}
 *     <base64 of the raw payload bytes>
 *
 * Line 1 is the magic, line 2 the metadata, and **everything after** is
 * base64 with all whitespace ignored -- so a wrapped or CRLF-normalised
 * payload still decodes. Base64 rather than raw text because an object
 * payload is not well-formed XML: `LDOM2Stream.cpp:232-265` appends an
 * end-of-XML sentinel plus xz+base64 data chunks after the document.
 *
 * @module shared/cuemolClipboard
 */

/** What a clipboard payload represents. */
export type ClipKind = 'object' | 'renderer' | 'camera' | 'style' | 'paint';

/**
 * Renderer payload shape. `rendArray` is UXP's "qscrendary": element 0 of
 * the restored array is the source group name. Other kinds are always
 * `single`.
 */
export type ClipForm = 'single' | 'rendArray';

export interface ClipMeta {
    kind: ClipKind;
    /** Defaults to 'single' when absent. */
    form?: ClipForm;
    /** Display hint only -- paste never depends on it (the XML carries the name). */
    name?: string;
}

/** One paint row, in the worker's DTO spelling. */
export interface PaintClipEntry {
    selStr: string;
    colorValue: string;
}

// --- Format A: legacy native ---

/** Legacy flavor strings, keyed by `<kind>` or `<kind>:rendArray`. */
const LEGACY_RENDERER = 'application/x-cuemol2-scenexml-rend';
const LEGACY_RENDERER_ARRAY = 'application/x-cuemol2-scenexml-rend-array';
const LEGACY_OBJECT = 'application/x-cuemol2-scenexml-obj';
const LEGACY_CAMERA = 'application/x-cuemol2-scenexml-cam';
const LEGACY_STYLE = 'application/x-cuemol2-scenexml-style';
const LEGACY_PAINT = 'application/x-cuemol2-json-paint';

/**
 * Probe order for reads. Renderer-before-renderer-array mirrors UXP
 * `onPasteRend`, which tries "qscrend" first and falls back to "qscrendary".
 */
export const LEGACY_PROBE_ORDER: ReadonlyArray<{
    format: string;
    kind: ClipKind;
    form: ClipForm;
}> = [
    { format: LEGACY_RENDERER, kind: 'renderer', form: 'single' },
    { format: LEGACY_RENDERER_ARRAY, kind: 'renderer', form: 'rendArray' },
    { format: LEGACY_OBJECT, kind: 'object', form: 'single' },
    { format: LEGACY_CAMERA, kind: 'camera', form: 'single' },
    { format: LEGACY_STYLE, kind: 'style', form: 'single' },
    { format: LEGACY_PAINT, kind: 'paint', form: 'single' },
];

/** The legacy flavor string a (kind, form) pair is written as. */
export function legacyFormatFor(kind: ClipKind, form: ClipForm): string {
    if (kind === 'renderer') {
        return form === 'rendArray' ? LEGACY_RENDERER_ARRAY : LEGACY_RENDERER;
    }
    if (kind === 'object') return LEGACY_OBJECT;
    if (kind === 'camera') return LEGACY_CAMERA;
    if (kind === 'style') return LEGACY_STYLE;
    return LEGACY_PAINT;
}

/**
 * How the payload bytes map to the JS string Gecko put on the clipboard.
 * `paint` carries real text; everything else is latin1-expanded XML bytes.
 */
function byteEncodingFor(kind: ClipKind): 'utf8' | 'latin1' {
    return kind === 'paint' ? 'utf8' : 'latin1';
}

/**
 * Encode payload bytes into the legacy wire buffer.
 *
 * @param platform - `process.platform`; only 'win32' appends the trailing
 *   UTF-16 NUL that `nsDataObj::GetText` adds (`nsDataObj.cpp:1485`).
 */
export function encodeLegacyPayload(
    kind: ClipKind,
    bytes: Uint8Array,
    platform: string,
): Buffer {
    const text = Buffer.from(bytes).toString(byteEncodingFor(kind));
    const body = Buffer.from(text, 'utf16le');
    if (platform !== 'win32') return body;
    return Buffer.concat([body, Buffer.from([0, 0])]);
}

/**
 * Trim what the platform may have appended to the UTF-16 payload.
 *
 * Windows hands back an HGLOBAL whose `GlobalSize` is rounded up by the
 * allocator, so the tail can hold more than the single NUL `nsDataObj`
 * wrote: drop every trailing NUL code unit, and an odd final byte that
 * cannot be part of a UTF-16 unit at all. No text payload we produce ends
 * in U+0000, so this can only remove padding.
 */
function trimWirePadding(buf: Buffer): Buffer {
    let end = buf.length;
    if (end % 2 === 1) end -= 1;
    while (end >= 2 && buf[end - 1] === 0 && buf[end - 2] === 0) end -= 2;
    return buf.subarray(0, end);
}

/** Decode a legacy wire buffer back into the payload bytes. */
export function decodeLegacyPayload(kind: ClipKind, buf: Buffer): Uint8Array {
    const text = trimWirePadding(buf).toString('utf16le');
    return new Uint8Array(Buffer.from(text, byteEncodingFor(kind)));
}

// --- Format B: text envelope ---

export const ENVELOPE_MAGIC = 'CueMolClipboard/1';

/** Strip a UTF-8 BOM and a trailing CR so line compares are exact. */
function cleanLine(line: string): string {
    return line.replace(/^﻿/, '').replace(/\r$/, '').trim();
}

/** Build the text envelope for a payload. */
export function encodeEnvelope(meta: ClipMeta, bytes: Uint8Array): string {
    const head: ClipMeta = { kind: meta.kind };
    if (meta.form && meta.form !== 'single') head.form = meta.form;
    if (meta.name) head.name = meta.name;
    return `${ENVELOPE_MAGIC}\n${JSON.stringify(head)}\n${Buffer.from(bytes).toString('base64')}\n`;
}

function isClipKind(v: unknown): v is ClipKind {
    return (
        v === 'object' || v === 'renderer' || v === 'camera' ||
        v === 'style' || v === 'paint'
    );
}

/**
 * Parse the first two lines of an envelope.
 *
 * Split out from `decodeEnvelope` so a Paste-gating probe can identify the
 * clipboard without base64-decoding a payload that may be megabytes.
 * Returns null for anything that is not a CueMol envelope.
 */
export function decodeEnvelopeHeader(text: string): ClipMeta | null {
    if (typeof text !== 'string' || text.length === 0) return null;
    const nl1 = text.indexOf('\n');
    if (nl1 < 0) return null;
    if (cleanLine(text.slice(0, nl1)) !== ENVELOPE_MAGIC) return null;
    const nl2 = text.indexOf('\n', nl1 + 1);
    if (nl2 < 0) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(cleanLine(text.slice(nl1 + 1, nl2)));
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    if (!isClipKind(rec.kind)) return null;
    const form: ClipForm = rec.form === 'rendArray' ? 'rendArray' : 'single';
    return {
        kind: rec.kind,
        form,
        name: typeof rec.name === 'string' ? rec.name : '',
    };
}

/** Base64 alphabet check, so a truncated payload fails instead of decoding short. */
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Parse a full envelope. Returns null when the text is not a CueMol
 * envelope or the payload is not intact base64.
 */
export function decodeEnvelope(
    text: string,
): { meta: ClipMeta; bytes: Uint8Array } | null {
    const meta = decodeEnvelopeHeader(text);
    if (!meta) return null;
    const nl1 = text.indexOf('\n');
    const nl2 = text.indexOf('\n', nl1 + 1);
    // Everything after line 2 is the payload; drop all whitespace so a
    // wrapped or CRLF-normalised base64 body still decodes.
    const b64 = text.slice(nl2 + 1).replace(/\s+/g, '');
    if (b64.length % 4 !== 0 || !BASE64_RE.test(b64)) return null;
    return { meta, bytes: new Uint8Array(Buffer.from(b64, 'base64')) };
}

// --- paint rows <-> the UXP JSON shape ---

/**
 * Serialize paint rows into UXP's `qscpaint` JSON. The keys must stay
 * `sel` / `col` -- that is what `coloring-panel.js` `_copyPaintEntryImpl`
 * writes and `onPaste` reads.
 */
export function toUxpPaintJson(entries: PaintClipEntry[]): string {
    return JSON.stringify(
        entries.map((e) => ({ sel: e.selStr, col: e.colorValue })),
    );
}

/**
 * Parse UXP's `qscpaint` JSON back into paint rows. Rows missing either
 * field are dropped, mirroring UXP's per-entry try/catch; a payload that is
 * not an array at all yields null.
 */
export function fromUxpPaintJson(json: string): PaintClipEntry[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const out: PaintClipEntry[] = [];
    for (const row of parsed) {
        if (typeof row !== 'object' || row === null) continue;
        const rec = row as Record<string, unknown>;
        if (typeof rec.sel !== 'string' || typeof rec.col !== 'string') continue;
        out.push({ selStr: rec.sel, colorValue: rec.col });
    }
    return out;
}
