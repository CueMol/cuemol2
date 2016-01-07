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

