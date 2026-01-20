import pytest

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic single residue number ---
    ("aid 123", "aid 123"),
    ("aid 1", "aid 1"),
    ("aid 0", "aid 0"),
    # --- Negative aiddue numbers ---
    ("aid -5", "aid -5"),
    ("aid -100", "aid -100"),
    # --- Multiple residue numbers (comma-separated) ---
    ("aid 123,456", "aid 123,456"),
    ("aid 123, 456", "aid 123,456"),
    ("aid 1,2,3,4,5", "aid 1:5"),
    ("aid 123, 456, 789", "aid 123,456,789"),
    # --- Residue number ranges ---
    ("aid 123:456", "aid 123:456"),
    ("aid 1:100", "aid 1:100"),
    ("aid -10:-5", "aid -10:-5"),
    ("aid -5:10", "aid -5:10"),
    ("aid 123,456:789", "aid 123,456:789"),
    # --- Insertion codes ignored ---
    ("aid 123A", "aid 123"),
    ("aid 123A:456B", "aid 123:456"),
    ("aid 123A,456:789,800B", "aid 123,456:789,800"),
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing number ---
    ("aid", "syntax error"),
    # --- Keyword case sensitivity ---
    ("AID 123", "undefined reference"),
    ("Aid 123", "undefined reference"),
    # --- Invalid characters (non-numeric) ---
    ("aid ABC", "syntax error"),
    # --- Invalid insertion code format (multiple letters) ---
    ("aid 123AB", "syntax error"),
    # --- Trailing comma ---
    ("aid 123,", "syntax error"),
    # --- Invalid range syntax ---
    ("aid 123:", "syntax error"),
    ("aid :456", "syntax error"),
    ("aid 123::456", "syntax error"),
]


class TestSelectAtomIDValid:
    """Tests for valid atom name selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectAtomIDInvalid:
    """Tests for invalid atom name selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"
