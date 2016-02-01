import sys, traceback, re, os

import cuemol

from . import util

def bg_color(colstr, scene=None):
    scMgr = cuemol.getService("SceneManager")
    if scene is None:
        scene = scMgr.getActiveScene()

    col = util.makecol(colstr)
    if col is None:
        # TO DO: report error
        return

    ## EDIT TXN START ##
    scene.startUndoTxn("Change bg color")
    try:
        scene.bgcolor = col
    except:
        print("bg_color error")
        msg = traceback.format_exc()
        print(msg)
        scene.rollbackUndoTxn()
        return
    else:
        scene.commitUndoTxn()
        ## EDIT TXN END ##

def undo(scene=None):
    scMgr = cuemol.getService("SceneManager")
    if scene is None:
        scene = scMgr.getActiveScene()
    scene.undo(0)
    
def redo(scene=None):
    scMgr = cuemol.getService("SceneManager")
    if scene is None:
        scene = scMgr.getActiveScene()
    scene.redo(0)

def current(rend_name=None):
    scMgr = cuemol.getService("SceneManager")
    scene = scMgr.getActiveScene()

    curr_rendid = scene.activeRendID

    if rend_name is None:
        # print current renderer
        if curr_rendid==0:
            cuemol.printlog("No current renderer")
            return

        rend = scMgr.getRenderer(curr_rendid)
        if rend is None:
            msg = "Invalid current renderer (ID="+str(curr_rendid)+")"
            cuemol.printlog(msg)
            return

        obj = rend.getClientObj()
        cuemol.printlog("Current renderer:")
        cuemol.printlog("  id="+str(curr_rendid))
        cuemol.printlog("  name="+rend.name+" ("+rend.type_name+")")
        cuemol.printlog("  Object="+obj.name+" ("+cuemol.getClassName(obj)+")")
        return
    else:
        # set current renderer
        rend = scene.getRendByName(rend_name)
        if rend is None:
            cuemol.printlog("Error, renderer name="+rend_name+" is not found.")
            return;

        scene.activeRendID = rend.uid
        cuemol.printlog("Current renderer is changed to "+rend_name+" ("+rend.type_name+")")

    return

