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
    ba_obj.init(1, 100)
    assert ba_obj.length == 100

def test_qlib_bytearray_getset(ba_obj):
    # uint8 array of 100 elems
    ba_obj.init(1, 100)
    for i in range(100):
        ba_obj.setValue(i, 10)
        assert ba_obj.getValue(i) == 10

def test_qlib_bytearray_getfsetf(ba_obj):
    # float32 array of 100 elems
    ba_obj.init(21, 100)
    for i in range(100):
        ba_obj.setValueF(i, 12.34)
        assert pytest.approx(12.34) == ba_obj.getValueF(i)

# def test_qlib_bytearray_set_err(ba_obj):
#     # uint8 array of 100 elems
#     ba_obj.init(1, 100)
#     ba_obj.setValue(1000, 10)

def test_numpy_array():
    print(dir(cuemol.ci))
    arr = cuemol.ci.numpychk()
    print(arr)
    assert len(arr) == 10
    
def test_numpy_array_ba(ba_obj):
    ba_obj.init(21, 100)
    # print(dir(ba_obj._wrapped))
    arr = cuemol.ci.tondarray(ba_obj._wrapped)
    print(arr)
    
