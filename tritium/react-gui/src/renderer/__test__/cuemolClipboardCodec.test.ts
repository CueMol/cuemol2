/**
 * @file __test__/cuemolClipboardCodec.test.ts
 * @description Degrade-detection tests for the CueMol clipboard codec.
 *
 * This codec is the interop contract with the UXP CueMol2 app: if an
 * encoding here drifts, copy/paste between the two silently produces
 * garbage rather than failing loudly. What is pinned:
 *
 *   - Format A reproduces the bytes Gecko puts on the clipboard, including
 *     the fact that scenexml is latin1-expanded UTF-8 while the paint JSON
 *     is ordinary text -- the one asymmetry that is easy to "tidy up" into
 *     a bug;
 *   - the Windows trailing NUL, and a decode defensive enough for the
 *     allocator-rounded tail Windows can hand back;
 *   - Format B survives the ways a text clipboard mangles content (CRLF,
 *     wrapping, trailing newline) and rejects anything not intact.
 */
import { describe, it, expect } from 'vitest'
import {
  ENVELOPE_MAGIC,
  LEGACY_PROBE_ORDER,
  decodeEnvelope,
  decodeEnvelopeHeader,
  decodeLegacyPayload,
  encodeEnvelope,
  encodeLegacyPayload,
  fromUxpPaintJson,
  legacyFormatFor,
  toUxpPaintJson,
} from '../../shared/cuemolClipboard'

const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'))

