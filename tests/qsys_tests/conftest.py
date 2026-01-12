import pytest
import cuemol

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
