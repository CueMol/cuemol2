"""
Tests for alternate conformation (altconf) selection functionality in selection syntax.
- `alt [name_list]` : Selects atoms with the specified alternate conformation IDs

Alternate conformation selection:
- Used for selecting atoms with alternate conformations in PDB structures
- Common in crystal structures where atoms have multiple positions
- Alternate conformation IDs are typically single letters (A, B, C, etc.)
- Empty/null altconf represents atoms without alternate conformations
  (shown as blank in PDB files)

Name list specification:
- SEL_TOKEN: [_a-zA-Z0-9][_a-zA-Z0-9'*]*
  - Single characters like A, B, C are common
  - Case sensitivity depends on quoting
- Quoted strings: both single ('...') and double ("...") quotes supported
- Regular expressions can be used with /pattern/ syntax
- sel_name grammar: SEL_STRING | SEL_STRING ':' | SEL_STRING ':' SEL_STRING | SEL_NULL | SEL_INTNUM
  - SEL_NULL is the literal string "null" (represents no alternate conformation)
  - Colon syntax (e.g., "A:", "A:B") is supported

Important note about null:
- "null" represents atoms WITHOUT alternate conformation (blank in PDB)
- When selecting residues with partial alternate conformations, use "alt A,null"
  to get both the alternate conformation A and the non-alternate atoms
  (otherwise only side chains with altconf may be selected)

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Note: yacc parses comma-separated lists from right to left, so order is reversed

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic cases ---
    ("alt A", "alt A"),
    ("alt B", "alt B"),
    ("alt A,B", "alt B,A"),
    ("alt A,B,C", "alt C,B,A"),
    # Whitespace variations
    ("alt  A", "alt A"),
    (" alt A", "alt A"),
    ("alt A ", "alt A"),
    ("alt A, B", "alt B,A"),
    # --- null keyword (atoms without alternate conformation) ---
    ("alt null", "alt (empty)"),
    ("alt A,null", "alt (empty),A"),
    ("alt null,A", "alt A,(empty)"),
    ("alt A,null,B", "alt B,(empty),A"),
    # --- Bare string names (SEL_TOKEN) ---
    # Single characters (typical case)
    ("alt a", "alt a"),
    ("alt A", "alt A"),
    # Multi-character (less common but valid)
    ("alt AB", "alt AB"),
    ("alt A1", "alt A1"),
    ("alt _A", "alt _A"),
    # With trailing quote/asterisk (technically valid in SEL_TOKEN grammar)
    ("alt A'", "alt A'"),
    ("alt A*", "alt A*"),
    # --- Quoted strings (double quotes) ---
    # Quoted empty string (equivalent to null)
    ('alt ""', 'alt ""'),
    # Quoted single characters (case-sensitive matching)
    ('alt "A"', 'alt "A"'),
    ('alt "a"', 'alt "a"'),
    # Multiple quoted values
    ('alt "A","B"', 'alt "B","A"'),
    # Mixed quoted and unquoted
    ('alt A,"B"', 'alt "B",A'),
    ('alt "A",B', 'alt B,"A"'),
    # --- Quoted strings (single quotes) ---
    ("alt 'A'", "alt 'A'"),
    ("alt 'a'", "alt 'a'"),
    ("alt 'A','B'", "alt 'B','A'"),
    ("alt A,'B'", "alt 'B',A"),
    # --- Regular expressions ---
    ("alt /^A/", "alt /^A/"),
    ("alt /[AB]/", "alt /[AB]/"),
    ("alt A,/^B/", "alt /^B/,A"),
    ("alt /^A/,B", "alt B,/^A/"),
    # --- Colon syntax ---
    ("alt A:", "alt A:"),
    ("alt A:B", "alt A:B"),
    ("alt A:,B", "alt B,A:"),
    ("alt A:B,C", "alt C,A:B"),
    # --- Integer names ---
    # Integers are valid as altconf IDs
    ("alt 1", "alt 1"),
    ("alt 123", "alt 123"),
    ("alt 1,2", "alt 2,1"),
    ("alt A,1", "alt 1,A"),
    #
    ("alt NULL", "alt NULL"),
    ("alt Null", "alt Null"),
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing or malformed ---
    ("alt", "syntax error"),
    ("alt ,A", "syntax error"),
    ("alt A,", "syntax error"),
    ('alt "A', "syntax error"),  # unclosed double quote
    ("alt 'A", "syntax error"),  # unclosed single quote
    ("alt /^A", "syntax error"),  # unclosed regex
    # --- Keyword case sensitivity ---
    ("ALT A", "undefined reference"),
    ("Alt A", "undefined reference"),
    # --- Invalid bare strings ---
    # SEL_INSRES: number followed by single letter (insertion residue)
    ("alt 1A", "syntax error"),
    ("alt 12A", "syntax error"),
    ("alt 123A", "syntax error"),
    # SEL_FLOATNUM: floating point numbers
    ("alt 1.5", "syntax error"),
    ("alt .5", "syntax error"),
    # Special chars not in SEL_TOKEN
    ("alt A.B", "syntax error"),  # dot not allowed
    ("alt A-B", "syntax error"),  # hyphen not allowed
    ("alt -A", "syntax error"),  # starts with hyphen
    ("alt *A", "syntax error"),  # starts with asterisk (except when alone as SELTK_ALL)
]

# Quoted workarounds for invalid bare strings
QUOTED_WORKAROUND_CASES = [
    # Double quoted
    ('alt "1A"', 'alt "1A"'),  # INSRES as bare, works quoted
    ('alt "12A"', 'alt "12A"'),  # INSRES as bare, works quoted
    ('alt "1.5"', 'alt "1.5"'),  # FLOATNUM as bare, works quoted
    ('alt "-A"', 'alt "-A"'),  # hyphen start, works quoted
    ('alt "A.B"', 'alt "A.B"'),  # dot, works quoted
    # Single quoted
    ("alt '1A'", "alt '1A'"),
    ("alt 'A.B'", "alt 'A.B'"),
]

# Combination with hierarchical notation
HIERARCHICAL_CASES = [
    # Chain.residue.atom & alt expression
    ("A.7.* & alt A", "(A.7.*) & (alt A)"),
    ("A.7.* & alt B,null", "(A.7.*) & (alt B,(empty))"),
    ("*.10:20.* & alt A", "(*.10:20.*) & (alt A)"),
    # OR combinations
    ("alt A | alt B", "(alt A) | (alt B)"),
    ("alt A | alt null", "(alt A) | (alt (empty))"),
]

# =============================================================================
# Tests
# =============================================================================


class TestSelectAltconfValid:
    """Tests for valid alternate conformation selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    @pytest.mark.parametrize("expression,expected_dump", QUOTED_WORKAROUND_CASES)
    def test_quoted_workaround(self, selobj, expression, expected_dump):
        """Quoted strings work for altconf IDs invalid as bare strings."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.dumpNodes() == expected_dump


class TestSelectAltconfInvalid:
    """Tests for invalid alternate conformation selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectAltconfNull:
    """Tests specifically for 'null' keyword in altconf selection."""

    def test_null_alone(self, selobj):
        """Test 'null' keyword selects atoms without alternate conformation."""
        result = selobj.compile("alt null", 0)
        assert result
        assert selobj.dumpNodes() == "alt (empty)"

    def test_null_with_single_altconf(self, selobj):
        """Test common pattern: select altconf A and non-altconf atoms."""
        result = selobj.compile("alt A,null", 0)
        assert result
        assert selobj.dumpNodes() == "alt (empty),A"

    def test_null_with_multiple_altconf(self, selobj):
        """Test selecting multiple altconfs plus non-altconf atoms."""
        result = selobj.compile("alt A,B,null", 0)
        assert result
        assert selobj.dumpNodes() == "alt (empty),B,A"

    # def test_null_ordering(self, selobj):
    #     """Test that order doesn't matter for null."""
    #     # null first
    #     selobj.compile("alt null,A,B", 0)
    #     dump1 = selobj.dumpNodes()

    #     # null middle
    #     selobj.compile("alt A,null,B", 0)
    #     dump2 = selobj.dumpNodes()

    #     # null last
    #     selobj.compile("alt A,B,null", 0)
    #     dump3 = selobj.dumpNodes()

    #     # All should produce same result (reversed order)
    #     assert dump1 == dump2 == dump3 == "alt B,A,(empty)"

