import cuemol


def test_opendx_reader(test_data_path):
    svc = cuemol.getService("StreamManager")
    reader = svc.createHandler("apbs", 0)
    print(f"{reader=}")

    test_cif_file = test_data_path / "small_tabsep_opendx.dx"
    reader.setPath(str(test_cif_file))
    obj = reader.createDefaultObj()
    reader.attach(obj)
    reader.read()
    reader.detach()
