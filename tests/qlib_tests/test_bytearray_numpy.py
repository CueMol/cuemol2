import weakref
import pytest
import cuemol
import gc
import numpy as np
import sys


def test_refcount_increases_on_hold():
    """Verify that holding an array increases its reference count."""
    arr = np.arange(10, dtype="float32")
    initial_refcount = sys.getrefcount(arr)

    result = cuemol.from_ndarray(arr)

    # Ref == 1
    assert cuemol.get_ref_count(result) == 1

    # Reference count should increase by 1 (ByteArray holds one reference)
    assert sys.getrefcount(arr) == initial_refcount + 1


def test_refcount_decreases_when_released():
    """Verify that releasing the shared_ptr decreases the reference count."""
    arr = np.arange(10, dtype="float32")
    initial_refcount = sys.getrefcount(arr)

    result = cuemol.from_ndarray(arr)
    assert cuemol.get_ref_count(result) == 1

    del result
    gc.collect()
    final_refcount = sys.getrefcount(arr)

    # Reference count should return to initial value
    assert final_refcount == initial_refcount


def test_refcount_with_multiple_shared_ptr_copies():
    """Verify reference counting with multiple shared_ptr copies."""
    arr = np.arange(10, dtype="float32")
    initial_refcount = sys.getrefcount(arr)

    result = cuemol.from_ndarray(arr)
    print(f"{cuemol.get_ref_count(result)=}")
    assert cuemol.get_ref_count(result) == 1
    # Creating a copy of shared_ptr should NOT increase numpy refcount
    # (only ByteArray ref_count increases)
    copied = cuemol.copyObj(result)

    # Numpy refcount should still be initial + 1
    assert sys.getrefcount(arr) == initial_refcount + 1

    # But shared_ptr use_count should be 2
    print(f"{cuemol.get_ref_count(copied)=}")
    assert cuemol.get_ref_count(copied) == 2
    assert cuemol.get_ref_count(result) == 2

    # Release copy - refcount unchanged, use_count decreases
    del copied
    gc.collect()
    assert sys.getrefcount(arr) == initial_refcount + 1
    assert cuemol.get_ref_count(result) == 1

    # Release main - refcount returns to initial
    del result
    gc.collect()
    assert sys.getrefcount(arr) == initial_refcount


def test_read_data_through_shared_ptr():
    """Verify data can be read through the shared_ptr."""
    arr = np.arange(10, dtype="float32")
    result = cuemol.from_ndarray(arr)

    for i in range(len(arr)):
        assert pytest.approx(arr[i]) == result.getAtF(i)


def test_write_data_through_shared_ptr():
    """Verify data can be written through the shared_ptr."""
    arr = np.arange(10, dtype="float32")
    result = cuemol.from_ndarray(arr)

    result.setAtF(0, 10.0)
    result.setAtF(1, 20.0)
    result.setAtF(2, 30.0)

    # Changes should be visible in original numpy array
    assert pytest.approx(10.0) == arr[0]
    assert arr[1] == pytest.approx(20.0)
    assert arr[2] == pytest.approx(30.0)


def test_numpy_modifications_visible_through_shared_ptr():
    """Verify numpy modifications are visible through shared_ptr."""
    arr = np.arange(10, dtype="float32")
    result = cuemol.from_ndarray(arr)

    # Modify through numpy
    arr[0] = 100.0
    arr[1] = 200.0

    # Should be visible through shared_ptr
    assert result.getAtF(0) == pytest.approx(100.0)
    assert result.getAtF(1) == pytest.approx(200.0)


def test_array_survives_python_variable_deletion():
    """Array data should remain valid even if Python variable is deleted."""
    arr = np.arange(10, dtype="float32")
    result = cuemol.from_ndarray(arr)

    # Delete the Python variable
    del arr
    gc.collect()

    # Data should still be accessible through ByteArray
    assert result.getAtF(0) == pytest.approx(0.0)
    assert result.getAtF(1) == pytest.approx(1.0)
    assert result.getAtF(2) == pytest.approx(2.0)


def test_weakref_shows_array_alive_while_held():
    """Weakref should show array is alive while ByteArray holds it."""
    arr = np.arange(10, dtype="float32")
    weak = weakref.ref(arr)

    result = cuemol.from_ndarray(arr)
    del arr
    gc.collect()

    # Array should still be alive (weakref returns object)
    assert weak() is not None

    # Release shared_ptr
    del result
    gc.collect()

    # Now array should be garbage collected
    assert weak() is None


