import math
import pytest
import cuemol

@pytest.fixture
def mat_obj():
    return cuemol.createObj("Matrix")

@pytest.fixture
def mat_obj2():
    v = cuemol.createObj("Matrix")
    v.setAt(1, 1, 10.2)
    v.setAt(2, 2, 100.1)
    v.setAt(3, 3, 1111.3)
    v.setAt(4, 4, 1234.5)
    return v

def test_qlib_matrix_elems(mat_obj):
    v = mat_obj
    v.setAt(1, 1, 10.2)
    v.setAt(2, 2, 100.1)
    v.setAt(3, 3, 1111.3)
    v.setAt(4, 4, 1234.5)

    assert v.getAt(1, 1) == 10.2
    assert v.getAt(2, 2) == 100.1
    assert v.getAt(3, 3) == 1111.3
    assert v.getAt(4, 4) == 1234.5

def test_qlib_matrix_addat(mat_obj):
    v = mat_obj

    v.addAt(1, 1, 10.2)
    v.addAt(2, 2, 100.1)
    v.addAt(3, 3, 1111.3)
    v.addAt(4, 4, 1234.5)

    assert v.getAt(1, 1) == 10.2 + 1
    assert v.getAt(2, 2) == 100.1 + 1
    assert v.getAt(3, 3) == 1111.3 + 1
    assert v.getAt(4, 4) == 1234.5 + 1

def test_qlib_matrix_tostring(mat_obj2):
    v = mat_obj2
    assert v.toString() == ("(10.2000000,0.0000000,0.0000000,0.0000000,"
    + "0.0000000,100.1000000,0.0000000,0.0000000,"
    + "0.0000000,0.0000000,1111.3000000,0.0000000,"
    + "0.0000000,0.0000000,0.0000000,1234.5000000)")

def test_qlib_matrix_equals(mat_obj, mat_obj2):
    v = mat_obj
    v.setAt(1, 1, 10.2)
    v.setAt(2, 2, 100.1)
    v.setAt(3, 3, 1111.3)
    v.setAt(4, 4, 1234.5)

    v2 = mat_obj2
    assert v.equals(v2)

def test_qlib_matrix_scale(mat_obj2):
    v = mat_obj2.scale(2.0)
    
    assert v.getAt(1, 1) == 10.2 * 2
    assert v.getAt(2, 2) == 100.1 * 2
    assert v.getAt(3, 3) == 1111.3 * 2
    assert v.getAt(4, 4) == 1234.5 * 2

def test_qlib_matrix_divide(mat_obj2):
    v = mat_obj2.divide(2.0)
    
    assert v.getAt(1, 1) == 10.2 / 2
    assert v.getAt(2, 2) == 100.1 / 2
    assert v.getAt(3, 3) == 1111.3 / 2
    assert v.getAt(4, 4) == 1234.5 / 2
    
