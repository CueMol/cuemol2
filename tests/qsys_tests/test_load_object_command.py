import cuemol


def test_load_object_command(mol_1crn_path, create_scene):
    mgr = cuemol.svc("CmdMgr")
    scene = create_scene
    args = {
        "target_scene": scene,
        "file_path": str(mol_1crn_path),
        "object_name": "1CRN",
        "file_format": "pdb",
    }
    result = mgr.runCmdArgs("load_object", args)
    assert "result_object" in result
    assert cuemol.isobj(result["result_object"])
    assert result["result_object"].name == "1CRN"
