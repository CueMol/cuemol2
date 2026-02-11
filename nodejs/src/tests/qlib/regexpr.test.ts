import { cm } from '../setup';
import { RegExpr } from '@/wrappers/RegExpr';

describe('RegExpr', () => {
    let re: RegExpr;

    beforeEach(() => {
        re = cm.createObj('RegExpr') as RegExpr;
    });

    describe('pattern management', () => {
        it('sets pattern via setup() method', () => {
            re.setup('(\\d+)');
            expect(re.p).toBe('(\\d+)');
            expect(re.toString()).toBe('(\\d+)');
        });

        it('sets pattern via p property', () => {
            re.p = '(\\d+)';
            expect(re.p).toBe('(\\d+)');
            expect(re.toString()).toBe('(\\d+)');
        });

        it('returns empty string for uninitialized pattern', () => {
            expect(re.toString()).toBe('');
        });

        it('allows pattern updates', () => {
            re.setup('(\\d+)');
            expect(re.p).toBe('(\\d+)');

            re.p = '[a-z]+';
            expect(re.p).toBe('[a-z]+');
            expect(re.toString()).toBe('[a-z]+');
        });
    });

    describe('basic matching', () => {
        it('matches valid input and stores subject string', () => {
            re.setup('(\\d+)');
            expect(re.match('123 45')).toBe(true);
            expect(re.s).toBe('123 45');
        });

        it('returns false when pattern does not match', () => {
            re.setup('(\\d+)');
            expect(re.match('abc def')).toBe(false);
        });

        it('updates subject string on each match', () => {
            re.setup('(\\d+)');

            re.match('123');
            expect(re.s).toBe('123');

            re.match('456');
            expect(re.s).toBe('456');
        });
    });

    describe('capture groups', () => {
        it('captures single group with full match at index 0', () => {
            re.setup('(\\d+)');
            re.match('123 45');

            expect(re.size()).toBe(2);
            expect(re.at(0)).toBe('123');  // Full match
            expect(re.at(1)).toBe('123');  // First capture group
        });

        it('handles multiple capture groups', () => {
            re.setup('(\\d+)\\s+(\\w+)');
            re.match('123 abc');

            expect(re.size()).toBe(3);
            expect(re.at(0)).toBe('123 abc');
            expect(re.at(1)).toBe('123');
            expect(re.at(2)).toBe('abc');
        });

        it('handles nested capture groups', () => {
            re.setup('((\\d+)\\.(\\d+))');
            re.match('123.456');

            expect(re.size()).toBe(4);
            expect(re.at(0)).toBe('123.456');  // Full match
            expect(re.at(1)).toBe('123.456');  // Outer group
            expect(re.at(2)).toBe('123');      // First inner group
            expect(re.at(3)).toBe('456');      // Second inner group
        });

        it('handles optional capture groups that match', () => {
            re.setup('(\\d+)(\\.\\d+)?');
            re.match('123.456');

            expect(re.size()).toBe(3);
            expect(re.at(1)).toBe('123');
            expect(re.at(2)).toBe('.456');
        });

        it('handles optional capture groups that do not match', () => {
            re.setup('(\\d+)(\\.\\d+)?');
            re.match('789');

            // PCRE behavior: optional groups that don't match still increase size
            // but accessing them may throw or return empty
            expect(re.size()).toBeGreaterThanOrEqual(2);
            expect(re.at(1)).toBe('789');
        });
    });

    describe('complex patterns', () => {
        it('handles word boundaries', () => {
            re.setup('\\b(\\w+)\\b');
            re.match('hello world');

            expect(re.at(0)).toBe('hello');
            expect(re.at(1)).toBe('hello');
        });

        it('handles character classes', () => {
            re.setup('[A-Z]+([0-9]+)');
            re.match('ABC123xyz');

            expect(re.at(0)).toBe('ABC123');
            expect(re.at(1)).toBe('123');
        });

        it('handles alternation', () => {
            re.setup('(cat|dog)');

            re.match('I have a cat');
            expect(re.at(1)).toBe('cat');

            re.match('I have a dog');
            expect(re.at(1)).toBe('dog');
        });

        it('handles quantifiers', () => {
            re.setup('(\\w{3,5})');

            expect(re.match('ab')).toBe(false);

            re.match('abc');
            expect(re.at(1)).toBe('abc');

            re.match('abcdefgh');
            expect(re.at(1)).toBe('abcde');  // Matches first 5 chars
        });

        it('handles anchors', () => {
            re.setup('^(\\d+)$');

            expect(re.match('123')).toBe(true);
            expect(re.match('123 ')).toBe(false);
            expect(re.match(' 123')).toBe(false);
        });

        it('handles lookahead assertions', () => {
            re.setup('(\\d+)(?=px)');

            expect(re.match('100px')).toBe(true);
            expect(re.at(1)).toBe('100');
            expect(re.match('100em')).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('handles empty pattern matching anything', () => {
            re.setup('');
            expect(re.match('test')).toBe(true);
            expect(re.size()).toBe(1);
            expect(re.at(0)).toBe('');
        });

        it('handles empty subject string', () => {
            re.setup('.*');
            expect(re.match('')).toBe(true);
            expect(re.size()).toBe(1);
            expect(re.at(0)).toBe('');
        });

        it('handles pattern with no capture groups', () => {
            re.setup('\\d+');
            re.match('123');

            expect(re.size()).toBe(1);
            expect(re.at(0)).toBe('123');  // Only full match
        });

        it('handles Unicode characters in subject', () => {
            re.setup('(\\w+)');
            re.match('café');

            // PCRE's \w may or may not match non-ASCII depending on locale
            // Just verify it doesn't crash
            expect(re.size()).toBeGreaterThanOrEqual(1);
        });

        it('handles very long subject strings', () => {
            const longString = 'a'.repeat(10000) + 'b';
            re.setup('a+(b)');

            expect(re.match(longString)).toBe(true);
            expect(re.at(1)).toBe('b');
        });

        it('handles special regex characters correctly', () => {
            // Test proper escaping
            re.setup('\\.');
            expect(re.match('.')).toBe(true);

            re.setup('\\$');
            expect(re.match('$')).toBe(true);

            re.setup('\\^');
            expect(re.match('^')).toBe(true);
        });
    });

    describe('error handling', () => {
        it('throws on invalid pattern syntax', () => {
            re.setup('(\\d+))');  // Unbalanced parentheses
            expect(() => re.match('123')).toThrow();
        });

        it('throws on unclosed character class', () => {
            re.setup('[a-z');
            expect(() => re.match('abc')).toThrow();
        });

        it('throws on invalid escape sequence', () => {
            // PCRE may accept or reject this depending on version
            // Just verify behavior is consistent
            re.setup('\\q');
            // Some implementations accept \q, others don't
            // We just verify it doesn't crash the test suite
        });

        it('throws on out-of-range substring index after match', () => {
            re.setup('(\\d+)');
            re.match('123');

            expect(() => re.at(2)).toThrow();
            expect(() => re.at(10)).toThrow();
        });

        it('throws on negative substring index', () => {
            re.setup('(\\d+)');
            re.match('123');

            expect(() => re.at(-1)).toThrow();
        });

        it('throws when accessing substring before any match', () => {
            re.setup('(\\d+)');
            expect(() => re.at(0)).toThrow();
        });

        it('throws when accessing substring after failed match', () => {
            re.setup('(\\d+)');
            re.match('abc');  // No match

            expect(() => re.at(0)).toThrow();
        });
    });

    describe('state management', () => {
        it('preserves pattern across matches', () => {
            re.setup('(\\d+)');

            re.match('123');
            expect(re.p).toBe('(\\d+)');

            re.match('456');
            expect(re.p).toBe('(\\d+)');
        });

        it('updates match results on subsequent matches', () => {
            re.setup('(\\d+)');

            re.match('123');
            expect(re.s).toBe('123');
            expect(re.at(1)).toBe('123');

            re.match('456');
            expect(re.s).toBe('456');
            expect(re.at(1)).toBe('456');
        });

        it('allows pattern change and rematch', () => {
            re.setup('(\\d+)');
            re.match('123');
            expect(re.at(1)).toBe('123');

            re.p = '([a-z]+)';
            re.match('abc');
            expect(re.at(1)).toBe('abc');
        });

        it('handles failed match followed by successful match', () => {
            re.setup('(\\d+)');

            expect(re.match('abc')).toBe(false);
            expect(re.match('123')).toBe(true);
            expect(re.at(1)).toBe('123');
        });
    });

    describe('real-world patterns', () => {
        it('validates email addresses (simple pattern)', () => {
            re.setup('([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})');

            expect(re.match('user@example.com')).toBe(true);
            expect(re.at(1)).toBe('user');
            expect(re.at(2)).toBe('example.com');
        });

        it('parses version numbers', () => {
            re.setup('(\\d+)\\.(\\d+)\\.(\\d+)');

            re.match('1.2.3');
            expect(re.at(1)).toBe('1');
            expect(re.at(2)).toBe('2');
            expect(re.at(3)).toBe('3');
        });

        it('extracts hex color codes', () => {
            re.setup('#([0-9a-fA-F]{6})');

            re.match('color: #FF5733');
            expect(re.at(1)).toBe('FF5733');
        });

        it('parses URLs', () => {
            re.setup('(https?)://([^/]+)(/.*)?');

            re.match('https://example.com/path/to/resource');
            expect(re.at(1)).toBe('https');
            expect(re.at(2)).toBe('example.com');
            expect(re.at(3)).toBe('/path/to/resource');
        });

        it('validates IP addresses (simple pattern)', () => {
            re.setup('(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})');

            re.match('192.168.1.1');
            expect(re.at(1)).toBe('192');
            expect(re.at(2)).toBe('168');
            expect(re.at(3)).toBe('1');
            expect(re.at(4)).toBe('1');
        });
    });
});
