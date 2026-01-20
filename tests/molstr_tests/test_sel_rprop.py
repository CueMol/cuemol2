"""
Tests for residue property selection functionality in selection syntax.

- `rprop [prop_name]=[prop_value]` : Selects residues with specified property values

Property specification:
- sel_name grammar: SEL_STRING | SEL_STRING ':' | SEL_STRING ':' SEL_STRING | SEL_NULL | SEL_INTNUM
  - SEL_TOKEN: [_a-zA-Z0-9][_a-zA-Z0-9'*]*
  - Trailing ' and * are allowed
  - Case insensitivity is applied at selection matching time, not at parse time
  - Quoted strings: both single ('...') and double ("...") quotes supported
  - Regular expressions can be used with /pattern/ syntax
  - SEL_NULL is the literal string "null"
  - SEL_INTNUM (integers) are valid
  - Colon syntax (e.g., "ABC:", "ABC:DEF") is supported

Example: rprop secondary=helix
  - Selects all residues where the 'secondary' property equals 'helix'

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic cases (documentation example) ---
    ("rprop secondary=helix", "rprop secondary=helix"),
    # Whitespace variations
    ("rprop  secondary=helix", "rprop secondary=helix"),
    ("rprop secondary = helix", "rprop secondary=helix"),
    # --- Bare string names (SEL_TOKEN) ---
    # Case is preserved at parse time (matching is case-insensitive)
    ("rprop Prop=Value", "rprop Prop=Value"),
    ("rprop prop1=value1", "rprop prop1=value1"),
    ("rprop 123=456", "rprop 123=456"),
    ("rprop Prop_Name=Value_Name", "rprop Prop_Name=Value_Name"),
    # Nucleic acid/sugar style names with ' and *
    ("rprop type=C1'", "rprop type=C1'"),
    ("rprop prop*name=value", "rprop prop*name=value"),
    # --- Quoted strings ---
    ('rprop propname = "value name"', "rprop propname=value name"),
    ("rprop Prop='Value'", "rprop Prop=Value"),
    # --- Regular expressions ---
    ("rprop secondary=/^hel/", "rprop secondary=^hel"),
    # --- null value ---
    ("rprop prop=null", "rprop prop=null"),
    # --- Integer values ---
    ("rprop count=123", "rprop count=123"),
    ("rprop index=-5", "rprop index=-5"),
    # --- Float values ---
    ("rprop count=1.23", "rprop count=1.230000"),
    ("rprop index=-5.6", "rprop index=-5.600000"),
    ("rprop count=-3.45e10", "rprop count=-34500000000.000000"),
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing or malformed ---
    ("rprop", "syntax error"),
    ("rprop secondary", "syntax error"),
    ("rprop =helix", "syntax error"),
    # --- Unclosed quotes/regex ---
    ('rprop "prop=value', "syntax error"),  # unclosed double quote
    ("rprop 'prop=value", "syntax error"),  # unclosed single quote
    ("rprop secondary=/^hel", "syntax error"),  # unclosed regex
    # --- Keyword case sensitivity ---
    ("RPROP secondary=helix", "undefined reference"),
    # --- Invalid operators ---
    ("rprop secondary==helix", "syntax error"),  # double equals
    ("rprop secondary>helix", "syntax error"),  # wrong operator
    # --- Invalid bare strings ---
    ("rprop 1A=value", "syntax error"),  # SEL_INSRES
    ("rprop 1.5=prop", "syntax error"),  # SEL_FLOATNUM
    ("rprop prop.name=value", "syntax error"),  # dot not allowed
    ("rprop prop-name=value", "syntax error"),  # hyphen not allowed
    # --- aprop is a reserved word ---
    ("aprop prop=value", "syntax error"),
]


# =============================================================================
# Tests
# =============================================================================


class TestSelectRpropValid:
    """Tests for valid residue property selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectRpropInvalid:
    """Tests for invalid residue property selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"
