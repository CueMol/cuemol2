import pytest
import cuemol


@pytest.fixture
def ba_obj():
    return cuemol.createObj("ByteArray")


def test_qlib_bytearray(ba_obj):
    print(f"{ba_obj=}")
    print(f"{ba_obj.length=}")
    assert ba_obj
    assert ba_obj.length == 0
    # assert False


def test_qlib_bytearray_length(ba_obj):
    # uint8 array of 100 elems
    ba_obj.init(ba_obj.UINT8, 100)
    assert ba_obj.length == 100


def test_qlib_bytearray_getval_setval(ba_obj):
    # uint8 array of 100 elems
    ba_obj.init(ba_obj.UINT8, 100)
    for i in range(100):
        ba_obj.setValue(i, 10)
        assert ba_obj.getValue(i) == 10


def test_qlib_bytearray_get_set(ba_obj):
    # int32 array of 100 elems
    ba_obj.init(ba_obj.INT32, 100)
    for i in range(100):
        ba_obj.setAt(i, -123)
        assert ba_obj.getAt(i) == -123


def test_qlib_bytearray_getfsetf(ba_obj):
    # float32 array of 100 elems
    ba_obj.init(ba_obj.FLOAT32, 100)
    for i in range(100):
        ba_obj.setAtF(i, 12.34)
        assert pytest.approx(12.34) == ba_obj.getAtF(i)


def test_numpy_array_ba_uint8(ba_obj):
    ba_obj.init(ba_obj.UINT8, 100)
    for i in range(100):
        ba_obj.setAt(i, 123)

    arr = cuemol.copy_to_ndarray(ba_obj)
    assert arr.shape == (100,)
    assert arr.dtype == "uint8"
    print(f"{arr=}")
    for v in arr:
        assert 123 == v

def test_numpy_array_ba_int32(ba_obj):
    ba_obj.init(ba_obj.INT32, 100)
    for i in range(100):
        ba_obj.setAt(i, -123456)

    arr = cuemol.copy_to_ndarray(ba_obj)
    assert arr.shape == (100,)
    assert arr.dtype == "int32"
    print(f"{arr=}")
    for v in arr:
        assert -123456 == v

def test_numpy_array_ba_float(ba_obj):
    ba_obj.init(ba_obj.FLOAT32, 100)
    for i in range(100):
        ba_obj.setAtF(i, 1.23)

    arr = cuemol.copy_to_ndarray(ba_obj)
    assert arr.shape == (100,)
    assert arr.dtype == "float32"
    print(f"{arr=}")
    for v in arr:
        assert pytest.approx(1.23) == v


def test_numpy_array_ba_double(ba_obj):
    ba_obj.init(ba_obj.FLOAT64, 100)
    for i in range(100):
        ba_obj.setAtF(i, 1.23)

    arr = cuemol.copy_to_ndarray(ba_obj)
    assert arr.shape == (100,)
    assert arr.dtype == "float64"
    print(f"{arr=}")
    for v in arr:
        assert pytest.approx(1.23) == v
