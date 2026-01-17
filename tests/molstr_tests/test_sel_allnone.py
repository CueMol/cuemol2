"""
Tests for "Select All" and "Select None" functionality
in selection syntax.
- `all` : Selects all atoms in the molecule
- `*`   : Selects all atoms in the molecule (equivalent to `all`)
- `none`: Selects nothing (empty selection)

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import cuemol
import pytest


@pytest.fixture
def selobj():
    return cuemol.createObj("SelCommand")


# Test cases: (input_expression, expected_dump)
SELECT_ALL_VALID_CASES = [
    # Asterisk syntax
    ("*", "*"),
    ("* ", "*"),
    (" *", "*"),
    ("  *  ", "*"),
    # 'all' keyword (case-sensitive, lowercase only)
    ("all", "*"),
    ("all ", "*"),
    (" all", "*"),
    ("  all  ", "*"),
]

# Test cases: (input_expression, expected_error_substring)
# Note: Non-matching identifiers are treated as undefined user-defined references
SELECT_ALL_INVALID_CASES = [
    ("*x", "syntax error"),
    ("*1", "syntax error"),
    ("allx", "undefined reference"),
    ("al", "undefined reference"),
    # 'all' is case-sensitive
    ("ALL", "undefined reference"),
    ("All", "undefined reference"),
    ("aLl", "undefined reference"),
]

# Test cases for empty selection: (input_expression, expected_dump)
# Note: 'none' is internally evaluated as '!*' (not all)
SELECT_NONE_VALID_CASES = [
    ("none", "!*"),
    ("none ", "!*"),
    (" none", "!*"),
    ("  none  ", "!*"),
]

# Test cases for invalid empty selection: (input_expression, expected_error_substring)
SELECT_NONE_INVALID_CASES = [
    ("nonex", "undefined reference"),
    ("non", "undefined reference"),
    # 'none' is case-sensitive
    ("NONE", "undefined reference"),
    ("None", "undefined reference"),
    ("nOnE", "undefined reference"),
]


class TestSelectAllValid:
    """Tests for valid select all expressions."""

    @pytest.mark.parametrize("expression,expected_dump", SELECT_ALL_VALID_CASES)
    def test_valid_select_all(self, selobj, expression, expected_dump):
        """Test valid select all expressions compile successfully."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed to compile: {expression!r}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectAllInvalid:
    """Tests for invalid select all expressions."""

    @pytest.mark.parametrize("expression,error_substring", SELECT_ALL_INVALID_CASES)
    def test_invalid_select_all(self, selobj, expression, error_substring):
        """Test invalid select all expressions fail with appropriate errors."""
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectNoneValid:
    """Tests for valid empty selection (none) expressions."""

    @pytest.mark.parametrize("expression,expected_dump", SELECT_NONE_VALID_CASES)
    def test_valid_select_none(self, selobj, expression, expected_dump):
        """Test valid empty selection expressions compile successfully."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed to compile: {expression!r}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectNoneInvalid:
    """Tests for invalid empty selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", SELECT_NONE_INVALID_CASES)
    def test_invalid_select_none(self, selobj, expression, error_substring):
        """Test invalid empty selection expressions fail with appropriate errors."""
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectAllEquivalence:
    """Tests to verify that '*' and 'all' are equivalent."""

    def test_asterisk_and_all_produce_same_result(self, selobj):
        """Verify that '*' and 'all' produce the same internal representation."""
        selobj.compile("*", 0)
        dump_asterisk = selobj.dumpNodes()

        selobj.compile("all", 0)
        dump_all = selobj.dumpNodes()

        assert dump_asterisk == dump_all == "*"
