import sys, traceback,os

import cuemol

def makesel(selstr, uid=None):
    selobj = cuemol.createObj("SelCommand")
    if not uid is None:
        if not selobj.compile(selstr, uid):
            return None
    else:
        if not selobj.compile(selstr, 0):
            return None
    return selobj
    

def makecolor(colstr, uid=None):
    stylem = cuemol.getService("StyleManager")
    color = None
    if uid:
        color = stylem.compileColor(colstr, uid)
    else:
        color = stylem.compileColor(str, 0)
    
    return color;

