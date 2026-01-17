"""
Tests for hierarchical notation in selection syntax.

Format: chain_names.residue_ranges.atom_names
Equivalent to: chain "chain_names" and resid "residue_ranges" and name "atom_names"
Example: A.1:100.CA,CB (Chain A, residues 1-100, atoms CA and CB)

Reference: https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
"""

import pytest

# =============================================================================
# Test data
# =============================================================================

VALID_CASES = [
    # Basic patterns
    ("A.1.CA", "A.1.CA"),
    ("B.10.N", "B.10.N"),
    ("A.1:10.CA", "A.1:10.CA"),
    ("A.1,5,10.CA", "A.1,5,10.CA"),
    ("A.1.CA,N,O", "A.1.O,N,CA"),
    # Wildcards
    ("*.1.CA", "*.1.CA"),
    ("A.*.CA", "A.*.CA"),
    ("A.1.*", "A.1.*"),
    ("*.*.CA", "*.*.CA"),
    ("*.5,6,7.*", "*.5,6,7.*"),
    ("*.*.*", "*.*.*"),
    # Multiple values
    ("A,B.1.CA", "B,A.1.CA"),
    ("A,B,C.1:10.CA", "C,B,A.1:10.CA"),
    ("A,B.1,5,10:20.CA,CB,N", "B,A.1,5,10:20.N,CB,CA"),
    # Quoted strings
    ('"A".1.CA', '"A".1.CA'),
    ("'B'.10.N", "'B'.10.N"),
    ('"Chain A".1.CA', '"Chain A".1.CA'),
    ('A.1."C.A"', 'A.1."C.A"'),
    ('"A","B".1."CA","N"', '"B","A".1."N","CA"'),
    # Regex
    ("A.1./^C/", "A.1./^C/"),
    ("/^A/.1.CA", "/^A/.1.CA"),
    ("A.1./CA|N/", "A.1./CA|N/"),
    ("A,/^B/.1.CA,/^N/", "/^B/,A.1./^N/,CA"),
    # Insertion codes
    ("A.10A.CA", "A.10A.CA"),
    ("A.10A,10B.CA", "A.10A:10B.CA"),
    # Special cases
    ("null.1.CA", "(empty).1.CA"),  # null chain
    ("*.1.null", "*.1.(empty)"),  # null as atom name
    ("A.1.123", "A.1.123"),  # integer as atom name
    ("123.1.CA", "123.1.CA"),  # integer as chain name
    ("A:.1.CA", "A:.1.CA"),  # colon in names
    ("A.1.CA:CB", "A.1.CA:CB"),
    ("A.1.C1'", "A.1.C1'"),  # nucleic acid notation
    ("A.1.O5*", "A.1.O5*"),
    # Whitespace
    ("A . 1 . CA", "A.1.CA"),
    ("A.1:10 .CA", "A.1:10.CA"),
]

INVALID_CASES = [
    # Missing components
    ("A.1", "syntax error"),
    ("A.", "syntax error"),
    (".1", "syntax error"),
    (".", "syntax error"),
    ("..", "syntax error"),
    # Malformed
    ("A..1.CA", "syntax error"),
    (".A.1.CA", "syntax error"),
    ("A.1.CA.", "syntax error"),
    ("A.1.5.CA", "syntax error"),
    # Unclosed quotes/regex
    ('"A.1.CA', "syntax error"),
    ("A.1.'CA", "syntax error"),
    ("/^A.1.CA", "syntax error"),
    # Invalid tokens
    ("A-.1.CA", "undefined reference"),
    ("A.1@5.CA", "syntax error"),
    # Too many components
    ("A.1.CA.extra", "syntax error"),
    # Invalid syntax
    ("A.1:10:20.CA", "syntax error"),
    ("A.1,,5.CA", "syntax error"),
    ("A.1.CA,", "syntax error"),
]

# =============================================================================
# Tests
# =============================================================================


class TestHierarchicalNotationValid:
    """Tests for valid hierarchical notation expressions."""

    @pytest.mark.parametrize("expression,expected_dump", VALID_CASES)
    def test_valid_cases(self, selobj, expression, expected_dump):
        print(f"testing: {expression!r}")
        result = selobj.compile(expression, 0)
        assert result, f"Failed: {expression!r}, error: {selobj.error_msg}"
        assert selobj.error_msg == ""
        assert selobj.dumpNodes() == expected_dump


class TestHierarchicalNotationInvalid:
    """Tests for invalid hierarchical notation expressions."""

    @pytest.mark.parametrize("expression,error_substring", INVALID_CASES)
    def test_invalid_cases(self, selobj, expression, error_substring):
        result = selobj.compile(expression, 0)
        assert not result, f"Should have failed: {expression!r}"
        assert error_substring in selobj.error_msg.lower()
        assert selobj.dumpNodes() == "(null)"


class TestHierarchicalNotationEquivalence:
    """Tests verifying hierarchical notation equivalence to long form."""

    @pytest.mark.parametrize(
        "hierar,long_form",
        [
            ("A.1.CA", "chain A and resid 1 and name CA"),
            ("A.1:10.CA", "chain A and resid 1:10 and name CA"),
            ("A,B.1,5.CA,N", "chain A,B and resid 1,5 and name CA,N"),
            ("*.1.CA", "resid 1 and name CA"),
            ("A.*.CA", "chain A and name CA"),
            ("A.1.*", "chain A and resid 1"),
        ],
    )
    def test_equivalence(self, selobj, hierar, long_form):
        """Hierarchical notation should be semantically equivalent to long form."""
        selobj.compile(hierar, 0)
        dump_hierar = selobj.dumpNodes()

        selobj.compile(long_form, 0)
        dump_long = selobj.dumpNodes()

        assert dump_hierar is not None
        assert dump_long is not None
