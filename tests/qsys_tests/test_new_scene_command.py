import pytest

import cuemol


def test_new_scene_command():
    mgr = cuemol.svc("CmdMgr")

    args = {"scene_name": "new scene", "create_view": True}
    result = mgr.runCmdArgs("new_scene", args)

    assert "result_scene" in result
    assert result["result_scene"] is not None
    assert cuemol.isscene(result["result_scene"])
    assert result["result_scene"].name == "new scene"

    assert "result_view" in result
    assert result["result_view"] is not None
    assert cuemol.isview(result["result_view"])


@pytest.mark.requires_lfs_data("1crn_test1.qsc")
def test_load_scene_command(test_data_path, create_scene):
    mgr = cuemol.svc("CmdMgr")

    scene = create_scene

    test_scene_path = test_data_path / "1crn_test1.qsc"
    args = {"file_path": str(test_scene_path), "target_scene": scene}
    result = mgr.runCmdArgs("load_scene", args)

    assert "result_scene" in result
    assert result["result_scene"] is not None
    assert cuemol.isscene(result["result_scene"])

    mol = scene.getObjectByName("1crn.cif")
    assert mol is not None
    assert cuemol.isobj(mol)
