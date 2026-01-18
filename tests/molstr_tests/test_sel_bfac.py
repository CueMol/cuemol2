"""
Tests for comparison-based selection functionality (bfac and occ) in selection syntax.

Both bfac (temperature factor) and occ (occupancy) share the same grammar:
- `<keyword> <comp_op> <number>` : Selects atoms based on property value
  - keyword: "bfac" or "occ"
  - comp_op: comparison operators (<, >, =)
  - number: integer or floating point value (including scientific notation with decimal point)

Syntax details:
- No whitespace is required between keyword, operator, and number
- Whitespace is optional and can appear anywhere
- No shorthand version exists for these keywords
- Keywords are case-sensitive (must be lowercase)
- Floating point numbers are supported (e.g., 50.1, 1.0e2)
- Scientific notation without decimal point (e.g., 1e2) is NOT supported

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Valid cases: (operator, value)
# Template will be filled with keyword (bfac or occ)
VALID_CASES = [
    # --- Basic cases with all operators ---
    (">", "50"),
    ("<", "50"),
    ("=", "50"),
    # --- Different integer values ---
    (">", "0"),
    (">", "1"),
    (">", "100"),
    (">", "999"),
    # --- Negative values ---
    (">", "-10"),
    ("<", "-5"),
    ("=", "-1"),
    # --- Floating point values ---
    (">", "50.1"),
    ("<", "30.5"),
    # ("=", "1.0"),
    (">", "0.5"),
    ("<", ".5"),
    # ("=", "99.999"),
    # --- Negative floating point values ---
    (">", "-10.5"),
    ("<", "-5.25"),
    # --- Scientific notation (with decimal point) ---
    (">", "1.0e2"),
    ("<", "5.0e-1"),
    # ("=", "1.0E2"),
    (">", "2.5e1"),
]

# Whitespace variations: (input_expression, operator, value)
# {kw} will be replaced with keyword (bfac or occ)
WHITESPACE_CASES = [
    ("{kw} >50", ">", "50"),
    ("{kw}> 50", ">", "50"),
    ("{kw} > 50", ">", "50"),
    (" {kw}>50", ">", "50"),
    ("{kw}>50 ", ">", "50"),
    ("  {kw}  >  50  ", ">", "50"),
    ("{kw} < 30", "<", "30"),
    ("{kw} = 40", "=", "40"),
]

# Invalid cases: (expression_template, expected_error_substring)
# {kw} will be replaced with keyword (bfac or occ)
INVALID_CASES = [
    # --- Missing components ---
    ("{kw}", "syntax error"),
    ("{kw}>", "syntax error"),
    ("{kw} >", "syntax error"),
    ("{kw} 50", "syntax error"),  # missing operator
    # --- Invalid operators ---
    ("{kw}>=50", "syntax error"),  # >= not supported
    ("{kw}<=50", "syntax error"),  # <= not supported
    ("{kw}!=50", "syntax error"),  # != not supported
    ("{kw}==50", "syntax error"),  # == not supported (use single =)
    # --- Scientific notation without decimal point (not supported) ---
    ("{kw}>1e2", "syntax error"),
    ("{kw}>1E2", "syntax error"),
    ("{kw}<2e-1", "syntax error"),
    ("{kw}=5E3", "syntax error"),
    # --- Invalid characters ---
    ("{kw}>abc", "syntax error"),
    ("{kw}>50a", "syntax error"),
    ("{kw}>'50'", "syntax error"),  # quoted number not allowed
    ('{kw}>"50"', "syntax error"),  # quoted number not allowed
]

# Case sensitivity test data
CASE_SENSITIVITY_CASES = [
    ("BFAC>50", "bfac"),
    ("Bfac>50", "bfac"),
    ("BFac>50", "bfac"),
    ("bFac>50", "bfac"),
    ("OCC>50", "occ"),
    ("Occ>50", "occ"),
    ("OCc>50", "occ"),
    ("oCc>50", "occ"),
]

# Combination with other operators
# (input_template, expected_template)
# {kw} will be replaced with keyword
COMBINATION_CASES = [
    # --- AND combinations ---
    ("{kw}>50 and name CA", "({kw} > 50.000000) and (name CA)"),
    ("{kw}<30 & {kw}>10", "({kw} < 30.000000) and ({kw} > 10.000000)"),
    ("chain A and {kw}>40", "(chain A) and ({kw} > 40.000000)"),
    # --- OR combinations ---
    ("{kw}>100 or {kw}<10", "({kw} > 100.000000) or ({kw} < 10.000000)"),
    ("{kw}=50 | name CA", "({kw} = 50.000000) or (name CA)"),
    # --- NOT combinations ---
    ("not {kw}>50", "!({kw} > 50.000000)"),
    ("!{kw}<30", "!({kw} < 30.000000)"),
    # --- Complex combinations ---
    (
        "({kw}>50 and chain A) or name CA",
        "(({kw} > 50.000000) and (chain A)) or (name CA)",
    ),
    (
        "chain A and ({kw}>30 and {kw}<70)",
        "(chain A) and (({kw} > 30.000000) and ({kw} < 70.000000))",
    ),
    # --- With floating point values ---
    ("{kw}>50.5 and name CA", "({kw} > 50.500000) and (name CA)"),
    ("{kw}<1.0e2 | {kw}<0.5", "({kw} < 100.000000) or ({kw} < 0.500000)"),
]

# =============================================================================
# Helper functions
# =============================================================================


def format_value(value):
    """Format a numeric value like C's printf %f (6 decimal places)."""
    return "%f" % float(value)


