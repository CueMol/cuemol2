/**
 * @file worker/server/services/renderjob/backends/procArgs.test.ts
 * @description Pins the quoting against the C++ splitter's grammar
 * (qlib::PosixProcImpl::parseCmdLine + replaceEsc).
 */

import { describe, it, expect } from 'vitest'
import { quoteProcArg } from './procArgs'

/** Mirror of the C++ tokenizer, so the expectations are checked end to end. */
function parseCmdLine(args: string): string[] {
  const re = /"(?:\\"|[^"])*"|(?:\\ |[^ ])+/g
  return (args.match(re) ?? []).map((tok) => {
    let t = tok
    if (t.startsWith('"')) t = t.slice(1)
    if (t.endsWith('"')) t = t.slice(0, -1)
    return t.replace(/\\ /g, ' ').replace(/\\"/g, '"')
  })
}

describe('quoteProcArg', () => {
  it('keeps a path with a space as one argument', () => {
    const p = 'C:\\Users\\Jane Doe\\AppData\\Local\\Temp\\render.png'
    expect(parseCmdLine(quoteProcArg(p))).toEqual([p])
  })

  it('keeps several spaced paths separate', () => {
    const a = '/tmp/my renders/layer0.png'
    const b = '/tmp/my renders/out.png'
    expect(parseCmdLine([quoteProcArg(a), '0.5', quoteProcArg(b)].join(' ')))
      .toEqual([a, '0.5', b])
  })

  it('survives a quote inside the value', () => {
    const p = '/tmp/we"ird/out.png'
    expect(parseCmdLine(quoteProcArg(p))).toEqual([p])
  })

  it('leaves an ordinary path unchanged after a round trip', () => {
    const p = '/tmp/plain/out.png'
    expect(parseCmdLine(quoteProcArg(p))).toEqual([p])
  })
})