class TestSelectAltconfQuotedStrings:
    """Tests for quoted string handling in altconf selection."""

    def test_double_quoted_empty(self, selobj):
        """Empty quoted string is different from null keyword."""
        result = selobj.compile('alt ""', 0)
        assert result
        # Empty quoted string is stored as-is, not converted to null
        assert selobj.dumpNodes() == 'alt ""'

    def test_single_quoted_empty(self, selobj):
        """Empty single-quoted string."""
        result = selobj.compile("alt ''", 0)
        assert result
        assert selobj.dumpNodes() == "alt ''"

    def test_quoted_preserves_case(self, selobj):
        """Quoted strings preserve case."""
        # Double quoted
        selobj.compile('alt "a"', 0)
        dump_lower = selobj.dumpNodes()
        selobj.compile('alt "A"', 0)
        dump_upper = selobj.dumpNodes()
        assert dump_lower == 'alt "a"'
        assert dump_upper == 'alt "A"'

        # Single quoted
        selobj.compile("alt 'a'", 0)
        dump_lower = selobj.dumpNodes()
        selobj.compile("alt 'A'", 0)
        dump_upper = selobj.dumpNodes()
        assert dump_lower == "alt 'a'"
        assert dump_upper == "alt 'A'"

    def test_quoted_special_characters(self, selobj):
        """Quoted strings can contain special characters."""
        # Characters invalid as bare strings work when quoted
        cases = [
            ('alt "A-B"', 'alt "A-B"'),
            ('alt "A.B"', 'alt "A.B"'),
            ("alt 'A-B'", "alt 'A-B'"),
            ("alt 'A.B'", "alt 'A.B'"),
        ]
        for expr, expected in cases:
            assert selobj.compile(expr, 0)
            assert selobj.dumpNodes() == expected


class TestSelectAltconfRegex:
    """Tests for regular expression support in altconf selection."""

    def test_basic_regex(self, selobj):
        """Basic regex patterns."""
        cases = [
            ("alt /^A/", "alt /^A/"),  # starts with A
            ("alt /^[AB]/", "alt /^[AB]/"),  # starts with A or B
            ("alt /[ABC]/", "alt /[ABC]/"),  # contains A, B, or C
        ]
        for expr, expected in cases:
            assert selobj.compile(expr, 0)
            assert selobj.dumpNodes() == expected

    def test_regex_with_names(self, selobj):
        """Mix regex with normal names."""
        result = selobj.compile("alt A,/^B/", 0)
        assert result
        assert selobj.dumpNodes() == "alt /^B/,A"

    def test_multiple_regex(self, selobj):
        """Multiple regex patterns."""
        result = selobj.compile("alt /^A/,/^B/", 0)
        assert result
        assert selobj.dumpNodes() == "alt /^B/,/^A/"

