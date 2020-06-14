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

@pytest.fixture
def vec_obj1234():
    return cuemol.vec(1, 2, 3, 4)

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

    for i in range(1, 5):
        for j in range(1, 5):
            if i != j:
                assert v.getAt(i, j) == 0

def test_qlib_matrix_divide(mat_obj2):
    v = mat_obj2.divide(2.0)
    
    assert v.getAt(1, 1) == 10.2 / 2
    assert v.getAt(2, 2) == 100.1 / 2
    assert v.getAt(3, 3) == 1111.3 / 2
    assert v.getAt(4, 4) == 1234.5 / 2
    
    for i in range(1, 5):
        for j in range(1, 5):
            if i != j:
                assert v.getAt(i, j) == 0

def test_qlib_matrix_add(mat_obj, mat_obj2):
    v = mat_obj.add(mat_obj2)
    assert v.getAt(1, 1) == 10.2 + 1
    assert v.getAt(2, 2) == 100.1 + 1
    assert v.getAt(3, 3) == 1111.3 + 1
    assert v.getAt(4, 4) == 1234.5 + 1
    for i in range(1, 5):
        for j in range(1, 5):
            if i != j:
                assert v.getAt(i, j) == 0
    
def test_qlib_matrix_sub(mat_obj, mat_obj2):
    v = mat_obj2.sub(mat_obj)
    assert v.getAt(1, 1) == 10.2 - 1
    assert v.getAt(2, 2) == 100.1 - 1
    assert v.getAt(3, 3) == 1111.3 - 1
    assert v.getAt(4, 4) == 1234.5 - 1
    for i in range(1, 5):
        for j in range(1, 5):
            if i != j:
                assert v.getAt(i, j) == 0
    
def test_qlib_matrix_mul(mat_obj, mat_obj2):
    v = mat_obj.mul(mat_obj2)
    assert v.getAt(1, 1) == 10.2
    assert v.getAt(2, 2) == 100.1
    assert v.getAt(3, 3) == 1111.3
    assert v.getAt(4, 4) == 1234.5
    for i in range(1, 5):
        for j in range(1, 5):
            if i != j:
                assert v.getAt(i, j) == 0

def test_qlib_matrix_mulvec(mat_obj2, vec_obj1234):
    v = mat_obj2.mulvec(vec_obj1234)
    assert v.x == 10.2 * 1
    assert v.y == 100.1 * 2
    assert v.z == 1111.3 * 3
    assert v.w == 1234.5 * 4

def test_qlib_matrix_setident(mat_obj2):
    v = mat_obj2
    v.setIdent()
    for i in range(1, 5):
        for j in range(1, 5):
            if i != j:
                assert v.getAt(i, j) == 0
            else:
                assert v.getAt(i, j) == 1

def test_qlib_matrix_setrotate(mat_obj):
    cen = cuemol.vec(1, 1, 1)
    ax = cuemol.vec(1, 1, 1).normalize()
    mat_obj.setRotate(cen, ax, 60.0)

    assert mat_obj.getAt(1, 1) == pytest.approx(0.6666667)
    assert mat_obj.getAt(2, 1) == pytest.approx(-0.3333333)
    assert mat_obj.getAt(3, 1) == pytest.approx(0.6666667)
    assert mat_obj.getAt(4, 1) == pytest.approx(0)

    assert mat_obj.getAt(1, 2) == pytest.approx(0.6666667)
    assert mat_obj.getAt(2, 2) == pytest.approx(0.6666667)
    assert mat_obj.getAt(3, 2) == pytest.approx(-0.3333333)
    assert mat_obj.getAt(4, 2) == pytest.approx(0)

    assert mat_obj.getAt(1, 3) == pytest.approx(-0.3333333)
    assert mat_obj.getAt(2, 3) == pytest.approx(0.6666667)
    assert mat_obj.getAt(3, 3) == pytest.approx(0.6666667)
    assert mat_obj.getAt(4, 3) == pytest.approx(0)

    assert mat_obj.getAt(1, 4) == pytest.approx(0)
    assert mat_obj.getAt(2, 4) == pytest.approx(0)
    assert mat_obj.getAt(3, 4) == pytest.approx(0)
    assert mat_obj.getAt(4, 4) == pytest.approx(1)

def test_qlib_matrix_settranslate(mat_obj):
    v = mat_obj
    cen = cuemol.vec(1, 1, 1)
    v.setTranslate(cen)
    for i in range(1, 5):
        for j in range(1, 5):
            if i == j:
                assert v.getAt(i, j) == 1
            elif j == 4:
                assert v.getAt(i, j) == 1
            else:
                assert v.getAt(i, j) == 0

def test_qlib_matrix_isident(mat_obj):
    assert mat_obj.isIdent()

def test_qlib_matrix_setzero(mat_obj):
    mat_obj.setZero()
    for i in range(1, 5):
        for j in range(1, 5):
            assert mat_obj.getAt(i, j) == 0

def test_qlib_matrix_iszero(mat_obj):
    mat_obj.setZero()
    assert mat_obj.isZero()

def test_qlib_matrix_diag3(mat_obj2):
    v = mat_obj2.diag3()

    assert v.getAt(1, 1) == pytest.approx(1)
    assert v.getAt(2, 1) == pytest.approx(0)
    assert v.getAt(3, 1) == pytest.approx(0)
    assert v.getAt(4, 1) == pytest.approx(10.2)

    assert v.getAt(1, 2) == pytest.approx(0)
    assert v.getAt(2, 2) == pytest.approx(1)
    assert v.getAt(3, 2) == pytest.approx(0)
    assert v.getAt(4, 2) == pytest.approx(100.1)

    assert v.getAt(1, 3) == pytest.approx(0)
    assert v.getAt(2, 3) == pytest.approx(0)
    assert v.getAt(3, 3) == pytest.approx(1)
    assert v.getAt(4, 3) == pytest.approx(1111.3)
