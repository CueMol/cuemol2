import pytest
import cuemol

@pytest.fixture
def rangeset_obj():
    return cuemol.createObj("RangeSet")

def test_qlib_rangeset_appendint(rangeset_obj):
    r = rangeset_obj.appendInt(1, 10)
    assert rangeset_obj.toString() == ""
    assert r.toString() == "1:9"

    r = r.appendInt(100, 110)
    assert r.toString() == "1:9,100:109"

def test_qlib_rangeset_append(rangeset_obj):
    r2 = rangeset_obj.appendInt(1, 10)
    r = rangeset_obj.append(r2)
    assert r.toString() == "1:9"

def test_qlib_rangeset_removeint(rangeset_obj):
    r = rangeset_obj.appendInt(1, 10)
    r = r.removeInt(5, 8)
    assert r.toString() == "1:4,8:9"
    
def test_qlib_rangeset_remove(rangeset_obj):
    r = rangeset_obj.appendInt(1, 10)
    r2 = rangeset_obj.appendInt(5, 8)
    r = r.remove(r2)
    assert r.toString() == "1:4,8:9"

def test_qlib_rangeset_negate(rangeset_obj):
    r = rangeset_obj.appendInt(1, 10)
    r = r.negate()
    assert r.toString() == "-2147483648:0,10:2147483646"

def test_qlib_rangeset_containsint(rangeset_obj):
    r = rangeset_obj.appendInt(1, 10)
    assert r.containsInt(2, 4)
    assert not r.containsInt(7, 11)
    
def test_qlib_rangeset_fromstring(rangeset_obj):
    rangeset_obj.fromString("1:4,10:100,300:500")
    assert rangeset_obj.toString() == "1:4,10:100,300:500"
    assert rangeset_obj.containsInt(350, 370)

def test_qlib_rangeset_clear(rangeset_obj):
    rangeset_obj.fromString("1:4,10:100,300:500")
    rangeset_obj.clear()
    assert rangeset_obj.isEmpty()
