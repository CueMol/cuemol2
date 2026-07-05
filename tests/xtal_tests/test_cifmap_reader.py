import pytest

import cuemol


@pytest.mark.requires_lfs_data("2ydo_test.cif.gz")
def test_cifmap_reader(test_data_path):
    svc = cuemol.getService("StreamManager")
    reader = svc.createHandler("mmcifmap", 0)
    print(f"{reader=}")

    test_cif_file = test_data_path / "2ydo_test.cif.gz"
    reader.setPath(str(test_cif_file))
    reader.compress = "gzip"
    obj = reader.createDefaultObj()
    reader.attach(obj)
    reader.read()
    reader.detach()


