import cuemol
import cuemol.fileio as fileio
import cuemol.renderer as renderer
from cuemol.internal_loader import import_internal

ci = import_internal()


def bgcolor(aCol):
    """
    Set scene's background color
    """
    sc = cuemol.scene()
    col = aCol
    if isinstance(aCol, str):
        col = cuemol.col(aCol, sc.uid)
    sc.bgcolor = col


def get(aObj, aName):
    """
    Get renderer property
    """
    obj = cuemol.rend(aObj)
    if obj is None:
        raise Exception("renderer not found: " + aObj)

    return ci.getProp(obj._wrapped, aName)


def set(aObj, aName, aVal):
    """
    Set renderer property
    """
    obj = cuemol.rend(aObj)
    if obj is None:
        raise Exception("renderer not found: " + aObj)

    v = aVal
    if cuemol.iswrapper(v):
        v = aVal._wrapped
    ci.setProp(obj._wrapped, aName, v)
    # obj.__setattr__(aProp, aVal)


def reset(aObj, aName):
    """
    Reset property to default value
    """
    obj = cuemol.rend(aObj)
    if obj is None:
        raise Exception("renderer not found: " + aObj)

    ci.resetProp(obj._wrapped, aName)


# delete object/renderer
def delete(aObj, aType=None):
    tgt = None
    if cuemol.iswrapper(aObj):
        tgt = aObj
    else:
        # try renderer name/uid
        try:
            tgt = cuemol.rend(aObj)
        except Exception:
            pass

        # try object name/uid
        if tgt is None:
            try:
                tgt = cuemol.obj(aObj)
            except Exception:
                return False

    if cuemol.isobj(tgt):
        sc = tgt.getScene()
        sc.destroyObject(tgt.uid)
        return True
    elif cuemol.isrend(tgt):
        obj = tgt.getClientObj()
        obj.destroyRenderer(tgt.uid)
        return True

    return False


#    raise RuntimeError("rm: object not found, "+str(aObj))


def load(aFileName, aName=None, aFmt=None, aScene=None, aOpts=None):

    gelem, gname, comp = fileio.guessFormatFromFname(aFileName, aFmt)

    print("guessed format: ", gelem)
    print("guessed objname: " + gname)
    print("guessed comp mode: " + comp)

    name = aName
    if name is None:
        name = gname

    ncat = gelem["category"]

    if ncat == 0:
        obj = fileio.loadObject(aFileName, name, aScene, gelem["name"], aOpts)
        renderer.setupDefaultRenderer(obj)
        return obj

    elif ncat == 3:
        return fileio.loadScene(aFileName, name, aScene, gelem["name"], aOpts)
    else:
        # Unknown category ID, throw exception here
        raise RuntimeError("Unknown category ID " + str(ncat))
