import { cm } from '../setup.js';

describe('RegExpr', () => {
  let re;

  beforeEach(() => {
    re = cm.createObj('RegExpr');
  });

  describe('pattern setup and properties', () => {
    it('sets pattern via setup() method', () => {
      re.setup('(\\d+)');
      expect(re.p).toBe('(\\d+)');
      expect(re.toString()).toBe('(\\d+)');
    });

    it('sets pattern via p property', () => {
      re.p = '(\\d+)';
      expect(re.p).toBe('(\\d+)');
      expect(re.toString()).toBe('(\\d+)');
      expect(re.match('123 45')).toBe(true);
    });
  });

  describe('pattern matching', () => {
    it('matches valid input and captures groups', () => {
      re.setup('(\\d+)');
      expect(re.match('123 45')).toBe(true);
      
      // Subject string should be stored
      expect(re.s).toBe('123 45');
      expect(re.toString()).toBe('(\\d+)');
      
      // Check captured groups
      expect(re.size()).toBe(2);
      expect(re.at(0)).toBe('123');  // Entire match
      expect(re.at(1)).toBe('123');  // First capture group
    });

    it('returns false when pattern does not match', () => {
      re.setup('(\\d+)');
      expect(re.match('abc def')).toBe(false);
    });

    it('handles multiple capture groups', () => {
      re.setup('(\\d+)\\s+(\\w+)');
      expect(re.match('123 abc')).toBe(true);
      
      expect(re.size()).toBe(3);
      expect(re.at(0)).toBe('123 abc');  // Entire match
      expect(re.at(1)).toBe('123');      // First group
      expect(re.at(2)).toBe('abc');      // Second group
    });
  });

  describe('error handling', () => {
    it('throws on invalid pattern when matching', () => {
      // Invalid pattern: unbalanced parentheses
      re.setup('(\\d+))');
      expect(() => re.match('123 45')).toThrow();
    });

    it('throws on out-of-range substring index', () => {
      re.setup('(\\d+)');
      re.match('123 45');
      
      // Valid indices: 0, 1
      expect(() => re.at(2)).toThrow();
      expect(() => re.at(-1)).toThrow();
      expect(() => re.at(100)).toThrow();
    });

    it('throws when accessing substring before match', () => {
      re.setup('(\\d+)');
      // No match() called yet
      expect(() => re.at(0)).toThrow();
    });
  });

  describe('toString', () => {
    it('returns the pattern string', () => {
      re.setup('(\\d+)');
      expect(re.toString()).toBe('(\\d+)');
      
      re.p = '[a-z]+';
      expect(re.toString()).toBe('[a-z]+');
    });

    it('returns empty string for unset pattern', () => {
      expect(re.toString()).toBe('');
    });
  });

  describe('complex patterns', () => {
    it('handles word boundaries', () => {
      re.setup('\\b(\\w+)\\b');
      expect(re.match('hello world')).toBe(true);
      expect(re.at(1)).toBe('hello');
    });

    it('handles character classes', () => {
      re.setup('[A-Z]+([0-9]+)');
      expect(re.match('ABC123')).toBe(true);
      expect(re.at(0)).toBe('ABC123');
      expect(re.at(1)).toBe('123');
    });

    it('handles optional groups', () => {
      re.setup('(\\d+)(\\.\\d+)?');
      expect(re.match('123.456')).toBe(true);
      expect(re.at(1)).toBe('123');
      expect(re.at(2)).toBe('.456');
      
      expect(re.match('789')).toBe(true);
      expect(re.at(1)).toBe('789');
      // Note: at(2) may be empty or throw depending on PCRE behavior
    });
  });

  describe('edge cases', () => {
    it('handles empty pattern', () => {
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

    it('updates pattern and subject on subsequent matches', () => {
      re.setup('(\\d+)');
      re.match('123');
      expect(re.s).toBe('123');
      expect(re.at(0)).toBe('123');
      
      re.p = '([a-z]+)';
      re.match('abc');
      expect(re.s).toBe('abc');
      expect(re.at(0)).toBe('abc');
    });
  });
});
