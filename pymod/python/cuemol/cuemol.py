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
    "copyObj",
    "println",
    "get_ref_count",
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
    "to_ndarray",
    "copy_to_ndarray",
    "from_ndarray",
    "copy_from_ndarray",
]

ci = import_internal()

##########


def getWrpClass(clsnm: str) -> type:
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
    """Create wrapper object for the given internal object.

    Args:
        obj: internal object to wrap.
    Returns:
        Wrapper object for the given internal object.
    """
    if obj is None:
        return None
    if isinstance(obj, ci.Wrapper):
        # obj is an internal wrapper obj
        # print("createWrapper obj:",obj)
        clsnm = ci.getClassName(obj)
        cls = getWrpClass(clsnm)
        wr = cls(obj)
        return wr
    elif isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = createWrapper(v)
        return obj
    elif isinstance(obj, list):
        for k, v in enumerate(obj):
            obj[k] = createWrapper(v)
        return obj
    else:
        return obj


def conv_dict_arg(d):
    assert isinstance(d, dict)
    # assert type(d) == dict
    result = {}
    for k, v in d.items():
        if iswrapper(v):
            result[k] = v._wrapped
        else:
            result[k] = v
    return result


def createObj(name, strval=None):
    if strval is None:
        return createWrapper(ci.createObj(name))
    else:
        return createWrapper(ci.createObj(name, strval))


def getService(name):
    return createWrapper(ci.getService(name))


def copyObj(obj):
    return createWrapper(ci.copyObj(obj._wrapped))


def println(astr):
    return ci.print(astr + "\n")


def get_ref_count(obj):
    return ci.get_ref_count(obj._wrapped)


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
        sce = scene()
        if isinstance(aRend, str):
            rend = sce.getRendByName(aRend)
        elif isinstance(aRend, int):
            rend = sce.getRenderer(aRend)

    else:
        ob = obj(aObj)
        if isinstance(aRend, str):
            rend = ob.getRendererByName(aRend)
        elif isinstance(aRend, int):
            rend = ob.getRenderer(aRend)

    if rend is None:
        raise RuntimeError(f"renderer {aRend} not found")

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
        raise ValueError(selobj.error_msg)


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


def copy_to_ndarray(ba_obj: WrapperBase):
    """
    Create a NumPy array containing a copy of the data in a CueMol buffer/array.

    This function copies the underlying data from the ByteArray object into
    a new NumPy `ndarray`, so modifying the returned array will not affect the
    original ByteArray object.

    Parameters
    ----------
    ba_obj : WrapperBase
        A source ByteArray object.

    Returns
    -------
    numpy.ndarray
        A new NumPy array containing a copy of the data.
    """
    ndary = ci.copy_to_ndarray(ba_obj._wrapped)
    return ndary


def to_ndarray(ba_obj: WrapperBase):
    """
    Expose a ByteArray object as a NumPy array, sharing memory.

    Unlike :func:`copy_to_ndarray`, this function may return an `ndarray` that
    shares its underlying memory with the ByteArray object. In that case, changes
    to the array will be reflected in the ByteArray object, and vice versa.

    Parameters
    ----------
    ba_obj : WrapperBase
        A Source ByteArray object.

    Returns
    -------
    numpy.ndarray
        A NumPy array view of the CueMol data. The array may share memory with
        the original object.
    """
    ndary = ci.to_ndarray(ba_obj._wrapped)
    return ndary


def from_ndarray(ndary) -> WrapperBase:
    """
    Wrap an existing NumPy array as a ByteArray object, sharing memory.

    This function creates a ByteArray object that views
    the given NumPy `ndarray` without copying its data.

    Parameters
    ----------
    ndary : numpy.ndarray
        The NumPy array whose data should be shared with ByteArray object.

    Returns
    -------
    WrapperBase
        A ByteArray object whose underlying implementation references the
        provided NumPy array.
    """
    ba_wrapped = ci.from_ndarray(ndary)
    ba_obj = createWrapper(ba_wrapped)
    return ba_obj


def copy_from_ndarray(ndary) -> WrapperBase:
    """
    Create a ByteArray object by copying data from a NumPy array.

    Unlike :func:`from_ndarray`, this function copies the contents of the
    provided NumPy `ndarray` into a new ByteArray object, so subsequent changes
    to the NumPy array will not affect the ByteArray object.

    Parameters
    ----------
    ndary : numpy.ndarray
        The NumPy array whose data should be copied into a new ByteArray object.

    Returns
    -------
    WrapperBase
        A ByteArray object containing a copy of the data from the array.
    """
    ba_wrapped = ci.copy_from_ndarray(ndary)
    ba_obj = createWrapper(ba_wrapped)
    return ba_obj