#
# Test edge cases and error handling
#


def test_hold_empty_array():
    """Test with empty array."""
    arr = np.array([], dtype=np.float32)
    initial_refcount = sys.getrefcount(arr)
    target = cuemol.from_ndarray(arr)

    assert cuemol.get_ref_count(target) == 1
    assert sys.getrefcount(arr) == initial_refcount + 1

    del target
    gc.collect()

    assert sys.getrefcount(arr) == initial_refcount


def test_hold_large_array():
    """Test with large array to ensure no memory issues."""
    arr = np.arange(100000, dtype=np.float32)
    initial_refcount = sys.getrefcount(arr)

    target = cuemol.from_ndarray(arr)
    assert target.getAtF(0) == pytest.approx(0.0)
    assert target.getAtF(99999) == pytest.approx(99999.0)

    del target
    gc.collect()

    assert sys.getrefcount(arr) == initial_refcount


def test_hold_view_keeps_base_alive():
    """Holding a view should keep the base array alive."""
    base = np.arange(10, dtype="float32")
    view = base[1:4]  # View of elements 1, 2, 3

    # Get weakref to base
    base_weak = weakref.ref(base)

    target = cuemol.from_ndarray(view)

    # Delete both Python references
    del view
    del base
    gc.collect()

    # Base should still be alive (because view keeps it alive,
    # and shared_ptr keeps view alive)
    # Note: This depends on numpy's internal reference management
    assert cuemol.get_ref_count(target) == 1
    assert target.getAtF(0) == 1.0  # First element of view
    assert base_weak() is not None

    del target
    gc.collect()
    assert base_weak() is None


#
# Test that non-C-contiguous and non-native byte order arrays are rejected
#


def test_f_order_1d_array_accepted():
    """1D F-order array is also C-contiguous, should be accepted."""
    arr = np.array([1.0, 2.0, 3.0], dtype=np.float64, order="F")

    # 1D array is both C and F contiguous
    # Should succeed
    target = cuemol.from_ndarray(arr)
    assert target.getAtF(0) == 1.0


def test_non_contiguous_slice_raises():
    """Non-contiguous slice (stride > element size) should raise ValueError."""
    arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], dtype=np.float64)
    sliced = arr[::2]  # Every other element: [1.0, 3.0, 5.0]

    with pytest.raises(ValueError, match="C-contiguous"):
        cuemol.from_ndarray(sliced)


def test_non_contiguous_column_slice_raises():
    """Column slice of 2D array (non-contiguous) should raise ValueError."""
    arr = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]], dtype=np.float64)
    col = arr[:, 0]  # First column

    # assert not col.flags['C_CONTIGUOUS']

    with pytest.raises(ValueError, match="C-contiguous"):
        cuemol.from_ndarray(col)


def test_hold_contiguous_copy():
    """Test with non-contiguous array that gets copied."""
    arr = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float64)
    col = np.ascontiguousarray(arr[:, 0])  # Make contiguous copy of column

    target = cuemol.from_ndarray(col)
    assert target.getAtF(0) == 1.0
    assert target.getAtF(1) == 3.0


def test_non_native_byte_order_raises():
    """Non-native byte order array should raise ValueError."""
    native_order = sys.byteorder  # 'little' or 'big'

    # Create array with swapped byte order
    if native_order == "little":
        non_native_dtype = ">f8"  # Big-endian float64
    else:
        non_native_dtype = "<f8"  # Little-endian float64

    print(f"{non_native_dtype=}")
    arr = np.array([1.0, 2.0, 3.0], dtype=non_native_dtype)

    # assert arr.flags['C_CONTIGUOUS']

    with pytest.raises(ValueError, match="native byte order"):
        cuemol.from_ndarray(arr)


def test_byteswapped_array_raises():
    """Byte-swapped array should raise ValueError."""
    arr = np.array([1.0, 2.0, 3.0], dtype=np.float64)
    swapped = arr.byteswap().view(arr.dtype.newbyteorder())

    with pytest.raises(ValueError, match="native byte order"):
        cuemol.from_ndarray(swapped)
