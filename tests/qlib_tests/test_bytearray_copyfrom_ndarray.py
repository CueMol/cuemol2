import numpy as np
import pytest
import cuemol


def test_read_data_bytearray():
    arr = np.arange(10, dtype="float32")
    result = cuemol.copy_from_ndarray(arr)

    # Data should be copied to ByteArray
    for i in range(len(arr)):
        assert pytest.approx(arr[i]) == result.getAtF(i)


def test_write_data_bytearray():
    arr = np.arange(10, dtype="float32")
    result = cuemol.copy_from_ndarray(arr)

    result.setAtF(0, 10.0)
    result.setAtF(1, 20.0)
    result.setAtF(2, 30.0)

    # Original data should not be modified
    assert arr[0] == pytest.approx(0.0)
    assert arr[1] == pytest.approx(1.0)
    assert arr[2] == pytest.approx(2.0)

def test_numpy_modifications_bytearray():
    arr = np.arange(10, dtype="float32")
    result = cuemol.copy_from_ndarray(arr)

    # Modify numpy array
    arr[0] = 100.0
    arr[1] = 200.0

    # Should not be changed in ByteArray
    assert result.getAtF(0) == pytest.approx(0.0)
    assert result.getAtF(1) == pytest.approx(1.0)
