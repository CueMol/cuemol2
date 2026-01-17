import pytest
import cuemol
from pathlib import Path


@pytest.fixture
def test_data_path():
    here = Path(__file__).parent
    return here / "test_data"


@pytest.fixture
def mol_1crn_path(test_data_path):
    return test_data_path / "1CRN.pdb"


@pytest.fixture
def create_scene():
    mgr = cuemol.svc("CmdMgr")

    args = {"scene_name": "new scene", "create_view": False}
    result = mgr.runCmdArgs("new_scene", args)
    scene = result["result_scene"]
    yield scene

    # clean-up
    scmgr = cuemol.svc("SceneManager")
    scmgr.destroyAllScenes()
