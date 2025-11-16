import cuemol


def test_color_proof(create_scene):
    scene = create_scene

    scene.use_colproof = True
    scene.icc_filename = "GenericCMYK.icm"

    # white should be in gamut in CMYK space
    white = cuemol.col("#FFF", scene)
    scode = f"{white.getDevCode(scene.uid) & 0xFFFFFF:06X}"
    assert scode == "F2F3FA"
    assert white.isInGamut(scene.uid)

    # gray should be in gamut in CMYK space
    gray = cuemol.col("#777", scene)
    scode = f"{gray.getDevCode(scene.uid) & 0xFFFFFF:06X}"
    assert scode == "767578"
    assert gray.isInGamut(scene.uid)

    # blue should be out of gamut in CMYK space
    blue = cuemol.col("#00F", scene)
    scode = f"{blue.getDevCode(scene.uid) & 0xFFFFFF:06X}"
    assert scode == "345BA0"
    assert not blue.isInGamut(scene.uid)

    # magenta should be out of gamut in CMYK space
    magenta = cuemol.col("#F0F", scene)
    scode = f"{magenta.getDevCode(scene.uid) & 0xFFFFFF:06X}"
    assert scode == "B469A4"
    assert not magenta.isInGamut(scene.uid)
    
