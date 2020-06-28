import pytest
import cuemol
from pathlib import Path

@pytest.fixture
def mol_1crn(mol_1crn_path):
    mgr = cuemol.svc("CmdMgr")

    args = {"scene_name": "new scene",
            "create_view": False}
    result = mgr.runCmdArgs("new_scene", args)
    scene = result["result_scene"]

    args = {"target_scene": scene,
            "file_path": str(mol_1crn_path),
            "object_name": "1CRN",
            "file_format": "pdb"}
    result = mgr.runCmdArgs("load_object", args)

    yield result["result_object"]

    # clean-up
    scmgr = cuemol.svc("SceneManager")
    scmgr.destroyAllScenes()


def test_new_renderer_command(mol_1crn):
    mgr = cuemol.svc("CmdMgr")
    obj = mol_1crn
    
    args = {"target_object": obj,
            "renderer_type": "simple",
            "renderer_name": "simple0",
            "recenter_view": True}
    result = mgr.runCmdArgs("new_renderer", args)
    print(result)
