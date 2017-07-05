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

def scene():
    sceMgr = cuemol_internal.getService("SceneManager")
    return sceMgr.getScene(sceMgr.activeSceneID);

def svc(name):
    return cuemol_internal.getService(name)

def obj(aName, aScene=None):
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

    return obj

def rend(aName, aScene=None):
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
    
    return rend

def vec(aX, aY, aZ):
    v = cuemol_internal.createObj("Vector");
    v.x = aX;
    v.y = aY;
    v.z = aZ;
    return v;

def sel(aSelStr, aCtxtID=0):
    selobj = cuemol_internal.createObj("SelCommand")
    selobj.compile(aSelStr, aCtxtID)
    return selobj

def col(aColStr, aCtxtID=0):
    stylem = cuemol_internal.getService("StyleManager")
    color = stylem.compileColor(aColStr, aCtxtID)
    return color

