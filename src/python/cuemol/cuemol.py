"""
CueMol utility functions
"""

import importlib

from cuemol.internal_loader import import_internal
from cuemol.wrapper_base import WrapperBase

__all__ = [
    "getWrpClass",
    "createWrapper",
    "conv_dict_arg",
    "createObj",
    "getService",
    "println",
    "iswrapper",
    "isimpl",
    "isscene",
    "isview",
    "isobj",
    "isrend",
    "issel",
    "iscol",
    "scene",
    "view",
    "createScene",
    "svc",
    "obj",
    "rend",
    "sceMgr",
    "strMgr",
    "vec",
    "sel",
    "col",
    "timeval",
    "copy",
    "UndoTxn",
    "txn",
]

ci = import_internal()

##########


def getWrpClass(clsnm):
    """Get wrapper class for class clsnm.

    Args:
        clsnm (str): Class name to get the wrapper.
    Returns:
        class: class object of the wrapper.
    """
    try_names = [f"cuemol.wrappers.{clsnm}", f"wrappers.{clsnm}"]
    for modnm in try_names:
        # modnm = "cuemol.wrappers."+clsnm
        try:
            m = importlib.import_module(modnm)
        except ImportError:
            continue
        cls = m.__dict__[clsnm]
        return cls


def createWrapper(obj):
    if obj is None:
        return None
    if type(obj) == ci.Wrapper:
        # obj is an internal wrapper obj
        # print("createWrapper obj:",obj)
        clsnm = ci.getClassName(obj)
        cls = getWrpClass(clsnm)
        wr = cls(obj)
        return wr
    elif type(obj) == dict:
        for k, v in obj.items():
            obj[k] = createWrapper(v)
        return obj
    elif type(obj) == list:
        for k, v in enumerate(obj):
            obj[k] = createWrapper(v)
        return obj
    else:
        return obj


def conv_dict_arg(d):
    assert type(d) == dict
    result = {}
    for k, v in d.items():
        if iswrapper(v):
            result[k] = v._wrapped
        else:
            result[k] = v
    return result


def createObj(name):
    return createWrapper(ci.createObj(name))


def getService(name):
    return createWrapper(ci.getService(name))


# def print(astr):
#     return ci.print(astr)


def println(astr):
    return ci.print(astr + "\n")


##########


def iswrapper(aObj):
    return isinstance(aObj, WrapperBase)


def isimpl(aObj, aIfName):
    return isinstance(aObj, getWrpClass(aIfName))


def isscene(aObj):
    return isimpl(aObj, "Scene")


def isview(aObj):
    return isimpl(aObj, "View")


def isobj(aObj):
    return isimpl(aObj, "Object")


def isrend(aObj):
    return isimpl(aObj, "Renderer")


def issel(aObj):
    return isimpl(aObj, "MolSelection")


def iscol(aObj):
    return isimpl(aObj, "AbstractColor")


##########


def scene(aScene=None):
    if isscene(aScene):
        return aScene

    mgr = sceMgr()
    scid = None
    if aScene is None:
        sstr = mgr.getSceneUIDList()
        if sstr == "":
            # No scene exists
            # --> Create default scene
            return createScene()
        scid = mgr.activeSceneID
        if scid == 0:
            raise RuntimeError("Active scene ID is not defined!!")
    elif isinstance(aScene, int):
        scid = aScene
    else:
        raise RuntimeError("scene " + str(aScene) + " not found")

    return mgr.getScene(scid)


def view(aScene=None, aView=None):
    sce = scene(aScene)

    if isview(aView):
        return aView

    mgr = sceMgr()
    vwid = None

    if aView is None:
        if sce.getViewCount() == 0:
            # No scene exists
            # --> Create default view & set as active
            vw = sce.createView()
            sce.setActiveViewID(vw.uid)
            return vw

        # Get active view (from sce)
        vwid = sce.activeViewID
        if vwid == 0:
            return None
            # raise RuntimeError("Active view ID is not defined in scene: "+str(sce))
    elif isinstance(aView, int):
        # Get view obj from Integer View ID
        vwid = aView
    else:
        return None
        # raise RuntimeError("view "+str(aView)+" not found")

    return mgr.getView(vwid)


