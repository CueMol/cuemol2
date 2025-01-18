import pytest

import cuemol


def test_cifmap_reader(test_data_path):
    svc = cuemol.getService("StreamManager")
    reader = svc.createHandler("mmcifmap", 0)
    print(f"{reader=}")

    # test_sdf_file = test_data_path / "test1.sdf"
    # reader.setPath(str(test_sdf_file))
    # obj = reader.createDefaultObj()
    # reader.attach(obj)
    # reader.read()
    # reader.detach()
    # natoms = obj.getAtomSize()
    # print(f"{natoms=}")
    # assert natoms == 37

    # nbonds = obj.getBondSize()
    # print(f"{nbonds=}")
    # assert nbonds == 40


