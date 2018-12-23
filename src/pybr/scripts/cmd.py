import sys, traceback,os

import cuemol
import cuemol_internal
import cuemol.fileio

# set scene's background color
def bgcolor(aCol):
    sc = cuemol.scene()
    col = aCol
    if isinstance(aCol, str):
        col = cuemol.col(aCol, sc.uid)
    sc.bgcolor = col


# set property
def set(aObj, aName, aVal):
    obj = cuemol.rend(aObj)
    if obj==None:
        raise Exception("renderer not found: "+aObj)
    
    cuemol_internal.setProp(obj, aName, aVal)
    #obj.__setattr__(aProp, aVal)

# reset property to default value
def reset(aObj, aName):
    obj = cuemol.rend(aObj)
    if obj==None:
        raise Exception("renderer not found: "+aObj)
    
    cuemol_internal.resetProp(obj, aName)

# delete object/renderer
def delete(aObj, aType=None):
    tgt = None
    if cuemol.iswrapper(aObj):
        tgt = aObj
    else:
        # try renderer name/uid
        try:
            tgt = cuemol.rend(aObj)
        except:
            pass

        # try object name/uid
        if tgt==None:
            try:
                tgt = cuemol.obj(aObj)
            except:
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
    print("guessed objname: "+gname)
    print("guessed comp mode: "+comp)

    name = aName
    if name is None:
        name = gname

    ncat = gelem["category"]

    if ncat == 0:
        return fileio.loadObject(aFileName, name, aScene, gelem["name"], aOpts)
        # _setupDefaultRenderer(obj)
        
    elif ncat == 3:
        return fileio.loadScene(aFileName, name, aScene, gelem["name"], aOpts)
    else:
        # Unknown category ID, throw exception here
        raise RuntimeError("Unknown category ID "+str(ncat))