describe('legacy flavor names', () => {
  it('uses the UXP kFlavorMap strings verbatim', () => {
    // These are also the native format names Gecko registers on Windows
    // and GTK, so a typo here silently breaks interop on both.
    expect(legacyFormatFor('renderer', 'single'))
      .toBe('application/x-cuemol2-scenexml-rend')
    expect(legacyFormatFor('renderer', 'rendArray'))
      .toBe('application/x-cuemol2-scenexml-rend-array')
    expect(legacyFormatFor('object', 'single'))
      .toBe('application/x-cuemol2-scenexml-obj')
    expect(legacyFormatFor('camera', 'single'))
      .toBe('application/x-cuemol2-scenexml-cam')
    expect(legacyFormatFor('style', 'single'))
      .toBe('application/x-cuemol2-scenexml-style')
    expect(legacyFormatFor('paint', 'single'))
      .toBe('application/x-cuemol2-json-paint')
  })

  it('probes single renderer before the array form, as UXP onPasteRend does', () => {
    const names = LEGACY_PROBE_ORDER.map((p) => p.format)
    expect(names.indexOf('application/x-cuemol2-scenexml-rend'))
      .toBeLessThan(names.indexOf('application/x-cuemol2-scenexml-rend-array'))
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('Format A: legacy wire payload', () => {
  it('zero-extends each XML byte into a UTF-16 unit (latin1, not UTF-8 decode)', () => {
    // UXP hands JS the raw bytes latin1-expanded (XPConnect T_CSTRING),
    // then stores them in an nsISupportsString. Decoding as UTF-8 first
    // would corrupt every non-ASCII name in the scene.
    const bytes = utf8('<a n="é"/>')
    const wire = encodeLegacyPayload('object', bytes, 'linux')
    expect(wire.length).toBe(bytes.length * 2)
    for (let i = 0; i < bytes.length; i++) {
      expect(wire[i * 2]).toBe(bytes[i])
      expect(wire[i * 2 + 1]).toBe(0)
    }
    expect(decodeLegacyPayload('object', wire)).toEqual(bytes)
  })

  it('round-trips a payload that is not well-formed XML', () => {
    // An object copy is XML followed by an end-of-XML sentinel and
    // xz+base64 data chunks; the codec must move bytes, not text.
    const raw = new Uint8Array([
      ...utf8('<object/>\n========== End of XML ==========\n'),
      0x01, 0x7f, 0x80, 0xff, 0x0a,
    ])
    expect(decodeLegacyPayload('object', encodeLegacyPayload('object', raw, 'linux')))
      .toEqual(raw)
  })

  it('treats the paint payload as real text, not latin1-expanded bytes', () => {
    // qscpaint is a JSON string UXP put straight into nsISupportsString, so
    // a non-ASCII selection name is one UTF-16 unit -- unlike scenexml.
    const json = '[{"sel":"aname CÄ","col":"#ff0000"}]'
    const wire = encodeLegacyPayload('paint', utf8(json), 'linux')
    expect(wire.toString('utf16le')).toBe(json)
    expect(Buffer.from(decodeLegacyPayload('paint', wire)).toString('utf8'))
      .toBe(json)
  })

  it('appends the trailing UTF-16 NUL on Windows only', () => {
    const bytes = utf8('<a/>')
    const win = encodeLegacyPayload('object', bytes, 'win32')
    const nix = encodeLegacyPayload('object', bytes, 'linux')
    expect(win.length).toBe(nix.length + 2)
    expect(win.subarray(nix.length)).toEqual(Buffer.from([0, 0]))
    expect(decodeLegacyPayload('object', win)).toEqual(bytes)
  })

  it('survives an allocator-rounded tail (extra NULs and an odd byte)', () => {
    // Windows returns an HGLOBAL whose GlobalSize is rounded up, so the
    // tail can hold more padding than the single NUL nsDataObj wrote.
    const bytes = utf8('<a/>')
    const body = encodeLegacyPayload('object', bytes, 'linux')
    for (const pad of [[0, 0], [0, 0, 0, 0], [0, 0, 0, 0, 0]]) {
      const padded = Buffer.concat([body, Buffer.from(pad)])
      expect(decodeLegacyPayload('object', padded), `pad ${pad.length}`)
        .toEqual(bytes)
    }
  })

  it('yields an empty payload for an empty buffer', () => {
    expect(decodeLegacyPayload('object', Buffer.alloc(0)))
      .toEqual(new Uint8Array())
  })
})

describe('Format B: text envelope', () => {
  const bytes = utf8('<renderer type="cartoon"/>')

  it('round-trips payload and metadata', () => {
    const text = encodeEnvelope(
      { kind: 'renderer', form: 'rendArray', name: 'grp1' },
      bytes,
    )
    expect(text.startsWith(`${ENVELOPE_MAGIC}\n`)).toBe(true)
    const got = decodeEnvelope(text)
    expect(got?.meta).toEqual({ kind: 'renderer', form: 'rendArray', name: 'grp1' })
    expect(got?.bytes).toEqual(bytes)
  })

  it('defaults form to single and name to empty', () => {
    const got = decodeEnvelope(encodeEnvelope({ kind: 'camera' }, bytes))
    expect(got?.meta).toEqual({ kind: 'camera', form: 'single', name: '' })
  })

  it('tolerates CRLF, a wrapped body and trailing whitespace', () => {
    const text = encodeEnvelope({ kind: 'style' }, bytes)
    const [l1, l2, b64] = text.split('\n')
    const mangled = `${l1}\r\n${l2}\r\n${b64.slice(0, 8)}\r\n${b64.slice(8)}\r\n\r\n`
    const got = decodeEnvelope(mangled)
    expect(got?.meta.kind).toBe('style')
    expect(got?.bytes).toEqual(bytes)
  })

  it('rejects anything that is not an intact CueMol envelope', () => {
    const good = encodeEnvelope({ kind: 'object' }, bytes)
    const [l1, l2, b64] = good.split('\n')
    for (const [label, text] of [
      ['plain text', 'just some copied text'],
      ['empty', ''],
      ['wrong magic', `CueMolClipboard/9\n${l2}\n${b64}`],
      ['no meta line', `${l1}\n`],
      ['broken meta', `${l1}\n{not json}\n${b64}`],
      ['unknown kind', `${l1}\n{"kind":"wat"}\n${b64}`],
      ['truncated base64', `${l1}\n${l2}\n${b64.slice(0, b64.length - 3)}`],
      ['non-base64 body', `${l1}\n${l2}\n!!!!`],
    ] as const) {
      expect(decodeEnvelope(text), label).toBeNull()
    }
  })

  it('reads the header without decoding the body', () => {
    // The Paste gate uses this on a payload that may be megabytes.
    const text = encodeEnvelope({ kind: 'object', name: 'mol1' }, bytes)
    const head = text.slice(0, text.indexOf('\n', text.indexOf('\n') + 1) + 1)
    expect(decodeEnvelopeHeader(head)).toEqual({
      kind: 'object', form: 'single', name: 'mol1',
    })
    expect(decodeEnvelopeHeader('hello')).toBeNull()
  })
})

describe('paint rows <-> UXP qscpaint JSON', () => {
  it('writes UXP key names, not the internal DTO spelling', () => {
    // CueMol2 reads obj[i].sel / obj[i].col; renaming these breaks paste
    // into the legacy app while both sides still look self-consistent.
    expect(toUxpPaintJson([{ selStr: 'aname CA', colorValue: '#ff0000' }]))
      .toBe('[{"sel":"aname CA","col":"#ff0000"}]')
  })

  it('round-trips through the wire spelling', () => {
    const rows = [
      { selStr: 'aname CA', colorValue: '#ff0000' },
      { selStr: '*', colorValue: 'hsb(120,1,1)' },
    ]
    expect(fromUxpPaintJson(toUxpPaintJson(rows))).toEqual(rows)
  })

  it('drops malformed rows but keeps the rest, as UXP onPaste does', () => {
    expect(
      fromUxpPaintJson('[{"sel":"a","col":"#fff"},{"sel":"b"},null,{"col":"#000"}]'),
    ).toEqual([{ selStr: 'a', colorValue: '#fff' }])
  })

  it('returns null when the payload is not an array', () => {
    for (const bad of ['', 'null', '{}', 'not json']) {
      expect(fromUxpPaintJson(bad), bad).toBeNull()
    }
  })
})
