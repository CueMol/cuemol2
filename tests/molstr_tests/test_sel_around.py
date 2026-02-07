"""
Tests for around operator selection functionality in selection syntax.

The around operator selects atoms within a specified distance from a selection:
- `<expr> around <distance>` : Selects atoms within <distance> Angstroms from <expr>
  - Note: <expr> itself is NOT included in the result
- `<expr> around [<molname>] <distance>` : Cross-molecule around selection
  - Selects atoms from molecule <molname> within <distance> from <expr>
- `a;` : Shorthand for around (space after semicolon is optional)

Distance specification:
- Can be integer (e.g., 3, 5) or floating-point (e.g., 3.5, 2.0)
- Negative values are accepted by parser but may have undefined behavior
- After the around/a; keyword, scanner switches to SEL_NUM_STAT mode
  to parse the number, then returns to INITIAL state

Molecule name specification (for cross-molecule selection):
- Enclosed in square brackets: [molname]
- Can be bare string, single-quoted, or double-quoted
- Follows the same rules as sel_molname in grammar

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

# Valid cases: (input_expression, expected_dump)
VALID_CASES = [
    # --- Basic integer distance ---
    ("name CA around 3", "(name CA) around 3.000000"),
    ("name CA around 5", "(name CA) around 5.000000"),
    ("name N around 10", "(name N) around 10.000000"),
    # --- Floating-point distance ---
    ("name CA around 3.5", "(name CA) around 3.500000"),
    ("name CA around 2.0", "(name CA) around 2.000000"),
    ("name CA around 0.5", "(name CA) around 0.500000"),
    ("name CA around 1.23", "(name CA) around 1.230000"),
    # --- Scientific notation ---
    ("name CA around 1.0e1", "(name CA) around 10.000000"),
    ("name CA around 1.5e1", "(name CA) around 15.000000"),
    ("name CA around 2.5e-1", "(name CA) around 0.250000"),
    # --- Whitespace variations ---
    ("name CA around  3", "(name CA) around 3.000000"),
    ("name CA  around 3", "(name CA) around 3.000000"),
    ("name CA around 3 ", "(name CA) around 3.000000"),
    ("name CA around  3.5", "(name CA) around 3.500000"),
    # --- Shorthand 'a;' ---
    ("name CA a; 3", "(name CA) around 3.000000"),
    ("name CA a;3", "(name CA) around 3.000000"),
    ("name CA a; 3.5", "(name CA) around 3.500000"),
    ("name CA a;3.5", "(name CA) around 3.500000"),
    # --- Complex selection expressions ---
    ("chain A around 5", "(chain A) around 5.000000"),
    ("resi 10:20 around 3.5", "(resi 10:20) around 3.500000"),
    ("name CA,N,O around 4", "(name O,N,CA) around 4.000000"),
    ("chain A & name CA around 3", "((chain A) and (name CA)) around 3.000000"),
    # --- Parenthesized expressions ---
    ("(name CA) around 3", "(name CA) around 3.000000"),
    ("(chain A) around 5.5", "(chain A) around 5.500000"),
    # --- Combined with other operators ---
    ("name CA around 3 & chain A", "((name CA) around 3.000000) and (chain A)"),
    ("name CA around 3 | chain B", "((name CA) around 3.000000) or (chain B)"),
    ("byres name CA around 3", "byres ((name CA) around 3.000000)"),
    # --- Negative distances (parsed but behavior undefined) ---
    ("name CA around -3", "(name CA) around -3.000000"),
    ("name CA around -3.5", "(name CA) around -3.500000"),
    # --- Zero distance ---
    ("name CA around 0", "(name CA) around 0.000000"),
    ("name CA around 0.0", "(name CA) around 0.000000"),
]

# Cross-molecule selection cases
CROSS_MOLECULE_CASES = [
    # --- Bare string molecule name ---
    ("name CA around 3 [mol1]", '(name CA) around 3.000000 ["mol1"]'),
    # ('name CA around 5 [my.pdb]', '(name CA) around 5.000000 ["my.pdb"]'),
    # --- Single-quoted molecule name ---
    ("name CA around 3 ['mol1']", '(name CA) around 3.000000 ["mol1"]'),
    ("name CA around 3.5 ['my pdb']", '(name CA) around 3.500000 ["my pdb"]'),
    # --- Double-quoted molecule name ---
    ('name CA around 3 ["mol1"]', '(name CA) around 3.000000 ["mol1"]'),
    ('name CA around 3.5 [" my pdb "]', '(name CA) around 3.500000 [" my pdb "]'),
    ('name CA around 3 ["1CRN@pdb"]', '(name CA) around 3.000000 ["1CRN@pdb"]'),
    # --- Whitespace variations ---
    ("name CA around  3 [mol1]", '(name CA) around 3.000000 ["mol1"]'),
    ("name CA around 3  [mol1]", '(name CA) around 3.000000 ["mol1"]'),
    ("name CA around 3 [ mol1 ]", '(name CA) around 3.000000 ["mol1"]'),
    # --- With shorthand ---
    ("name CA a; 3 [mol1]", '(name CA) around 3.000000 ["mol1"]'),
    ("name CA a;3 [mol1]", '(name CA) around 3.000000 ["mol1"]'),
]

# Invalid cases: (input_expression, expected_error_substring)
INVALID_CASES = [
    # --- Missing distance ---
    ("name CA around", "syntax error"),
    ("name CA a;", "syntax error"),
    # --- Missing selection expression ---
    ("around 3", "syntax error"),
    ("a; 3", "syntax error"),
    # --- Invalid distance format ---
    ("name CA around abc", "syntax error"),
    ("name CA around 3.5.5", "syntax error"),
    ("name CA around ..", "syntax error"),
    ("name CA around 1e1", "syntax error"),
    # --- Malformed cross-molecule syntax ---
    ("name CA around [mol1", "syntax error"),  # unclosed bracket
    ("name CA around 3 mol1]", "syntax error"),  # missing open bracket
    ("name CA around 3 []", "syntax error"),  # empty bracket
    ("name CA around 3 [mol1] [mol2]", "syntax error"),  # double molecule name
    ("name CA around 3 [mol.pdb]", "syntax error"),  # dot not allowed
    ("name CA around 3 [mol pdb]", "syntax error"),  # space not allowed
    # --- Missing distance in cross-molecule ---
    ("name CA around [mol1]", "syntax error"),
    # --- Keyword case sensitivity ---
    ("name CA AROUND 3", "syntax error"),
    ("name CA Around 3", "syntax error"),
    ("name CA A; 3", "syntax error"),  # uppercase shorthand
    # --- Invalid number following around ---
    ("name CA around +", "syntax error"),
    ("name CA around -", "syntax error"),
    ("name CA around *", "syntax error"),

    ("name CA expand 3 [mol1]", 'syntax error'),
]

# Operator precedence and associativity cases
PRECEDENCE_CASES = [
    # around has higher precedence than AND/OR
    ("name CA around 3 & chain A", "((name CA) around 3.000000) and (chain A)"),
    ("name CA around 3 | chain B", "((name CA) around 3.000000) or (chain B)"),
    # around has lower precedence than BYRES operators
    ("byres name CA around 3", "byres ((name CA) around 3.000000)"),
    ("bysidech name CA around 3", "bysidech ((name CA) around 3.000000)"),
    # Multiple around operators (right-to-left associativity)
    ("name CA around 3 around 2", "((name CA) around 3.000000) around 2.000000"),
    (
        "name CA around 3 [mol1] around 2 [mol2]",
        '((name CA) around 3.000000 ["mol1"]) around 2.000000 ["mol2"]',
    ),
]

# =============================================================================
# Tests
# =============================================================================


class TestSelectAroundValid:
    """Tests for valid around operator selection expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    @pytest.mark.parametrize("expression,expected_dump", CROSS_MOLECULE_CASES)
    def test_cross_molecule_cases(self, selobj, expression, expected_dump):
        """Test cross-molecule around selection syntax."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump

    @pytest.mark.parametrize("expression,expected_dump", PRECEDENCE_CASES)
    def test_precedence_cases(self, selobj, expression, expected_dump):
        """Test operator precedence and associativity with around."""
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestSelectAroundInvalid:
    """Tests for invalid around operator selection expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestSelectAroundEquivalence:
    """Tests to verify that 'around' and 'a;' are equivalent."""

    @pytest.mark.parametrize("distance", ["3", "3.5", "-3", "1.0e1"])
    def test_around_and_shorthand_equivalence(self, selobj, distance):
        """Verify 'around' and 'a;' produce identical results."""
        selobj.compile(f"name CA around {distance}", 0)
        dump_around = selobj.dumpNodes()

        selobj.compile(f"name CA a; {distance}", 0)
        dump_shorthand = selobj.dumpNodes()

        assert dump_around == dump_shorthand

    @pytest.mark.parametrize("distance", ["3", "5.5"])
    def test_cross_molecule_shorthand_equivalence(self, selobj, distance):
        """Verify 'around' and 'a;' are equivalent for cross-molecule selection."""
        selobj.compile(f"name CA around [mol1] {distance}", 0)
        dump_around = selobj.dumpNodes()

        selobj.compile(f"name CA a; [mol1] {distance}", 0)
        dump_shorthand = selobj.dumpNodes()

        assert dump_around == dump_shorthand


