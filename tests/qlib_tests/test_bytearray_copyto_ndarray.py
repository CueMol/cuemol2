import pytest
import cuemol


def test_numpy_array_ba_uint8(ba_obj):
    target = ba_obj()
    target.init(target.UINT8, 100)
    for i in range(100):
        target.setAt(i, 123)

    arr = cuemol.copy_to_ndarray(target)
    assert arr.shape == (100,)
    assert arr.dtype == "uint8"
    print(f"{arr=}")
    for v in arr:
        assert 123 == v


def test_numpy_array_ba_int32(ba_obj):
    target = ba_obj()
    target.init(target.INT32, 100)
    for i in range(100):
        target.setAt(i, -123456)

    arr = cuemol.copy_to_ndarray(target)
    assert arr.shape == (100,)
    assert arr.dtype == "int32"
    print(f"{arr=}")
    for v in arr:
        assert -123456 == v


def test_numpy_array_ba_float(ba_obj):
    target = ba_obj()
    target.init(target.FLOAT32, 100)
    for i in range(100):
        target.setAtF(i, 1.23)

    arr = cuemol.copy_to_ndarray(target)
    assert arr.shape == (100,)
    assert arr.dtype == "float32"
    print(f"{arr=}")
    for v in arr:
        assert pytest.approx(1.23) == v


def test_numpy_array_ba_double(ba_obj):
    target = ba_obj()
    target.init(target.FLOAT64, 100)
    for i in range(100):
        target.setAtF(i, 1.23)

    arr = cuemol.copy_to_ndarray(target)
    assert arr.shape == (100,)
    assert arr.dtype == "float64"
    print(f"{arr=}")
    for v in arr:
        assert pytest.approx(1.23) == v
