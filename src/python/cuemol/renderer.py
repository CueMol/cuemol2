"""
Renderer related utility
"""

import cuemol as cm
from cuemol.internal_loader import import_internal

ci = import_internal()


def setupDefaultRenderer(obj):
    """
    Setup default renderer for object loaded by CUI's load() function
    """

    rend = None
    scene = obj.getScene()

    with cm.UndoTxn("Create default renderer", scene):
        rend = obj.createRenderer("simple")
        rend.applyStyles("DefaultCPKColoring")
        rend.name = "simple1"
        rend.sel = cm.sel("*")
        print("active view ID=" + str(scene.activeViewID))
        view = cm.view(scene)
        if view is None:
            print("setupDefault renderer: view is null, cannot recenter")
        else:
            pos = rend.getCenter()
            view.setViewCenter(pos)

    return rend


def create_default_paint_coloring():
    rval = cm.createObj("PaintColoring")
    rval.append(cm.sel("sheet"), cm.col("SteelBlue"))
    rval.append(cm.sel("helix"), cm.col("khaki"))
    rval.append(cm.sel("nucleic"), cm.col("yellow"))
    rval.append(cm.sel("*"), cm.col("FloralWhite"))
    return rval


def set_default_styles(rend):

    rend_type = rend.type_name

    if rend_type == "tube" or rend_type == "spline":
        rend.applyStyles("DefaultHSCPaint")
    elif rend_type == "ribbon":
        rend.applyStyles("DefaultRibbon,DefaultHSCPaint")
    elif rend_type == "cartoon":
        rend.applyStyles("DefaultCartoon,DefaultHSCPaint")
    elif rend_type == "nucl":
        rend.applyStyles("DefaultNucl")
    elif rend_type == "anisou":
        rend.applyStyles("DefaultAnIsoU,DefaultCPKColoring")
    elif rend_type == "ballstick":
        rend.applyStyles("DefaultBallStick,DefaultCPKColoring")
    elif rend_type == "cpk":
        rend.applyStyles("DefaultCPK,DefaultCPKColoring")
    elif rend_type == "contour":
        rend.applyStyles("DefaultContour")
    elif rend_type == "isosurf":
        rend.applyStyles("DefaultIsoSurf")
    elif "coloring" in rend:
        rend.applyStyles("DefaultCPKColoring")


def create_renderer(obj, rend_type, rend_name=None):
    """
    Create & Apply default setting to the created renderer
    """
    rend = obj.createRenderer(rend_type)
    if rend_name is not None:
        rend.name = rend_name

    # mol_postproc(sc, obj, rend)
    obj.coloring = create_default_paint_coloring()

    set_default_styles(rend)

    return rend
