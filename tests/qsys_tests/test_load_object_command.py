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
    assert "result_object" in result
    assert cuemol.isobj(result["result_object"])
    assert result["result_object"].name == "1CRN"

def test_color_proof(mol_1crn_path, create_scene):
    mgr = cuemol.svc("CmdMgr")
    scene = create_scene
    args = {"target_scene": scene,
            "file_path": str(mol_1crn_path),
            "object_name": "1CRN",
            "file_format": "pdb"}
    result = mgr.runCmdArgs("load_object", args)
    scene.use_colproof = True
    scene.icc_filename = "GenericCMYK.icm"

    blue = cuemol.col("#FFF", scene)
    print(f"blue: {blue}")
    print(f"blue: {(blue.getCode()&0xFFFFFF):08X}")
    print(f"blue: {(blue.getDevCode(scene.uid)&0xFFFFFF):08X}")
    print(f"blue: {blue.isInGamut(scene.uid)}")

    green = cuemol.col("#00FF00", scene)
    print(f"green: {green}")
    print(f"green: {(green.getCode()&0xFFFFFF):08X}")
    print(f"green: {(green.getDevCode(scene.uid)&0xFFFFFF):08X}")
    print(f"green: {green.isInGamut(scene.uid)}")

    red = cuemol.col("#FF0000", scene)
    print(f"red: {red}")
    print(f"red: {(red.getCode()&0xFFFFFF):08X}")
    print(f"red: {(red.getDevCode(scene.uid)&0xFFFFFF):08X}")
    print(f"red: {red.isInGamut(scene.uid)}")
