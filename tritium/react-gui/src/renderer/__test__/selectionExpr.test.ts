import { describe, it, expect } from 'vitest'
import {
    parseNameList,
    parseNumList,
    buildTerm,
    canApplyBinary,
    applyBinary,
    applyUnary,
} from '../components/panes/selection/selectionExpr'

describe('parseNameList', () => {
    it('joins trimmed comma tokens', () => {
        expect(parseNameList(' CA , CB ,CG', false)).toBe('CA,CB,CG')
    })

    it('drops empty tokens', () => {
        expect(parseNameList('CA,,CB,', false)).toBe('CA,CB')
    })

    it('single-quotes alphabetic tokens when quote is set (case-sensitive)', () => {
        expect(parseNameList('A,B', true)).toBe("'A','B'")
        // Alphanumeric chain ids keep their case-sensitive quoting too.
        expect(parseNameList('A1,H2', true)).toBe("'A1','H2'")
    })

    it('passes the * wildcard through unquoted so it stays a metacharacter', () => {
        // `'*'` would match a chain literally named "*"; `*` means all chains.
        expect(parseNameList('*', true)).toBe('*')
    })

    it('does not quote pure-numeric tokens (digits have no case)', () => {
        expect(parseNameList('1,2', true)).toBe('1,2')
    })

    it('passes through regex / quoted / null tokens unquoted', () => {
        expect(parseNameList('/^A/,"X y",\'Z\',null', true)).toBe('/^A/,"X y",\'Z\',null')
    })

    it('returns empty string when no tokens remain', () => {
        expect(parseNameList('  ,  ', false)).toBe('')
    })
})

describe('parseNumList', () => {
    it('keeps single numbers and ranges', () => {
        expect(parseNumList('10, 20:30')).toBe('10,20:30')
    })

    it('strips internal whitespace in ranges', () => {
        expect(parseNumList('20 : 30')).toBe('20:30')
    })

    it('preserves insertion codes', () => {
        expect(parseNumList('20A, 20A:25B')).toBe('20A,20A:25B')
    })

    it('returns empty string when no tokens remain', () => {
        expect(parseNumList(' , ')).toBe('')
    })
})

describe('buildTerm', () => {
    it('emits keyword-only terms for all / none', () => {
        expect(buildTerm('all', {})).toBe('all')
        expect(buildTerm('none', {})).toBe('none')
    })

    it('emits a quoted chain list', () => {
        expect(buildTerm('chain', { value: 'A,B' })).toBe("chain 'A','B'")
    })

    it('maps resi keyword to resid and parses ranges', () => {
        expect(buildTerm('resi', { value: '1:10, 20' })).toBe('resid 1:10,20')
    })

    it('maps resn / name to their emitted keywords', () => {
        expect(buildTerm('resn', { value: 'ALA,GLY' })).toBe('resn ALA,GLY')
        expect(buildTerm('name', { value: 'CA' })).toBe('name CA')
    })

    it('builds a comparison term for bfac', () => {
        expect(buildTerm('bfac', { op: '<', value: '30' })).toBe('bfac < 30')
    })

    it('builds a name=value term for rprop', () => {
        expect(buildTerm('rprop', { name: 'secondary', value: 'helix' })).toBe(
            'rprop secondary=helix',
        )
    })

    it('emits the positional dot form, filling blanks with "*"', () => {
        expect(buildTerm('hierarchical', { chain: 'A', resid: '10', aname: 'CA' })).toBe(
            "'A'.10.CA",
        )
        expect(buildTerm('hierarchical', { chain: 'A', resid: '1:10', aname: '' })).toBe(
            "'A'.1:10.*",
        )
        expect(buildTerm('hierarchical', { chain: '', resid: '10', aname: 'CA' })).toBe('*.10.CA')
    })

    it('keeps a typed "*" chain as the all-chains wildcard (not quoted)', () => {
        // Regression: quoting it to '*' made it match a chain named "*".
        expect(buildTerm('hierarchical', { chain: '*', resid: '10', aname: 'CA' })).toBe('*.10.CA')
    })

    it('returns null on incomplete input', () => {
        expect(buildTerm('chain', { value: '' })).toBeNull()
        expect(buildTerm('bfac', { op: '<', value: '' })).toBeNull()
        expect(buildTerm('rprop', { name: 'secondary', value: '' })).toBeNull()
        expect(buildTerm('hierarchical', {})).toBeNull()
    })
})

describe('canApplyBinary', () => {
    it('always allows set', () => {
        expect(canApplyBinary('', 'set')).toBe(true)
        expect(canApplyBinary('chain A', 'set')).toBe(true)
    })

    it('blocks add / intersect / sub on empty current', () => {
        expect(canApplyBinary('', 'add')).toBe(false)
        expect(canApplyBinary('   ', 'intersect')).toBe(false)
        expect(canApplyBinary('', 'sub')).toBe(false)
    })

    it('allows add / intersect / sub on non-empty current', () => {
        expect(canApplyBinary('chain A', 'add')).toBe(true)
    })
})

describe('applyBinary', () => {
    it('set replaces with the term', () => {
        expect(applyBinary('chain A', 'resn ALA', 'set')).toBe('resn ALA')
    })

    it('add ORs both operands, parenthesized', () => {
        expect(applyBinary('chain A', 'resn ALA', 'add')).toBe('(chain A) or (resn ALA)')
    })

    it('intersect ANDs both operands', () => {
        expect(applyBinary('chain A', 'resn ALA', 'intersect')).toBe('(chain A) and (resn ALA)')
    })

    it('sub ANDs the negated term', () => {
        expect(applyBinary('chain A', 'resn ALA', 'sub')).toBe('(chain A) and not (resn ALA)')
    })
})

describe('applyUnary', () => {
    it('prefixes not / byres / sidechain / mainchain', () => {
        expect(applyUnary('chain A', 'not')).toBe('not (chain A)')
        expect(applyUnary('chain A', 'byres')).toBe('byres (chain A)')
        expect(applyUnary('chain A', 'sidechain')).toBe('bysidech (chain A)')
        expect(applyUnary('chain A', 'mainchain')).toBe('bymainch (chain A)')
    })

    it('postfixes around / expand with the distance', () => {
        expect(applyUnary('chain A', 'around', '5')).toBe('(chain A) around 5')
        expect(applyUnary('chain A', 'expand', '3.5')).toBe('(chain A) expand 3.5')
    })
})
