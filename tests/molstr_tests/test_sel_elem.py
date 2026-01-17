"""
Tests for element selection functionality in selection syntax.
- `elem [name_list]` : Selects atoms with the specified element names
- `e; [name_list]`   : Shorthand for elem (space after semicolon is optional)

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# Test cases: (input_expression, expected_dump)
# Note: yacc parses comma-separated lists from right to left, so order is reversed
SELECT_ELEM_VALID_CASES = [
    # 'elem' keyword with single element
    ("elem C", "elem C"),
    ("elem N", "elem N"),
    ("elem O", "elem O"),
    # 'elem' keyword with multiple elements (comma-separated, order reversed)
    ("elem C,N", "elem N,C"),
    ("elem C,N,O", "elem O,N,C"),
    # 'elem' keyword with whitespace variations
    ("elem  C", "elem C"),
    (" elem C", "elem C"),
    ("elem C ", "elem C"),
    ("  elem  C  ", "elem C"),
    # Comma-separated list with spaces (order reversed)
    ("elem C, N", "elem N,C"),
    ("elem C , N", "elem N,C"),
    ("elem C,  N,  O", "elem O,N,C"),
    # 'e;' shorthand with single element
    ("e; C", "elem C"),
    ("e;C", "elem C"),
    # 'e;' shorthand with multiple elements (order reversed)
    ("e; C,N,O", "elem O,N,C"),
    ("e;C,N,O", "elem O,N,C"),
    # 'e;' shorthand with whitespace variations
    ("e;  C", "elem C"),
    (" e; C", "elem C"),
    ("e; C ", "elem C"),
]

# Test cases: (input_expression, expected_error_substring)
SELECT_ELEM_INVALID_CASES = [
    # Missing element name
    ("elem", "syntax error"),
    ("e;", "syntax error"),
    # Invalid element syntax
    ("elem ,C", "syntax error"),
    ("elem C,", "syntax error"),
    # 'elem' is case-sensitive
    ("ELEM C", "undefined reference"),
    ("Elem C", "undefined reference"),
    # 'e;' shorthand case sensitivity (if applicable)
    ("E; C", "undefined reference"),
]


class TestSelectElementValid:
    """Tests for valid element selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", SELECT_ELEM_VALID_CASES)
    def test_valid_select_element(self, selobj, expression, expected_dump):
        """Test valid element selection expressions compile successfully."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed to compile: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectElementInvalid:
    """Tests for invalid element selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", SELECT_ELEM_INVALID_CASES)
    def test_invalid_select_element(self, selobj, expression, error_substring):
        """Test invalid element selection expressions fail with appropriate errors."""
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectElementEquivalence:
    """Tests to verify that 'elem' and 'e;' are equivalent."""

    @pytest.mark.parametrize("element", ["C", "N", "O", "C,N,O"])
    def test_elem_and_shorthand_equivalence(self, selobj, element):
        """Verify that 'elem X' and 'e; X' produce the same result.

        Note: Both forms undergo the same yacc parsing, so order reversal
        applies equally to both.
        """
        selobj.compile(f"elem {element}", 0)
        dump_elem = selobj.dumpNodes()

        selobj.compile(f"e; {element}", 0)
        dump_shorthand = selobj.dumpNodes()

        assert dump_elem == dump_shorthand
