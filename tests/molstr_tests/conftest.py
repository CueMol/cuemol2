import cuemol
import pytest


@pytest.fixture
def selobj():
    """Create a SelCommand object for testing."""
    return cuemol.createObj("SelCommand")
