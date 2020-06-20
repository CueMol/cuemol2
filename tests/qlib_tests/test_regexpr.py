import cuemol

def test_qlib_regexpr_setup():
    re = cuemol.createObj("RegExpr")
    re.setup("(\\d+)")
    assert re.p == "(\\d+)"

def test_qlib_regexpr_match():
    re = cuemol.createObj("RegExpr")
    re.setup("(\\d+)")
    assert re.match("123 45")

# def test_qlib_regexpr_setup_invalid():
#     re = cuemol.createObj("RegExpr")
#     re.setup("(\\d+))")
#     assert re.match("123 45")

