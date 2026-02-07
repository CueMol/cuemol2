import pytest

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic cases ---
    ("resn ALA", "resn ALA"),
    ("resn ALA,VAL", "resn VAL,ALA"),
    ("resn ALA, VAL", "resn VAL,ALA"),
    # Shorthand 'r;'
    ("r;ALA", "resn ALA"),
    ("r; ALA", "resn ALA"),
    # --- Basic single residue number ---
    ("resi 123", "resi 123"),
    ("resi 1", "resi 1"),
    ("resi 0", "resi 0"),
    # --- Negative residue numbers ---
    ("resi -5", "resi -5"),
    ("resi -100", "resi -100"),
    # --- Multiple residue numbers (comma-separated) ---
    ("resi 123,456", "resi 123,456"),
    ("resi 123, 456", "resi 123,456"),
    ("resi 1,2,3,4,5", "resi 1,2,3,4,5"),
    ("resi 123, 456, 789", "resi 123,456,789"),
    # --- Residue number ranges ---
    ("resi 123:456", "resi 123:456"),
    ("resi 1:100", "resi 1:100"),
    ("resi -10:-5", "resi -10:-5"),
    ("resi -5:10", "resi -5:10"),
    # --- Insertion codes (PDB format) ---
    ("resi 123A", "resi 123A"),
    ("resi 45B", "resi 45B"),
    ("resi -10A", "resi -10A"),
    ("resi 10A,10B", "resi 10A:10B"),
    ("resi 10A,10C", "resi 10A,10C"),
    ("resi 10A,10B,10C", "resi 10A:10C"),
    ("resi 10A,11A", "resi 10A,11A"),
    ("resi 10,10A", "resi 10,10A"),
    ("resi 10,10A,11", "resi 10,10A,11"),
    # --- Ranges with insertion codes ---
    ("resi 123A:456", "resi 123A:456"),
    ("resi 123:456B", "resi 123:456B"),
    ("resi 123A:456B", "resi 123A:456B"),
    ("resi 10A:10Z", "resi 10A:10Z"),
    ("resi 10:10B", "resi 10:10B"),
    ("resi 10A:20", "resi 10A:20"),
    ("resi 10A:20A", "resi 10A:20A"),
    # --- Mixed combinations ---
    ("resi 123,456:789", "resi 123,456:789"),
    ("resi 123A,456", "resi 123A,456"),
    ("resi 123,456B:789", "resi 123,456B:789"),
    ("resi 123A,456:789,800B", "resi 123A,456:789,800B"),
    # --- Shorthand 'i;' ---
    ("i;123", "resi 123"),
    ("i; 123", "resi 123"),
    ("i;123,456", "resi 123,456"),
    ("i; 123:456", "resi 123:456"),
    ("i;123A", "resi 123A"),
    ("i;123A:456B", "resi 123A:456B"),
    # --- Alternative keyword 'resid' ---
    ("resid 123", "resi 123"),
    ("resid 123:456", "resi 123:456"),
    ("resid 123A,456", "resi 123A,456"),
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing or malformed ---
    ("resn", "syntax error"),
    ("r;", "syntax error"),
    ("Resn ALA", "undefined reference"),
    ("R; ALA", "undefined reference"),
    # --- Missing residue number ---
    ("resi", "syntax error"),
    ("i;", "syntax error"),
    ("resid", "syntax error"),
    # --- Keyword case sensitivity ---
    ("Resi 123", "undefined reference"),
    ("RESI 123", "undefined reference"),
    ("I; 123", "undefined reference"),
    ("Resid 123", "undefined reference"),
    # --- Invalid characters (non-numeric) ---
    ("resi ABC", "syntax error"),
    ("resi XYZ", "syntax error"),
    # --- Invalid insertion code format (multiple letters) ---
    ("resi 123AB", "syntax error"),
    # --- Trailing comma ---
    ("resi 123,", "syntax error"),
    # --- Invalid range syntax ---
    ("resi 123:", "syntax error"),
    ("resi :456", "syntax error"),
    ("resi 123::456", "syntax error"),
]


class TestSelectNameValid:
    """Tests for valid atom name selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectNameInvalid:
    """Tests for invalid atom name selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"