class TestSelectDistanceOperatorCombinations:
    """Tests for distance-based operators (around, expand, neighbor, extend) combined with various selection types."""

    @pytest.mark.parametrize("distance_op", ["around", "expand", "neighbor", "extend"])
    @pytest.mark.parametrize(
        "base_expr,distance",
        [
            ("name CA", "3"),
            ("chain A", "5"),
            ("resi 10:20", "3.5"),
            ("elem C", "4"),
            ("all", "2"),
            ("*.5:10.*", "3"),
        ],
    )
    def test_distance_op_with_various_selections(
        self, selobj, distance_op, base_expr, distance
    ):
        """Test distance operators work with various selection expressions."""
        expression = f"{base_expr} {distance_op} {distance}"
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert distance_op in selobj.dumpNodes()

    @pytest.mark.parametrize("distance_op", ["around", "expand", "neighbor", "extend"])
    @pytest.mark.parametrize("unary_op", ["byres", "bysidech", "bymainch"])
    def test_distance_op_with_unary_operators(self, selobj, distance_op, unary_op):
        """Test distance operators with various unary operators."""
        expression = f"{unary_op} name CA {distance_op} 3"
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        dumpstr = selobj.dumpNodes()
        print(f"dump: {dumpstr}")
        assert dumpstr == f"{unary_op} ((name CA) {distance_op} 3.000000)"
        assert unary_op in dumpstr
        assert distance_op in dumpstr
