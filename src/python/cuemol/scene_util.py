from pathlib import Path

import cuemol as cm
from cuemol.internal_loader import import_internal

ci = import_internal()


def bg_color(colstr, aScene=None):
    scene = cm.scene(aScene)

    col = cm.col(colstr)
    if col is None:
        # TO DO: report error
        return

    with cm.UndoTxn("Change background color", scene):
        scene.bgcolor = col


def get_scene_ids():
    mgr = cm.sceMgr()
    idstr = mgr.getSceneUIDList()
    if idstr == "":
        return list()
    res = map(int, idstr.split(","))
    return list(res)


def get_scenes():
    mgr = cm.sceMgr()
    res = map(lambda x: mgr.getScene(x), get_scene_ids())
    return list(res)


def del_scene(scene):
    if scene is None:
        raise RuntimeError("scene is None")
    s = cm.scene(scene)
    mgr = cm.sceMgr()
    mgr.destroyScene(s.uid)


def del_all_scenes():
    mgr = cm.sceMgr()
    mgr.destroyAllScenes()


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
        if curr_rendid == 0:
            cm.println("No current renderer")
            return

        rend = scMgr.getRenderer(curr_rendid)
        if rend is None:
            msg = "Invalid current renderer (ID=" + str(curr_rendid) + ")"
            cm.println(msg)
            return

        obj = rend.getClientObj()
        cm.println("Current renderer:")
        cm.println("  id=" + str(curr_rendid))
        cm.println("  name=" + rend.name + " (" + rend.type_name + ")")
        cm.println("  Object=" + obj.name + " (" + ci.getClassName(obj) + ")")
        return
    else:
        # set current renderer
        rend = scene.getRendByName(rend_name)
        if rend is None:
            cm.println("Error, renderer name=" + rend_name + " is not found.")
            return

        scene.activeRendID = rend.uid
        cm.println("Current renderer is changed to " + rend_name + " (" + rend.type_name + ")")

    return


def load_camera_file(scene, file_name, name=None, view=None):
    path = Path(file_name)
    if name is None:
        name = str(path.name)

    newcam = scene.loadCamera(str(path))
    scene.setCamera(name, newcam)
    if view is None:
        vid = scene.activeViewID
    else:
        vid = view.uid

    scene.loadViewFromCam(vid, name)

    return newcam
