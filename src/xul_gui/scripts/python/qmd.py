import sys, traceback,os

import cuemol
import cuemol_internal

def bgcolor(aCol):
    sc = cuemol.scene()
    col = aCol
    if isinstance(aCol, str):
        col = cuemol.col(aCol, sc.uid)
    sc.bgcolor = col


def set(aObj, aName, aVal):
    obj = cuemol.rend(aObj)
    if obj==None:
        raise Exception("renderer not found: "+aObj)
    
    cuemol_internal.setProp(obj, aName, aVal)
    #obj.__setattr__(aProp, aVal)

def reset(aObj, aName):
    obj = cuemol.rend(aObj)
    if obj==None:
        raise Exception("renderer not found: "+aObj)
    
    cuemol_internal.resetProp(obj, aName)

