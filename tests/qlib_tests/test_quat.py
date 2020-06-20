import math
import pytest
import cuemol

@pytest.fixture
def quat_obj():
    return cuemol.createObj("Quat")

@pytest.fixture
def quat_obj1234():
    q = cuemol.createObj("Quat")
    q.x = 1.0
    q.y = 2.0
    q.z = 3.0
    q.a = 4.0
    return q

def test_qlib_quat_props(quat_obj):
    v = quat_obj
    v.x = 10.2
    v.y = 100.1
    v.z = 1111.3
    v.a = 1234.5

    assert v.x == 10.2
    assert v.y == 100.1
    assert v.z == 1111.3
    assert v.a == 1234.5
    
def test_qlib_quat_toString(quat_obj):
    assert quat_obj.toString() == "(0,0,0,0)"

def test_qlib_quat_init(quat_obj):
    v = quat_obj
    assert v.x == 0.0
    assert v.y == 0.0
    assert v.z == 0.0
    assert v.a == 0.0

    (v.x, v.y, v.z, v.a) = (1.0, 2.3, 4.5, 14.5)
    assert v.x == 1.0
    assert v.y == 2.3
    assert v.z == 4.5
    assert v.a == 14.5
    
def test_qlib_quat_equals(quat_obj):
    v2 = cuemol.createObj("Quat")
    assert quat_obj.equals(v2)

def test_qlib_quat_sqlen(quat_obj1234):
    assert quat_obj1234.sqlen() == 1 + 2*2 + 3*3 + 4*4

def test_qlib_quat_scale(quat_obj1234):
    v = quat_obj1234.scale(2)
    assert v.x == 2
    assert v.y == 4
    assert v.z == 6
    assert v.a == 8

def test_qlib_quat_divide(quat_obj1234):
    v = quat_obj1234.divide(2)
    assert v.x == 0.5
    assert v.y == 1
    assert v.z == 1.5
    assert v.a == 2

def test_qlib_quat_normalize(quat_obj1234):
    v = quat_obj1234.normalize()
    assert v.x == 1 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert v.y == 2 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert v.z == 3 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert v.a == 4 / math.sqrt(1 + 2*2 + 3*3 + 4*4)

def test_qlib_quat_conjugate(quat_obj1234):
    v = quat_obj1234.conjugate()
    assert v.x == -1
    assert v.y == -2
    assert v.z == -3
    assert v.a == 4

def test_qlib_quat_normalizeself(quat_obj1234):
    v = quat_obj1234.normalizeSelf()
    assert v == None
    assert quat_obj1234.x == 1 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert quat_obj1234.y == 2 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert quat_obj1234.z == 3 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    assert quat_obj1234.a == 4 / math.sqrt(1 + 2*2 + 3*3 + 4*4)
    
def test_qlib_quat_mul(quat_obj, quat_obj1234):
    quat_obj.x, quat_obj.y, quat_obj.z, quat_obj.a = 1, 1, 1, 1
    v = quat_obj1234.mul(quat_obj)
    assert v.x == 4
    assert v.y == 8
    assert v.z == 6
    assert v.a == -2

def test_qlib_quat_rotate(quat_obj):
    quat_obj.x, quat_obj.y, quat_obj.z, quat_obj.a = 0, 0, 0, 1
    q = quat_obj.rotateX(180.0)
    assert q.x == pytest.approx(1)
    assert q.y == pytest.approx(0)
    assert q.z == pytest.approx(0)
    assert q.a == pytest.approx(0)

    q = quat_obj.rotateY(180.0)
    assert q.x == pytest.approx(0)
    assert q.y == pytest.approx(1)
    assert q.z == pytest.approx(0)
    assert q.a == pytest.approx(0)

    q = quat_obj.rotateZ(180.0)
    assert q.x == pytest.approx(0)
    assert q.y == pytest.approx(0)
    assert q.z == pytest.approx(1)
    assert q.a == pytest.approx(0)

def test_qlib_quat_tomatrix(quat_obj):
    quat_obj.x, quat_obj.y, quat_obj.z, quat_obj.a = 0, 0, 0, 1
    m = quat_obj.toMatrix()
    assert m.isIdent()
