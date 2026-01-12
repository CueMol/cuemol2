import pytest
import cuemol
import json


def test_numberchain1(test_data_path):
    mgr = cuemol.svc("CmdMgr")

    qsc_path = test_data_path / "number_chain_atomintr1.qsc"

    args = {"file_path": str(qsc_path)}
    result = mgr.runCmdArgs("load_scene", args)

    assert "result_scene" in result
    assert result["result_scene"] is not None
    sc = result["result_scene"]
    assert cuemol.isscene(sc)

    mol = sc.getObjectByName("number_chain_260112.pdb")
    assert mol is not None
    rend = mol.getRendererByName("measure")
    assert rend is not None

    json_str = rend.getDefsJSON()
    print(f"{json_str=}")
    obj = json.loads(json_str)

    # <line aid1="9.27.CA" aid2="A.3.CA"/>
    print(f"{obj[0]['a0']=}")
    print(f"{obj[0]['a1']=}")

    assert obj[0]["a0"] == "9 ALA 27 CA"
    assert obj[0]["a1"] == "A CYS 3 CA"


def test_numberchain2(test_data_path):
    mgr = cuemol.svc("CmdMgr")

    qsc_path = test_data_path / "number_chain_atomintr1.qsc"

    args = {"file_path": str(qsc_path)}
    result = mgr.runCmdArgs("load_scene", args)

    assert "result_scene" in result
    assert result["result_scene"] is not None
    sc = result["result_scene"]
    assert cuemol.isscene(sc)

    mol = sc.getObjectByName("number_chain_260112.pdb")
    assert mol is not None
    rend = mol.getRendererByName("measure2")
    assert rend is not None

    json_str = rend.getDefsJSON()
    print(f"{json_str=}")
    obj = json.loads(json_str)

    # <line aid1="43" aid2="88"/>
    print(f"{obj[0]['a0']=}")
    print(f"{obj[0]['a1']=}")

    assert obj[0]["a0"] == "9 ALA 27 CA"
    assert obj[0]["a1"] == "A CYS 3 CA"


