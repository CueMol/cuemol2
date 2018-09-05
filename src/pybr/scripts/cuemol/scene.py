import sys, traceback, re, os

import cuemol_internal as ci
import cuemol as cm
import util

def bg_color(colstr, aScene=None):
    scene = cm.scene(aScene)

    col = cm.col(colstr)
    if col is None:
        # TO DO: report error
        return

    with util.UndoTxn("Change background color", scene):
        scene.bgcolor = col


def undo(aScene=None):
    scene = cm.scene(aScene)
    scene.undo(0)
    
def redo(aScene=None):
    scene = cm.scene(aScene)
    scene.redo(0)

def current(rend_name=None, aScene=None):
    scMgr = cm.svc("SceneManager")
    scene = cm.scene(aScene)

    curr_rendid = scene.activeRendID

    if rend_name is None:
        # print current renderer
        if curr_rendid==0:
            cm.println("No current renderer")
            return

        rend = scMgr.getRenderer(curr_rendid)
        if rend is None:
            msg = "Invalid current renderer (ID="+str(curr_rendid)+")"
            cm.println(msg)
            return

        obj = rend.getClientObj()
        cm.println("Current renderer:")
        cm.println("  id="+str(curr_rendid))
        cm.println("  name="+rend.name+" ("+rend.type_name+")")
        cm.println("  Object="+obj.name+" ("+ci.getClassName(obj)+")")
        return
    else:
        # set current renderer
        rend = scene.getRendByName(rend_name)
        if rend is None:
            cm.println("Error, renderer name="+rend_name+" is not found.")
            return;

        scene.activeRendID = rend.uid
        cm.println("Current renderer is changed to "+rend_name+" ("+rend.type_name+")")

    return

