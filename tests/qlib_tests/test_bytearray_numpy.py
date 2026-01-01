import pytest
import cuemol
import gc
import numpy as np


@pytest.fixture
def ba_obj():
    def _fn():
        return cuemol.createObj("ByteArray")

    return _fn


@pytest.fixture
def ba_uint8_obj(ba_obj):
    def _fn(size=100):
        result = ba_obj()
        result.init(result.UINT8, size)
        for i in range(size):
            result.setAt(i, i)
        return result

    return _fn


@pytest.fixture
def ba_int32_obj(ba_obj):
    def _fn(size=100):
        result = ba_obj()
        result.init(result.INT32, size)
        for i in range(size):
            result.setAt(i, i)
        return result

    return _fn


@pytest.fixture
def ba_float_obj(ba_obj):
    def _fn(size=100):
        result = ba_obj()
        result.init(result.FLOAT32, size)
        for i in range(size):
            result.setAtF(i, float(i))
        return result

    return _fn


def test_numpy_refcount1(ba_int32_obj):
    """Verify deleter is called when single array is deleted."""
    target = ba_int32_obj()
    print(f"{cuemol.get_ref_count(target)=}")
    assert cuemol.get_ref_count(target) == 1

    arr = cuemol.to_ndarray(target)
    assert cuemol.get_ref_count(target) == 2

    del arr
    gc.collect()

    print(f"{cuemol.get_ref_count(target)=}")
    assert cuemol.get_ref_count(target) == 1


def test_numpy_shared_refcount(ba_int32_obj):
    """Verify deleters are called for multiple arrays."""
    target = ba_int32_obj()
    nobjs = 5
    arrays = [cuemol.to_ndarray(target) for _ in range(nobjs)]

    arrays[0][11] = 71
    for i in range(nobjs):
        print(f"{arrays[i][11]=}")
        assert arrays[i][11] == 71

    assert cuemol.get_ref_count(target) == 1 + nobjs

    del arrays
    gc.collect()

    print(f"{cuemol.get_ref_count(target)=}")
    assert cuemol.get_ref_count(target) == 1


def test_numpy_partial_deallocation(ba_int32_obj):
    """Verify only deleted arrays have their deleter called."""
    tgt1 = ba_int32_obj()
    tgt2 = ba_int32_obj()
    tgt3 = ba_int32_obj()

    assert cuemol.get_ref_count(tgt1) == 1
    assert cuemol.get_ref_count(tgt2) == 1
    assert cuemol.get_ref_count(tgt3) == 1

    tgt1_arr = cuemol.to_ndarray(tgt1)
    tgt2_arr = cuemol.to_ndarray(tgt2)
    tgt3_arr = cuemol.to_ndarray(tgt3)

    del tgt2_arr
    gc.collect()

    assert cuemol.get_ref_count(tgt1) == 2
    assert cuemol.get_ref_count(tgt2) == 1
    assert cuemol.get_ref_count(tgt3) == 2

    assert tgt1_arr[0] == 0
    assert tgt3_arr[0] == 0

    del tgt1_arr, tgt3_arr
    gc.collect()

    assert cuemol.get_ref_count(tgt1) == 1
    assert cuemol.get_ref_count(tgt2) == 1
    assert cuemol.get_ref_count(tgt3) == 1


def test_view_keeps_memory_alive(ba_int32_obj):
    """Verify view prevents premature deallocation."""
    target = ba_int32_obj()
    arr = cuemol.to_ndarray(target)
    view = arr[10:20]  # Create a view

    del arr
    gc.collect()

    # Memory should NOT be deallocated yet
    assert cuemol.get_ref_count(target) == 2

    # View should still be valid
    expected = np.arange(10, 20, dtype=np.float64)
    np.testing.assert_array_equal(view, expected)

    del view
    gc.collect()

    # Now memory should be deallocated
    assert cuemol.get_ref_count(target) == 1


def test_multiple_views_keep_memory_alive(ba_int32_obj):
    """Verify multiple views all keep memory alive."""
    target = ba_int32_obj()

    arr = cuemol.to_ndarray(target)
    view1 = arr[0:10]
    view2 = arr[10:20]
    view3 = arr[50:60]

    del arr
    gc.collect()

    assert cuemol.get_ref_count(target) == 2

    del view1, view2
    gc.collect()

    assert cuemol.get_ref_count(target) == 2

    # view3 should still be valid
    assert view3.shape == (10,)

    del view3
    gc.collect()

    assert cuemol.get_ref_count(target) == 1


def test_reshape_keeps_memory_alive(ba_int32_obj):
    """Verify reshape (which creates a view) keeps memory alive."""
    target = ba_int32_obj()
    arr = cuemol.to_ndarray(target)
    reshaped = arr.reshape(10, 10)

    del arr
    gc.collect()

    assert cuemol.get_ref_count(target) == 2

    # Reshaped array should be valid
    assert reshaped.shape == (10, 10)
    assert reshaped[0, 0] == 0
    assert reshaped[9, 9] == 99


def test_numpy_array_ba_uint8(ba_uint8_obj):
    target = ba_uint8_obj()
    for i in range(100):
        target.setAt(i, 123)

    arr = cuemol.to_ndarray(target)
    assert arr.shape == (100,)
    assert arr.dtype == "uint8"
    print(f"{cuemol.get_ref_count(target)=}")
    assert cuemol.get_ref_count(target) == 2
    print(f"{arr=}")
    for v in arr:
        assert 123 == v

    print("pytest OK.")


def test_numpy_array_ba_float(ba_float_obj):
    target = ba_float_obj()
    for i in range(100):
        target.setAtF(i, 1.2345)

    arr = cuemol.to_ndarray(target)
    assert arr.shape == (100,)
    assert arr.dtype == "float32"
    assert cuemol.get_ref_count(target) == 2
    for v in arr:
        assert pytest.approx(1.2345) == v
