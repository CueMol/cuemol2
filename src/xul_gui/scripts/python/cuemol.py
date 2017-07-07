import cuemol_internal

def createObj(name):
    return cuemol_internal.createObj(name)

def getService(name):
    return cuemol_internal.getService(name)

def print(astr):
    return cuemol_internal.print(astr)

def println(astr):
    return cuemol_internal.print(astr+"\n")

##########

def iswrapper(aObj):
    tp = type(aObj)
    if str(tp) == "<class 'cuemol.Wrapper'>":
        return True
    else:
        return False

def isimpl(aObj, aIfName):
    if not iswrapper(aObj):
        return False
    return cuemol_internal.isInstanceOf(aObj, aIfName)

def isscene(aObj):
    return isimpl(aObj, "Scene")

def isobj(aObj):
    return isimpl(aObj, "Object")

def isrend(aObj):
    return isimpl(aObj, "Renderer")
    
def issel(aObj):
    return isimpl(aObj, "Selection")

def iscol(aObj):
    return isimpl(aObj, "AbstractColor")

##########

def scene(aScene=None):
    if isscene(aScene):
        return aScene

    scid=None
    if aScene==None:
        sceMgr = cuemol_internal.getService("SceneManager")
        scid = sceMgr.activeSceneID
    elif isinstance(aScene, int):
        scid = aScene
    else:
        return None

    return sceMgr.getScene(scid)

def svc(name):
    return cuemol_internal.getService(name)

def obj(aName, aScene=None):
    if isobj(aName):
        return aName
    
    sceMgr = cuemol_internal.getService("SceneManager")

    scene = None
    if aScene==None:
        scene = sceMgr.getScene(sceMgr.activeSceneID);
    else:
        scene = aScene

    obj = None
    if isinstance(aName, str):
        obj = scene.getObjectByName(aName)
    elif isinstance(aName, int):
        obj = scene.getObject(aName)

    if obj==None:
        raise RuntimeError("object "+str(aName)+" not found")

    return obj

def rend(aName, aScene=None):
    if isrend(aName):
        return aName

    sceMgr = cuemol_internal.getService("SceneManager")

    scene = None
    if aScene==None:
        scene = sceMgr.getScene(sceMgr.activeSceneID);
    else:
        scene = aScene

    rend = None
    if isinstance(aName, str):
        rend = scene.getRendByName(aName)
    elif isinstance(aName, int):
        rend = scene.getRenderer(aName)
    
    if rend==None:
        raise RuntimeError("renderer "+str(aName)+" not found")

    return rend

def vec(aX, aY, aZ):
    v = cuemol_internal.createObj("Vector");
    v.x = aX;
    v.y = aY;
    v.z = aZ;
    return v;

def sel(aSelStr, aCtxtID=0):
    if issel(aSelStr):
        return aSelStr
    selobj = cuemol_internal.createObj("SelCommand")
    selobj.compile(aSelStr, aCtxtID)
    return selobj

def col(aColStr, aCtxtID=0):
    if iscol(aColStr):
        return aColStr
    stylem = cuemol_internal.getService("StyleManager")
    color = stylem.compileColor(aColStr, aCtxtID)
    return color