def createScene():
    mgr = sceMgr()
    scene = mgr.createScene()
    # set created scene as the active scene
    mgr.setActiveSceneID(scene.uid)
    return scene


def svc(name):
    return getService(name)


def obj(aName, aScene=None):
    if isobj(aName):
        return aName

    sc = scene(aScene)

    obj = None
    if isinstance(aName, str):
        obj = sc.getObjectByName(aName)
    elif isinstance(aName, int):
        obj = sc.getObject(aName)

    if obj is None:
        raise RuntimeError("object " + str(aName) + " not found")

    return obj


def rend(aRend, aObj=None):
    if isrend(aRend):
        return aRend

    rend = None

    if aObj is None:
        s = scene()
        if isinstance(aRend, str):
            rend = s.getRendByName(aRend)
        elif isinstance(aRend, int):
            rend = o.getRenderer(aRend)

    else:
        o = obj(aObj)
        if isinstance(aRend, str):
            rend = o.getRendererByName(aRend)
        elif isinstance(aRend, int):
            rend = o.getRenderer(aRend)

    if rend is None:
        raise RuntimeError("renderer " + str(aRend) + " not found")

    return rend


##########


def sceMgr():
    return getService("SceneManager")


def strMgr():
    return getService("StreamManager")


def vec(aX, aY, aZ, *args):
    v = createObj("Vector")
    v.x = aX
    v.y = aY
    v.z = aZ
    if len(args) == 1:
        v.w = args[0]
    elif len(args) > 1:
        raise RuntimeError("too many args for vec()")
    return v


def sel(aSelStr, aScene=None):
    if issel(aSelStr):
        return aSelStr
    s = scene(aScene)
    # print("sel> scene="+str(s)+"\n")
    selobj = createObj("SelCommand")
    if selobj.compile(aSelStr, s.uid):
        return selobj
    else:
        # compile failed
        raise RuntimeError(selobj.error_msg)


def col(aColStr, aScene=None):
    if iscol(aColStr):
        return aColStr
    s = scene(aScene)
    stylem = getService("StyleManager")
    color = stylem.compileColor(aColStr, s.uid)
    return color


def timeval(aMilli):
    tv = createObj("TimeValue")
    tv.millisec = aMilli
    return tv


##########


def copy(aObj, aNewObjName):
    objin = obj(aObj)
    s = objin.getScene()
    sm = svc("StreamManager")
    xml = sm.toXML(objin)
    # print("XML: "+str(xml)+"\n")
    newobj = sm.fromXML(xml, s.uid)
    newobj.name = aNewObjName
    s.addObject(newobj)
    return newobj


##########


class UndoTxn:
    def __init__(self, aMsg=None, aScene=None):
        #        print('__init__')

        if aScene is None:
            self.scene = scene()
        else:
            self.scene = aScene

        if aMsg is None:
            self.msg = ""
        else:
            self.msg = aMsg

    #    def __del__(self):
    #        print('__del__')

    def __enter__(self):
        #        print('__enter__')
        self.scene.startUndoTxn(self.msg)
        # raise ValueError # [LABEL C]
        return self

    def __exit__(self, exception_type, exception_value, traceback):
        #        print('__exit__')
        if exception_value is None:
            self.scene.commitUndoTxn()
        else:
            self.scene.rollbackUndoTxn()
            print("  exception_type:", exception_type)
            print("  exception_value:", exception_value)
            print("  traceback:", traceback)


def txn(aScene, aMsg, aFunc):
    # EDIT TXN START
    aScene.startUndoTxn(aMsg)
    try:
        aFunc()
    except Exception:
        aScene.rollbackUndoTxn()
        return False
    aScene.commitUndoTxn()
    # EDIT TXN END
    return True
