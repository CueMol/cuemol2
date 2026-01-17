"""
Tests for temperature factor (bfac) selection functionality in selection syntax.

- `bfac <comp_op> <number>` : Selects atoms based on temperature factor (B-factor)
  - comp_op: comparison operators (<, >, =)
  - number: integer value (according to documentation, decimals are not allowed)

Syntax details:
- No whitespace is required between keyword, operator, and number
- Whitespace is optional and can appear anywhere
- No shorthand version exists for bfac
- Keyword is case-sensitive (must be lowercase "bfac")

Grammar reference (from parser_sel.yxx):
  | SEL_BFAC sel_compop sel_number
  {
    SelCompiler::setSelState();
    $$ = new SelCompNode(SelCompNode::COMP_BFAC, $2, $3);
  }

  sel_compop : SEL_EQ | SEL_LT | SEL_GT

Scanner reference (from scanner_sel.lxx):
  "bfac"  { return SEL_BFAC; }
  ">"     { return SEL_GT; }
  "<"     { return SEL_LT; }
  "="     { return SEL_EQ; }

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic cases with all operators ---
    ("bfac>50", "bfac > 50.000000"),
    ("bfac>50.1", "bfac > 50.100000"),
    ("bfac<50", "bfac < 50.000000"),
    ("bfac<50.1", "bfac < 50.100000"),
    ("bfac=50", "bfac = 50.000000"),
    ("bfac=50.1", "bfac = 50.100000"),
    # --- Negative values ---
    ("bfac>-10", "bfac > -10.000000"),
    ("bfac>-10.1", "bfac > -10.100000"),
    ("bfac<-5", "bfac < -5.000000"),
    ("bfac<-5.12", "bfac < -5.120000"),
    ("bfac=-1", "bfac = -1.000000"),
    ("bfac=-1.23", "bfac = -1.230000"),
    # --- Scientific notation ---
    ("bfac>1.0e2", "bfac > 100.000000"),
    ("bfac>-1.0e2", "bfac > -100.000000"),
    ("bfac>1.0E2", "bfac > 100.000000"),
    # --- Whitespace variations ---
    ("bfac >50", "bfac > 50.000000"),
    ("bfac> 50", "bfac > 50.000000"),
    ("bfac > 50", "bfac > 50.000000"),
    (" bfac>50", "bfac > 50.000000"),
    ("bfac>50 ", "bfac > 50.000000"),
    ("  bfac  >  50  ", "bfac > 50.000000"),
    # --- All operators with whitespace ---
    ("bfac < 30", "bfac < 30.000000"),
    ("bfac = 40", "bfac = 40.000000"),
    # Combination with other operators
    # --- AND combinations ---
    ("bfac>50 and name CA", "(bfac > 50.000000) and (name CA)"),
    ("bfac<30 & bfac>10", "(bfac < 30.000000) and (bfac > 10.000000)"),
    ("chain A and bfac>40", "(chain A) and (bfac > 40.000000)"),
    # --- OR combinations ---
    ("bfac>100 or bfac<10", "(bfac > 100.000000) or (bfac < 10.000000)"),
    ("bfac=50 | name CA", "(bfac = 50.000000) or (name CA)"),
    # --- NOT combinations ---
    ("not bfac>50", "!(bfac > 50.000000)"),
    ("!bfac<30", "!(bfac < 30.000000)"),
]


# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing components ---
    ("bfac", "syntax error"),
    ("bfac>", "syntax error"),
    ("bfac >", "syntax error"),
    ("bfac 50", "syntax error"),  # missing operator
    (">50", "syntax error"),  # missing keyword
    # --- Invalid operators ---
    ("bfac>=50", "syntax error"),  # >= not supported
    ("bfac<=50", "syntax error"),  # <= not supported
    ("bfac!=50", "syntax error"),  # != not supported
    ("bfac==50", "syntax error"),  # == not supported (use single =)
    # --- Keyword case sensitivity ---
    ("BFAC>50", "undefined reference"),  # uppercase not allowed
    ("Bfac>50", "undefined reference"),  # mixed case not allowed
    ("BFac>50", "undefined reference"),
    ("bFac>50", "undefined reference"),
    # --- Invalid characters ---
    ("bfac>1e2", "syntax error"),
    ("bfac>abc", "syntax error"),
    ("bfac>50a", "syntax error"),
    ("bfac>'50'", "syntax error"),  # quoted number not allowed
    ('bfac>"50"', "syntax error"),  # quoted number not allowed
]

# =============================================================================
# Tests
# =============================================================================


class TestSelectBfacValid:
    """Tests for valid temperature factor (bfac) selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectBfacInvalid:
    """Tests for invalid temperature factor (bfac) selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r} {selobj.dumpNodes()=}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"
