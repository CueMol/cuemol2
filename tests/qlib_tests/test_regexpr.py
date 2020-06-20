import pytest
import cuemol

def test_qlib_regexpr_setup():
    re = cuemol.createObj("RegExpr")
    re.setup("(\\d+)")
    assert re.p == "(\\d+)"
    assert re.toString() == "(\\d+)"

def test_qlib_regexpr_prop():
    re = cuemol.createObj("RegExpr")
    re.p = "(\\d+)"
    assert re.p == "(\\d+)"
    assert re.toString() == "(\\d+)"
    assert re.match("123 45")

def test_qlib_regexpr_match():
    re = cuemol.createObj("RegExpr")
    re.setup("(\\d+)")
    assert re.match("123 45")

    print(f"re.s: {re.s}")
    print(f"re.toString(): {re.toString()}")
    assert re.s == "123 45"
    assert re.size() == 2
    assert re.at(0) == "123"
    assert re.at(1) == "123"

    with pytest.raises(RuntimeError):
        re.at(2)

def test_qlib_regexpr_setup_invalid():
    re = cuemol.createObj("RegExpr")
    re.setup("(\\d+))")
    with pytest.raises(RuntimeError):
        re.match("123 45")

def test_qlib_regexpr_at():
    re = cuemol.createObj("RegExpr")
    re.setup("(\\d+)")
    assert re.match("123 45")
