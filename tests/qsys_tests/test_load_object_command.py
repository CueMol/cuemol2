import pytest
import cuemol


@pytest.fixture
def create_scene():
    mgr = cuemol.svc("CmdMgr")

    args = {"scene_name": "new scene",
            "create_view": False}
    result = mgr.runCmdArgs("new_scene", args)
    scene = result["result_scene"]
    yield scene

    # clean-up
    scmgr = cuemol.svc("SceneManager")
    scmgr.destroyAllScenes()
    

def test_load_object_command(mol_1crn_path, create_scene):
    mgr = cuemol.svc("CmdMgr")
    scene = create_scene
    args = {"target_scene": scene,
            "file_path": str(mol_1crn_path),
            "object_name": "1CRN",
            "file_format": "pdb"}
    result = mgr.runCmdArgs("load_object", args)
