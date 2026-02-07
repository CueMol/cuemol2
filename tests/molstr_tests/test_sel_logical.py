"""
Tests for logical operator combinations in selection syntax.

This test file focuses on the interaction and combination of logical operators,
specifically testing:
1. Operator precedence (NOT > AND > OR)
2. Parentheses for precedence control
3. Complex nested expressions

Basic functionality of individual operators (and, or, not) is tested elsewhere.

Operator precedence (highest to lowest):
1. NOT (!)
2. AND (&)
3. OR (|)

dumpNodes normalization rules:
- Operators: `&` and `and` -> `and`, `|` and `or` -> `or`, `not` and `!` -> `!`
- Child nodes always have parentheses: `xxx` -> `(xxx)`
- Example: "name CA & name N" -> "(name CA) and (name N)"
- Example: "not name CA" -> "!(name CA)"

Reference:
- https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
- Grammar: parser_sel.yxx, scanner_sel.lxx
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Operator precedence tests (NOT > AND > OR)
PRECEDENCE_CASES = [
    # NOT has highest precedence
    ("not name CA and name N", "(!(name CA)) and (name N)"),
    ("name CA and not name N", "(name CA) and (!(name N))"),
    ("not name CA or name N", "(!(name CA)) or (name N)"),
    ("name CA or not name N", "(name CA) or (!(name N))"),
    # AND has higher precedence than OR
    ("name CA or name N and name O", "(name CA) or ((name N) and (name O))"),
    ("name CA and name N or name O", "((name CA) and (name N)) or (name O)"),
    (
        "elem C or elem N and elem O or elem S",
        "((elem C) or ((elem N) and (elem O))) or (elem S)",
    ),
    # Complex precedence with all three operators
    ("not name CA and name N or name O", "((!(name CA)) and (name N)) or (name O)"),
    ("name CA or not name N and name O", "(name CA) or ((!(name N)) and (name O))"),
    (
        "not name CA or name N and not name O",
        "(!(name CA)) or ((name N) and (!(name O)))",
    ),
    (
        "not name CA and name N or not name O and elem C",
        "((!(name CA)) and (name N)) or ((!(name O)) and (elem C))",
    ),
    # Multiple NOT operators
    ("not name CA and not name N", "(!(name CA)) and (!(name N))"),
    ("not name CA or not name N", "(!(name CA)) or (!(name N))"),
    (
        "not name CA and not name N or not name O",
        "((!(name CA)) and (!(name N))) or (!(name O))",
    ),
    # Consecutive same operators (left-to-right associativity)
    ("name CA and name N and name O", "((name CA) and (name N)) and (name O)"),
    ("name CA or name N or name O", "((name CA) or (name N)) or (name O)"),
    (
        "name CA and name N and name O and elem C",
        "(((name CA) and (name N)) and (name O)) and (elem C)",
    ),
]

# Parentheses for precedence control
PARENTHESES_CASES = [
    # Override default OR < AND precedence
    ("(name CA or name N) and name O", "((name CA) or (name N)) and (name O)"),
    ("name O and (name CA or name N)", "(name O) and ((name CA) or (name N))"),
    (
        "(elem C or elem N) and (elem O or elem S)",
        "((elem C) or (elem N)) and ((elem O) or (elem S))",
    ),
    # Override default AND precedence with NOT
    ("not (name CA and name N)", "!((name CA) and (name N))"),
    ("not (name CA or name N)", "!((name CA) or (name N))"),
    ("not (not name CA)", "!(!(name CA))"),
    # Nested parentheses
    ("((name CA))", "name CA"),
    ("(((name CA)))", "name CA"),
    ("(name CA and (name N or name O))", "(name CA) and ((name N) or (name O))"),
    ("((name CA or name N) and name O)", "((name CA) or (name N)) and (name O)"),
    (
        "((name CA and name N) or (name O and elem C))",
        "((name CA) and (name N)) or ((name O) and (elem C))",
    ),
    # Complex nesting with NOT
    ("not (name CA and (name N or name O))", "!((name CA) and ((name N) or (name O)))"),
    ("not ((name CA or name N) and name O)", "!(((name CA) or (name N)) and (name O))"),
    ("(not name CA) and (not name N)", "(!(name CA)) and (!(name N))"),
    ("not (not (name CA and name N))", "!(!((name CA) and (name N)))"),
    # Demonstrate precedence change with parentheses
    ("name CA or name N and name O", "(name CA) or ((name N) and (name O))"),
    ("(name CA or name N) and name O", "((name CA) or (name N)) and (name O)"),
]

# Complex combinations
COMPLEX_CASES = [
    # Real-world examples
    (
        "chain A and resi 10:20 and name CA",
        "((chain A) and (resi 10:20)) and (name CA)",
    ),
    (
        "(chain A or chain B) and resi 10:20",
        "((chain A) or (chain B)) and (resi 10:20)",
    ),
    ("not (chain A and resi 10:20)", "!((chain A) and (resi 10:20))"),
    (
        "chain A and (resi 10:20 or resi 30:40)",
        "(chain A) and ((resi 10:20) or (resi 30:40))",
    ),
    # Multiple operators with hierarchical notation
    (
        "A.10:20.CA and elem C or B.30:40.N",
        "((A.10:20.CA) and (elem C)) or (B.30:40.N)",
    ),
    (
        "(A.10:20.CA or B.30:40.N) and elem C",
        "((A.10:20.CA) or (B.30:40.N)) and (elem C)",
    ),
    ("not A.10:20.CA and B.30:40.N", "(!(A.10:20.CA)) and (B.30:40.N)"),
    # Deeply nested expressions
    (
        "((name CA or name N) and (name O or elem C)) or not (chain A and resi 10)",
        "(((name CA) or (name N)) and ((name O) or (elem C))) or (!((chain A) and (resi 10)))",
    ),
    (
        "not ((name CA and name N) or (name O and elem C))",
        "!(((name CA) and (name N)) or ((name O) and (elem C)))",
    ),
    # All operators combined with special selectors
    ("all and not chain A or none", "((*) and (!(chain A))) or (!*)"),
    ("(all or none) and not chain A", "((*) or (!*)) and (!(chain A))"),
    ("not (all and chain A) or not none", "(!((*) and (chain A))) or (!(!*))"),
]

# Invalid cases specific to logical operator combinations
INVALID_CASES = [
    # Missing operands
    ("and", "syntax error"),
    ("or", "syntax error"),
    ("not", "syntax error"),
    ("name CA and", "syntax error"),
    ("and name CA", "syntax error"),
    ("name CA or", "syntax error"),
    ("or name CA", "syntax error"),
    # Consecutive operators without operands
    ("name CA and and name N", "syntax error"),
    ("name CA or or name N", "syntax error"),
    ("and or name CA", "syntax error"),
    ("name CA and or name N", "syntax error"),
    # Mismatched or empty parentheses
    ("(name CA", "syntax error"),
    ("name CA)", "syntax error"),
    ("(name CA))", "syntax error"),
    ("((name CA)", "syntax error"),
    ("()", "syntax error"),
    ("name CA and ()", "syntax error"),
    ("() or name CA", "syntax error"),
    # Invalid NOT usage
    ("not", "syntax error"),
    ("not and name CA", "syntax error"),
    ("not or name CA", "syntax error"),
    ("name CA not name N", "syntax error"),
]

# =============================================================================
# Tests
# =============================================================================


class TestOperatorPrecedence:
    """Tests for operator precedence (NOT > AND > OR)."""

    @pytest.mark.parametrize("expression,expected_dump", PRECEDENCE_CASES)
    def test_precedence(self, selobj, expression, expected_dump):
        """Test that operators follow correct precedence without parentheses."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestParenthesesControl:
    """Tests for parentheses to control operator precedence."""

    @pytest.mark.parametrize("expression,expected_dump", PARENTHESES_CASES)
    def test_parentheses(self, selobj, expression, expected_dump):
        """Test that parentheses correctly override default precedence."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    def test_precedence_difference_with_parentheses(self, selobj):
        """Demonstrate how parentheses change evaluation order."""
        # Without parentheses: AND has higher precedence than OR
        selobj.compile("name CA or name N and name O", 0)
        without_parens = selobj.dumpNodes()

        # With parentheses: force OR to evaluate first
        selobj.compile("(name CA or name N) and name O", 0)
        with_parens = selobj.dumpNodes()

        assert without_parens != with_parens
        assert without_parens == "(name CA) or ((name N) and (name O))"
        assert with_parens == "((name CA) or (name N)) and (name O)"


class TestComplexCombinations:
    """Tests for complex combinations of logical operators."""

    @pytest.mark.parametrize("expression,expected_dump", COMPLEX_CASES)
    def test_complex_cases(self, selobj, expression, expected_dump):
        """Test complex real-world combinations of operators."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    def test_deeply_nested_expression(self, selobj):
        """Test deeply nested logical expressions compile successfully."""
        expression = "not (((name CA or name N) and (name O or elem C)) or (chain A and resi 10))"
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""


