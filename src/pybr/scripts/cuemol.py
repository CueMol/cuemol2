import cuemol_internal as ci

def createObj(name):
    return ci.createObj(name)

def getService(name):
    return ci.getService(name)

def print(astr):
    return ci.print(astr)

def println(astr):
    return ci.print(astr+"\n")

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
    return ci.isInstanceOf(aObj, aIfName)

def isscene(aObj):
    return isimpl(aObj, "Scene")

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
#    print("***\n")
    if isscene(aScene):
        return aScene

#    print("*** aScene="+str(aScene)+"\n")
    sceMgr = ci.getService("SceneManager")
    scid=None
    if aScene==None:
        scid = sceMgr.activeSceneID
        if scid==0:
            raise RuntimeError("Active scene ID is not defined!!")
    elif isinstance(aScene, int):
        scid = aScene
    else:
        raise RuntimeError("scene "+str(aScene)+" not found")

#    print("*** scid="+str(scid)+"\n")
    return sceMgr.getScene(scid)

def createScene():
    sceMgr = ci.getService("SceneManager")
    scene = sceMgr.createScene();
    # set created scene as the active scene
    sceMgr.setActiveSceneID(scene.uid)
    return scene

def svc(name):
    return ci.getService(name)

def obj(aName, aScene=None):
    if isobj(aName):
        return aName
    
    sc = scene(aScene)

    obj = None
    if isinstance(aName, str):
        obj = sc.getObjectByName(aName)
    elif isinstance(aName, int):
        obj = sc.getObject(aName)

    if obj==None:
        raise RuntimeError("object "+str(aName)+" not found")

    return obj

def rend(aRend, aObj=None):
    if isrend(aRend):
        return aRend

    rend = None

    if aObj==None:
        s = scene()
        if isinstance(aName, str):
            rend = s.getRendByName(aName)
        elif isinstance(aName, int):
            rend = o.getRenderer(aName)

    else:
        o = obj(aObj)
        if isinstance(aName, str):
            rend = o.getRendererByName(aName)
        elif isinstance(aName, int):
            rend = o.getRenderer(aName)
    
    if rend==None:
        raise RuntimeError("renderer "+str(aName)+" not found")

    return rend

def vec(aX, aY, aZ):
    v = ci.createObj("Vector");
    v.x = aX;
    v.y = aY;
    v.z = aZ;
    return v;

def sel(aSelStr, aScene=None):
    if issel(aSelStr):
        return aSelStr
    s = scene(aScene)
    print("sel> scene="+str(s)+"\n")
    selobj = ci.createObj("SelCommand")
    selobj.compile(aSelStr, s.uid)
    return selobj

def col(aColStr, aScene=None):
    if iscol(aColStr):
        return aColStr
    s = scene(aScene)
    stylem = ci.getService("StyleManager")
    color = stylem.compileColor(aColStr, s.uid)
    return color

def timeval(aMilli):
    tv = ci.createObj("TimeValue")
    tv.millisec = aMilli
    return tv

##########

def copy(aObj, aNewObjName):
    objin = obj(aObj)
    s = objin.getScene()
    sm = svc("StreamManager")
    xml = sm.toXML(objin)
    print("XML: "+str(xml)+"\n")
    newobj = sm.fromXML(xml, s.uid)
    newobj.name = aNewObjName
    s.addObject(newobj)
    return newobj
