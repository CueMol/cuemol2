import sys, traceback,os

import cuemol
import cuemol_internal

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

# remove object/renderer
def rm(aObj):
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
                return

    if cuemol.isobj(tgt):
        sc = tgt.getScene()
        sc.destroyObject(tgt.uid)
        return
    elif cuemol.isrend(tgt):
        obj = tgt.getClientObj()
        obj.destroyRenderer(tgt.uid)
        return

    return
#    raise RuntimeError("rm: object not found, "+str(aObj))

