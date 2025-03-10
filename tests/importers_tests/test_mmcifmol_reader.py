import pytest

import cuemol


def test_mmcifmol_reader(test_data_path):
    svc = cuemol.getService("StreamManager")
    reader = svc.createHandler("mmcif", 0)
    print(f"{reader=}")

    test_sdf_file = test_data_path / "1crn.cif"
    reader.setPath(str(test_sdf_file))
    obj = reader.createDefaultObj()
    reader.attach(obj)
    reader.read()
    reader.detach()
    natoms = obj.getAtomSize()
    print(f"{natoms=}")
    assert natoms == 327

    nbonds = obj.getBondSize()
    print(f"{nbonds=}")
    assert nbonds == 337

def test_mmcifmol_invalid1(test_data_path):
    svc = cuemol.getService("StreamManager")
    reader = svc.createHandler("mmcif", 0)
    print(f"{reader=}")

    test_sdf_file = test_data_path / "3RXN_mod.cif"
    reader.setPath(str(test_sdf_file))
    obj = reader.createDefaultObj()
    reader.attach(obj)
    reader.read()
    reader.detach()
    natoms = obj.getAtomSize()
    print(f"{natoms=}")
    assert natoms == 9

    nbonds = obj.getBondSize()
    print(f"{nbonds=}")
    assert nbonds == 7
