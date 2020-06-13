import pytest
import cuemol

@pytest.fixture
def vec_obj():
    return cuemol.createObj("Vector")

def test_qlib_vector_props(vec_obj):
    v = vec_obj
    v.x = 10.2
    v.y = 100.1
    v.z = 1111.3
    v.w = 1234.5

    assert v.x == 10.2
    assert v.y == 100.1
    assert v.z == 1111.3
    assert v.w == 1234.5
    
def test_qlib_vector_init(vec_obj):
    v = vec_obj
    assert v.x == 0.0
    assert v.y == 0.0
    assert v.z == 0.0
    assert v.w == 0.0

    v.set3(1.0, 2.3, 4.5)
    assert v.x == 1.0
    assert v.y == 2.3
    assert v.z == 4.5
    assert v.w == 0.0
    
    v.set4(11.0, 12.3, 14.5, 34.5)
    assert v.x == 11.0
    assert v.y == 12.3
    assert v.z == 14.5
    assert v.w == 34.5
    
