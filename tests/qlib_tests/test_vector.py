import math
import pytest
import cuemol

@pytest.fixture
def vec_obj():
    return cuemol.createObj("Vector")

@pytest.fixture
def vec_obj123():
    return cuemol.vec(1, 2, 3)

@pytest.fixture
def vec_obj1234():
    return cuemol.vec(1, 2, 3, 4)

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
    
def test_qlib_vector_strvalue(vec_obj):
    assert vec_obj.strvalue == "(0,0,0)"
    vec_obj.strvalue = "(1, 2, 3.14)"
    assert vec_obj.strvalue == "(1,2,3.14)"

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
    
def test_qlib_vector_toString(vec_obj):
    assert vec_obj.toString() == "(0,0,0)"

def test_qlib_vector_equals(vec_obj):
    v2 = cuemol.vec(0, 0, 0)
    assert vec_obj.equals(v2)

def test_qlib_vector_isZero(vec_obj):
    assert vec_obj.isZero()

def test_qlib_vector_sqlen(vec_obj1234):
    assert vec_obj1234.sqlen() == 1 + 2*2 + 3*3 + 4*4

def test_qlib_vector_length(vec_obj1234):
    assert vec_obj1234.length() == math.sqrt(1 + 2*2 + 3*3 + 4*4)

def test_qlib_vector_scale(vec_obj1234):
    v = vec_obj1234.scale(2)
    assert v.x == 2
    assert v.y == 4
    assert v.z == 6
    assert v.w == 8

def test_qlib_vector_divide(vec_obj1234):
    v = vec_obj1234.divide(2)
    assert v.x == 0.5
    assert v.y == 1
    assert v.z == 1.5
    assert v.w == 2

def test_qlib_vector_normalize(vec_obj1234):
    v = vec_obj1234.normalize()
    assert v.x == 1 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert v.y == 2 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert v.z == 3 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert v.w == 4 / math.sqrt(1 + 2*2 + 3*3 + 4*4)

def test_qlib_vector_cross(vec_obj123):
    v = vec_obj123.cross(cuemol.vec(1,1,1,1))
    assert v.x == -1
    assert v.y == 2
    assert v.z == -1
    assert v.w == 0

def test_qlib_vector_dot(vec_obj1234):
    v = vec_obj1234.dot(cuemol.vec(1,1,1,1))
    assert v == 1 + 2 + 3 + 4

def test_qlib_vector_angle(vec_obj123):
    v = vec_obj123.angle(cuemol.vec(1,1,1))
    assert v == pytest.approx(0.3875966866551805)

def test_qlib_vector_zero(vec_obj1234):
    vec_obj1234.zero()
    assert vec_obj1234.x == 0
    assert vec_obj1234.y == 0
    assert vec_obj1234.z == 0
    assert vec_obj1234.w == 0

def test_qlib_vector_add():
    v1 = cuemol.vec(1, 2, 3, 4)
    v2 = cuemol.vec(1, 2, 3, 4)
    v = v1.add(v2)
    assert v.x == 2
    assert v.y == 4
    assert v.z == 6
    assert v.w == 8

def test_qlib_vector_sub():
    v1 = cuemol.vec(1, 2, 3, 4)
    v2 = cuemol.vec(1, 2, 3, 4)
    v = v1.sub(v2)
    assert v.isZero()
