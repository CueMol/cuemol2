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
        return color, "failed" if color is None else None
    except Exception as e:
        return None, str(e)


# =============================================================================
# Test Cases: (color_string, should_succeed)
# =============================================================================

NAMED_COLORS = [
    ("red", True),
    ("color_1", True),  # Underscore and number
    (" red", True),  # Whitespace
    ("color space", False),  # Invalid space
    ("red blue", False),  # Multiple tokens
]

HTML_COLORS = [
    ("#fff", True),
    ("#ffffff", True),
    ("#AbC", True),  # Case variation
    ("#ggg", False),  # Invalid hex
]

RGB_COLORS = [
    ("rgb(255, 0, 0)", True),
    ("rgb(1.0, 0.5, 0.0)", True),  # Float
    ("RGB(128, 128, 128)", True),  # Uppercase
    ("rgba(255, 0, 0, 0.5)", True),
    ("rgb(255, 0)", False),  # Wrong arg count
    ("rgb(255; 0; 0)", False),  # Wrong separator
]

HSB_COLORS = [
    ("hsb(0.0, 1.0, 1.0)", True),
    ("HSB(120.0, 0.5, 0.5)", True),  # Uppercase
    ("hsba(240.0, 1.0, 1.0, 0.5)", True),
    ("hsb(0.0, 1.0)", False),  # Wrong arg count
]

MOLCOL_COLORS = [
    ("$molcol", True),
    ("$mol col", False),  # Space
]

MODIFIERS = [
    ("red{alpha: 0.5}", True),
    ("rgb(255, 0, 0){alpha: 0.5; brightness: 1.2}", True),
    ("red{alpha: 0.5", False),  # Missing brace
]

EDGE_CASES = [
    ("", False),
    ("   ", False),
    ("Rgb(255, 0, 0)", False),  # Mixed case keyword
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


@pytest.mark.parametrize("color_str,should_succeed", ALL_CASES)
def test_color_syntax(color_str, should_succeed):
    """Test color syntax - both valid and invalid cases."""
    color, error = compile_color(color_str)

    if should_succeed:
        # Must compile successfully: no error and color exists
        assert error is None, (
            f"Expected successful compilation for {color_str!r}, got error: {error}"
        )
        assert color is not None, f"Expected color object for {color_str!r}, got None"
    else:
        # Should fail: either error or no color
        # Don't check error message content - it may change in implementation
        assert error is not None or color is None, (
            f"Expected failure for {color_str!r}, but compilation succeeded"
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
