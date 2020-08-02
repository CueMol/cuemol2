import pytest
import cuemol

def test_new_scene_command():
    mgr = cuemol.svc("CmdMgr")

    args = {"scene_name": "new scene",
            "create_view": True}
    result = mgr.runCmdArgs("new_scene", args)

    assert "result_scene" in result
    assert result["result_scene"] != None
    assert cuemol.isscene(result["result_scene"])
    assert result["result_scene"].name == "new scene"

    assert "result_view" in result
    assert result["result_view"] != None
    assert cuemol.isview(result["result_view"])