# =============================================================================
# Tests
# =============================================================================


@pytest.mark.parametrize("keyword", ["bfac", "occ"])
class TestSelectComparisonValid:
    """Tests for valid comparison-based selection expressions (bfac and occ)."""

    @pytest.mark.parametrize("operator,value", VALID_CASES)
    def test_basic_valid_cases(self, selobj, keyword, operator, value):
        """Test basic valid expressions with different operators and values."""
        expression = f"{keyword}{operator}{value}"
        expected_dump = f"{keyword} {operator} {format_value(value)}"

        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    @pytest.mark.parametrize("expression_template,operator,value", WHITESPACE_CASES)
    def test_whitespace_variations(
        self, selobj, keyword, expression_template, operator, value
    ):
        """Test that whitespace is handled correctly."""
        expression = expression_template.format(kw=keyword)
        expected_dump = f"{keyword} {operator} {format_value(value)}"

        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    @pytest.mark.parametrize("expression_template,expected_template", COMBINATION_CASES)
    def test_combination_with_operators(
        self, selobj, keyword, expression_template, expected_template
    ):
        """Test combinations with other selection operators."""
        expression = expression_template.format(kw=keyword)
        expected_dump = expected_template.format(kw=keyword)

        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


@pytest.mark.parametrize("keyword", ["bfac", "occ"])
class TestSelectComparisonInvalid:
    """Tests for invalid comparison-based selection expressions (bfac and occ)."""

    @pytest.mark.parametrize("expression_template,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, keyword, expression_template, error_substring):
        """Test that invalid expressions are properly rejected."""
        expression = expression_template.format(kw=keyword)

        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectComparisonCaseSensitivity:
    """Tests for case sensitivity of comparison keywords."""

    @pytest.mark.parametrize("expression,keyword", CASE_SENSITIVITY_CASES)
    def test_keyword_case_sensitivity(self, selobj, expression, keyword):
        """Test that keywords must be lowercase."""
        result = selobj.compile(expression, 0)
        assert not result, (
            f"Should have failed: {expression!r} (keyword must be lowercase)"
        )
        assert "undefined reference" in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectComparisonOperatorPrecedence:
    """Tests for operator precedence with comparison selections."""

    @pytest.mark.parametrize("keyword", ["bfac", "occ"])
    def test_and_has_higher_precedence_than_or(self, selobj, keyword):
        """Test that AND has higher precedence than OR."""
        expr = f"name CA and {keyword}>50 or name N"
        dump_exp = f"((name CA) and ({keyword} > {format_value('50')})) or (name N)"
        result = selobj.compile(expr, 0)
        assert result
        dump = selobj.dumpNodes()
        assert dump == dump_exp
        # assert f"{keyword} > {format_value('50')}" in dump
        # assert "&" in dump or "and" in dump.lower()
        # assert "|" in dump or "or" in dump.lower()

    @pytest.mark.parametrize("keyword", ["bfac", "occ"])
    def test_not_operator(self, selobj, keyword):
        """Test NOT operator with comparison selections."""
        result = selobj.compile(f"not {keyword}>50", 0)
        assert result
        assert selobj.dumpNodes() == f"!({keyword} > {format_value('50')})"

    @pytest.mark.parametrize("keyword", ["bfac", "occ"])
    def test_parentheses_override_precedence(self, selobj, keyword):
        """Test that parentheses can override default precedence."""
        result = selobj.compile(f"(name CA or name N) and {keyword}>50", 0)
        assert result
        dump = selobj.dumpNodes()
        print(f"{dump=}")
        dump_exp = f"((name CA) or (name N)) and ({keyword} > {format_value('50')})"
        assert dump == dump_exp
        # assert f"" in dump
