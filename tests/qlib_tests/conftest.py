import pytest
import cuemol


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
