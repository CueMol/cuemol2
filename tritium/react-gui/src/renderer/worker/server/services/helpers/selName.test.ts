/**
 * @file worker/server/services/helpers/selName.test.ts
 * @description Pins the quoting contract for names in selection strings.
 */

import { describe, it, expect } from 'vitest'
import { quoteSelName } from './selName'
import { INVALID_UID, isValidUid } from '../../../shared/uid'

describe('quoteSelName', () => {
  it('quotes a plain name', () => {
    expect(quoteSelName('A')).toBe("'A'")
  })

  it('quotes a name with a space (mmCIF auth_asym_id can have one)', () => {
    expect(quoteSelName('A 1')).toBe("'A 1'")
  })

  it('quotes an empty name', () => {
    expect(quoteSelName('')).toBe("''")
  })

  /**
   * The scanner's escape rule appends the whole `\'` match to the value, so the
   * backslash survives and the compiled name is not what was asked for. There
   * is no representation for such a name; refuse rather than select the wrong
   * atoms.
   */
  it('refuses a name containing a single quote', () => {
    expect(quoteSelName("O'Brien")).toBeNull()
  })
})

/**
 * `qlib::invalid_uid` is 0 (src/qlib/qlib.hpp), so the `uid < 0` guards these
 * services used never fired: a "not found" answer fell through as a real uid.
 * saveStyleSetToFile(0, 0, path) logged "styleset (0) not found" and returned
 * false, and saveSelDef wrote named selections into style-set id 0.
 */
describe('isValidUid', () => {
  it('rejects the C++ sentinel', () => {
    expect(isValidUid(INVALID_UID)).toBe(false)
    expect(isValidUid(0)).toBe(false)
  })

  it('accepts a real uid', () => {
    expect(isValidUid(1)).toBe(true)
    expect(isValidUid(4242)).toBe(true)
  })

  it('rejects values a C++ lookup can never return', () => {
    expect(isValidUid(-1)).toBe(false)
    expect(isValidUid(NaN)).toBe(false)
    expect(isValidUid(undefined)).toBe(false)
    expect(isValidUid(null)).toBe(false)
  })
})
