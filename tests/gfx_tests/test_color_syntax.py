"""
Tests for color definition syntax in CueMol.
Reference: src/gfx/color_parser.yxx, src/gfx/color_scanner.lxx
"""

import cuemol
import pytest


# Module-level fixtures
stylem = None
scene = None


def setup_module():
    """Initialize services once for all tests."""
    global stylem, scene
    stylem = cuemol.getService("StyleManager")
    scene = cuemol.createScene()


def compile_color(color_str):
    """Compile color and return (color, error)."""
    try:
        color = stylem.compileColor(color_str, scene.uid)
        return color, None if color else "error: compilation failed"
    except Exception as e:
        return None, str(e).lower()


# =============================================================================
# Test Cases: (color_string, should_succeed, error_substring_if_fail)
# =============================================================================

NAMED_COLORS = [
    ("red", True, None),
    ("color_1", True, None),  # Underscore and number
    (" red", True, None),  # Whitespace
    ("color space", False, "error"),  # Invalid space
    ("red blue", False, "error"),  # Multiple tokens
]

HTML_COLORS = [
    ("#fff", True, None),
    ("#ffffff", True, None),
    ("#AbC", True, None),  # Case variation
    ("#ggg", False, "error"),  # Invalid hex
]

RGB_COLORS = [
    ("rgb(255, 0, 0)", True, None),
    ("rgb(1.0, 0.5, 0.0)", True, None),  # Float
    ("RGB(128, 128, 128)", True, None),  # Uppercase
    ("rgba(255, 0, 0, 0.5)", True, None),
    ("rgb(255, 0)", False, "error"),  # Wrong arg count
    ("rgb(255; 0; 0)", False, "error"),  # Wrong separator
]

HSB_COLORS = [
    ("hsb(0.0, 1.0, 1.0)", True, None),
    ("HSB(120.0, 0.5, 0.5)", True, None),  # Uppercase
    ("hsba(240.0, 1.0, 1.0, 0.5)", True, None),
    ("hsb(0.0, 1.0)", False, "error"),  # Wrong arg count
]

MOLCOL_COLORS = [
    ("$molcol", True, None),
    ("$mol col", False, "error"),  # Space
]

MODIFIERS = [
    ("red{alpha: 0.5}", True, None),
    ("rgb(255, 0, 0){alpha: 0.5; brightness: 1.2}", True, None),
    ("red{alpha: 0.5", False, "error"),  # Missing brace
]

EDGE_CASES = [
    ("", False, "compilation failed"),
    ("   ", False, "compilation failed"),
    ("Rgb(255, 0, 0)", False, None),  # Mixed case keyword
]


# Combine all test cases
ALL_CASES = (
    NAMED_COLORS
    + HTML_COLORS
    + RGB_COLORS
    + HSB_COLORS
    + MOLCOL_COLORS
    + MODIFIERS
    + EDGE_CASES
)


# =============================================================================
# Tests
# =============================================================================


@pytest.mark.parametrize("color_str,should_succeed,error_substr", ALL_CASES)
def test_color_syntax(color_str, should_succeed, error_substr):
    """Test color syntax - both valid and invalid cases."""
    color, error = compile_color(color_str)

    if should_succeed:
        # Should compile without syntax error
        if error:
            assert "syntax" not in error, (
                f"Syntax error for valid color: {color_str!r}, error: {error}"
            )
    else:
        # Should fail
        assert error is not None or color is None, f"Should have failed: {color_str!r}"
        if error_substr and error:
            assert error_substr in error, (
                f"Expected '{error_substr}' in error for {color_str!r}, got: {error}"
            )


def test_case_sensitivity():
    """Verify case sensitivity rules for keywords."""
    # All lowercase or all uppercase works
    for color_str in [
        "rgb(255, 0, 0)",
        "RGB(255, 0, 0)",
        "hsb(0, 1, 1)",
        "HSB(0, 1, 1)",
    ]:
        color, error = compile_color(color_str)
        assert error is None and color is not None, f"Failed: {color_str}"

    # Mixed case fails
    assert compile_color("Rgb(255, 0, 0)")[0] is None
