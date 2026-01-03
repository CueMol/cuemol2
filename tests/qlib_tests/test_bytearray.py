import pytest


def test_qlib_bytearray(ba_obj):
    target = ba_obj()
    print(f"{target=}")
    print(f"{target.length=}")
    assert target
    assert target.length == 0
    # assert False


def test_qlib_bytearray_length(ba_obj):
    target = ba_obj()
    # uint8 array of 100 elems
    target.init(target.UINT8, 100)
    assert target.length == 100


def test_qlib_bytearray_getval_setval(ba_obj):
    target = ba_obj()
    # uint8 array of 100 elems
    target.init(target.UINT8, 100)
    for i in range(100):
        target.setValue(i, 10)
        assert target.getValue(i) == 10


def test_qlib_bytearray_get_set(ba_obj):
    target = ba_obj()
    # int32 array of 100 elems
    target.init(target.INT32, 100)
    for i in range(100):
        target.setAt(i, -123)
        assert target.getAt(i) == -123


def test_qlib_bytearray_getfsetf(ba_obj):
    target = ba_obj()
    # float32 array of 100 elems
    target.init(target.FLOAT32, 100)
    for i in range(100):
        target.setAtF(i, 12.34)
        assert pytest.approx(12.34) == target.getAtF(i)
