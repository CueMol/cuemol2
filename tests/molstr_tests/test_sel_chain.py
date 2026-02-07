"""
Tests for chain selection functionality in selection syntax.

- `chain [name_list]` : Selects atoms in the specified chains
- `c; [name_list]`    : Shorthand for chain (space after semicolon is optional)

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic cases ---
    ("chain A", "chain A"),
    ("chain B", "chain B"),
    ("chain A,B", "chain B,A"),
    ("chain A,B,C", "chain C,B,A"),
    # Whitespace variations
    ("chain  A", "chain A"),
    (" chain A", "chain A"),
    ("chain A ", "chain A"),
    ("chain A, B", "chain B,A"),
    # Shorthand 'c;'
    ("c; A", "chain A"),
    ("c;A", "chain A"),
    ("c; A,B,C", "chain C,B,A"),
    # Case is preserved at parse time (matching is case-insensitive)
    ("chain a", "chain a"),
    ("chain Ab", "chain Ab"),
    ("chain AB", "chain AB"),
    # Multi-character chain names
    ("chain AB,CD", "chain CD,AB"),
    # Numeric chain names
    ("chain 1", "chain 1"),
    ("chain 12", "chain 12"),
    ("chain '1A'", "chain '1A'"),
    ('chain "1A"', 'chain "1A"'),
    # Regexp selection
    ("chain /^[A-Z]/", "chain /^[A-Z]/"),
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing or malformed ---
    ("chain", "syntax error"),
    ("c;", "syntax error"),
    ("chain ,A", "syntax error"),
    ("chain A,", "syntax error"),
    # --- Keyword case sensitivity ---
    ("CHAIN A", "undefined reference"),
    ("Chain A", "undefined reference"),
    ("C; A", "undefined reference"),  # shorthand is also case-sensitive
    # --- Invalid chain name syntax ---
    ("chain 'A", "syntax error"),
    ('chain "A', "syntax error"),
    ("chain /^A", "syntax error"),
]

# =============================================================================
# Tests
# =============================================================================


class TestSelectChainValid:
    """Tests for valid chain selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectChainInvalid:
    """Tests for invalid chain selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectChainEquivalence:
    """Tests to verify that 'chain' and 'c;' are equivalent."""

    @pytest.mark.parametrize("chain_name", ["A", "A,B,C", "AB", "1", "12"])
    def test_chain_and_shorthand_equivalence(self, selobj, chain_name):
        selobj.compile(f"chain {chain_name}", 0)
        dump_chain = selobj.dumpNodes()

        selobj.compile(f"c; {chain_name}", 0)
        dump_shorthand = selobj.dumpNodes()

        assert dump_chain == dump_shorthand
