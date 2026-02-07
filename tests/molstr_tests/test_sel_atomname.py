"""
Tests for atom name selection functionality in selection syntax.

- `name [name_list]` : Selects atoms with the specified atom names
- `n; [name_list]`   : Shorthand for name (space after semicolon is optional)

Name list specification:
- SEL_TOKEN: [_a-zA-Z0-9][_a-zA-Z0-9'*]*
  - Trailing ' and * are allowed for nucleic acid/sugar atom names (C1', O5', C1*)
- Case insensitivity is applied at selection matching time, not at parse time
  (i.e., "Ca" is stored as "Ca", not converted to "CA")
- Quoted strings: both single ('...') and double ("...") quotes supported
  - Quoting rules similar to Python strings
  - Quoted names are case-sensitive at matching time
- Regular expressions can be used with /pattern/ syntax
- sel_name grammar: SEL_STRING | SEL_STRING ':' | SEL_STRING ':' SEL_STRING | SEL_NULL | SEL_INTNUM
  - SEL_NULL is the literal string "null"
  - SEL_INTNUM (integers) are valid as name arguments
  - Colon syntax (e.g., "ABC:", "ABC:DEF") is supported

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
    ("name CA", "name CA"),
    ("name N", "name N"),
    ("name CA,N", "name N,CA"),
    ("name CA,N,O", "name O,N,CA"),
    # Whitespace variations
    ("name  CA", "name CA"),
    (" name CA", "name CA"),
    ("name CA ", "name CA"),
    ("name CA, N", "name N,CA"),
    # Shorthand 'n;'
    ("n; CA", "name CA"),
    ("n;CA", "name CA"),
    ("n; CA,N,O", "name O,N,CA"),
    # --- Bare string names (SEL_TOKEN) ---
    # Case is preserved at parse time (matching is case-insensitive)
    ("name abc", "name abc"),
    ("name Ca", "name Ca"),
    ("name CA", "name CA"),
    ("name C1", "name C1"),  # letter + number
    ("name C_A", "name C_A"),  # underscore
    ("name _ABC", "name _ABC"),  # starts with underscore
    ("name 1CA", "name 1CA"),  # starts with number + 2 letters
    ("name 1AB", "name 1AB"),
    ("name 1ABC", "name 1ABC"),
    # Nucleic acid/sugar atom names (' and * allowed in SEL_TOKEN)
    ("name C1'", "name C1'"),
    ("name C1''", "name C1''"),
    ("name C'1'", "name C'1'"),
    ("name C1*", "name C1*"),
    ("name C*1*", "name C*1*"),
    ("name C4'*", "name C4'*"),  # both ' and *
    ("name C'4*A", "name C'4*A"),  # both ' and *
    # --- SEL_INTNUM (integers are valid as name arguments) ---
    ("name 123", "name 123"),
    ("name 0", "name 0"),
    # --- SEL_NULL (literal "null" string) ---
    ("name null", "name (empty)"),
    # --- SEL_COLON syntax ---
    ("name ABC:", "name ABC:"),  # SEL_STRING SEL_COLON
    ("name ABC :", "name ABC:"),  # SEL_STRING SEL_COLON
    ("name ABC:DEF", "name ABC:DEF"),  # SEL_STRING SEL_COLON SEL_STRING
    ("name ABC : DEF", "name ABC:DEF"),  # SEL_STRING SEL_COLON SEL_STRING
    # --- Quoted string names (special chars, case preserved) ---
    # Double quoted
    ('name "C.A"', 'name "C.A"'),  # dot
    ('name "N-1"', 'name "N-1"'),  # hyphen
    ('name "O+1"', 'name "O+1"'),  # plus
    ('name "1A"', 'name "1A"'),  # would be INSRES as bare string
    ('name "C A"', 'name "C A"'),  # space
    ('name "ca"', 'name "ca"'),  # case preserved
    # Single quoted
    ("name 'C.A'", "name 'C.A'"),
    ("name 'N-1'", "name 'N-1'"),
    ("name '1A'", "name '1A'"),
    # Nested quotes (like Python)
    ('name "it\'s"', 'name "it\'s"'),  # single quote inside double
    ("name 'say \"hi\"'", "name 'say \"hi\"'"),  # double quote inside single
    # --- Regex patterns (syntax only) ---
    ("name /^C/", "name /^C/"),
    ("name /^CA$/", "name /^CA$/"),
    ("name /^C[AB]$/", "name /^C[AB]$/"),
    ("name /C[0-9]'/", "name /C[0-9]'/"),  # regex for nucleic acid atoms
    # --- Mixed types (bare, quoted, regex) ---
    ('name CA,"C.B"', 'name "C.B",CA'),
    ("name CA,'C.B'", "name 'C.B',CA"),  # single quoted
    ("name CA,/^C[0-9]$/", "name /^C[0-9]$/,CA"),
    ('name "C.A",/^N/', 'name /^N/,"C.A"'),
    ('name CA,"C.B",/^N/', 'name /^N/,"C.B",CA'),  # all three types
    ("name 'A',\"B\"", "name \"B\",'A'"),  # mixed quote types
    ("name C1',CA", "name CA,C1'"),  # nucleic acid + normal
    ("name O5',C1',N", "name N,C1',O5'"),  # multiple nucleic acid atoms
    ("name null,CA", "name CA,(empty)"),  # null + normal
    ("name 123,CA", "name CA,123"),  # integer + normal
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing or malformed ---
    ("name", "syntax error"),
    ("n;", "syntax error"),
    ("name ,CA", "syntax error"),
    ("name CA,", "syntax error"),
    ('name "CA', "syntax error"),  # unclosed double quote
    ("name 'CA", "syntax error"),  # unclosed single quote
    ("name /^CA", "syntax error"),  # unclosed regex
    # --- Keyword case sensitivity ---
    ("NAME CA", "undefined reference"),
    ("Name CA", "undefined reference"),
    ("N; CA", "undefined reference"),  # shorthand is also case-sensitive
    # --- Invalid bare strings ---
    # SEL_INSRES: number followed by single letter (insertion residue)
    ("name 1A", "syntax error"),
    ("name 12A", "syntax error"),
    ("name 123A", "syntax error"),
    # SEL_FLOATNUM: floating point numbers
    ("name 1.5", "syntax error"),
    ("name .5", "syntax error"),
    # Special chars not in SEL_TOKEN
    ("name C.A", "syntax error"),  # dot not allowed
    ("name N-1", "syntax error"),  # hyphen not allowed
    ("name -CA", "syntax error"),  # starts with hyphen
    ("name 'CA", "syntax error"),  # starts with singlequot
    ("name *CA", "syntax error"),  # starts with asterisk
]

# Quoted workarounds for invalid bare strings
QUOTED_WORKAROUND_CASES = [
    # Double quoted
    ('name "1A"', 'name "1A"'),  # INSRES as bare, works quoted
    ('name "12A"', 'name "12A"'),  # INSRES as bare, works quoted
    ('name "1.5"', 'name "1.5"'),  # FLOATNUM as bare, works quoted
    ('name "-CA"', 'name "-CA"'),  # hyphen start, works quoted
    ('name "C.A"', 'name "C.A"'),  # dot, works quoted
    # Single quoted
    ("name '1A'", "name '1A'"),
    ("name 'C.A'", "name 'C.A'"),
]


# =============================================================================
# Tests
# =============================================================================


class TestSelectNameValid:
    """Tests for valid atom name selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    @pytest.mark.parametrize("expression,expected_dump", QUOTED_WORKAROUND_CASES)
    def test_quoted_workaround(self, selobj, expression, expected_dump):
        """Quoted strings work for names invalid as bare strings."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.dumpNodes() == expected_dump


class TestSelectNameInvalid:
    """Tests for invalid atom name selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectNameEquivalence:
    """Tests to verify that 'name' and 'n;' are equivalent."""

    @pytest.mark.parametrize(
        "atom_name", ["CA", "CA,N,O", "/^C/", '"C.A"', "'C.A'", "C1'", "null", "123"]
    )
    def test_name_and_shorthand_equivalence(self, selobj, atom_name):
        selobj.compile(f"name {atom_name}", 0)
        dump_name = selobj.dumpNodes()

        selobj.compile(f"n; {atom_name}", 0)
        dump_shorthand = selobj.dumpNodes()

        assert dump_name == dump_shorthand
