import pytest
from pathlib import Path

@pytest.fixture
def test_data_path():
    here = Path(__file__).parent
    return here / "test_data"


@pytest.fixture
def mol_1crn_path(test_data_path):
    return test_data_path / "1CRN.pdb"