class TestLogicalOperatorInvalid:
    """Tests for invalid logical operator combinations."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestOperatorEquivalence:
    """Tests to verify that keyword and symbol operators are equivalent."""

    @pytest.mark.parametrize(
        "base_expr",
        [
            "name CA",
            "elem C",
            "chain A",
            "resi 10:20",
            "A.10:20.CA",
        ],
    )
    def test_and_equivalence(self, selobj, base_expr):
        """Verify that 'and' and '&' are equivalent."""
        expr_keyword = f"{base_expr} and name N"
        expr_symbol = f"{base_expr} & name N"

        selobj.compile(expr_keyword, 0)
        dump_keyword = selobj.dumpNodes()

        selobj.compile(expr_symbol, 0)
        dump_symbol = selobj.dumpNodes()

        assert dump_keyword == dump_symbol

    @pytest.mark.parametrize(
        "base_expr",
        [
            "name CA",
            "elem C",
            "chain A",
            "resi 10:20",
            "A.10:20.CA",
        ],
    )
    def test_or_equivalence(self, selobj, base_expr):
        """Verify that 'or' and '|' are equivalent."""
        expr_keyword = f"{base_expr} or name N"
        expr_symbol = f"{base_expr} | name N"

        selobj.compile(expr_keyword, 0)
        dump_keyword = selobj.dumpNodes()

        selobj.compile(expr_symbol, 0)
        dump_symbol = selobj.dumpNodes()

        assert dump_keyword == dump_symbol

    @pytest.mark.parametrize(
        "base_expr",
        [
            "name CA",
            "elem C",
            "chain A",
            "resi 10:20",
            "A.10:20.CA",
        ],
    )
    def test_not_equivalence(self, selobj, base_expr):
        """Verify that 'not' and '!' are equivalent."""
        expr_keyword = f"not {base_expr}"
        expr_symbol = f"! {base_expr}"

        selobj.compile(expr_keyword, 0)
        dump_keyword = selobj.dumpNodes()

        selobj.compile(expr_symbol, 0)
        dump_symbol = selobj.dumpNodes()

        assert dump_keyword == dump_symbol
