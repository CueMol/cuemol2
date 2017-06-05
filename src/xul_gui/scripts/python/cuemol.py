import cuemol_internal

def createObj(name):
    return cuemol_internal.createObj(name)

def getService(name):
    return cuemol_internal.getService(name)

def print(str):
    return cuemol_internal.print(str)

def println(str):
    return cuemol_internal.print(str+"\n")


def getObj(aName):
    sceMgr = cuemol_internal.getService("SceneManager")
    scene = sceMgr.getScene(sceMgr.activeSceneID);
    mol = scene.getObjectByName(aName)
    return mol

def getRend (aRendName):
    sceMgr = cuemol_internal.getService("SceneManager")
    scene = sceMgr.getScene(sceMgr.activeSceneID)
    rend = scene.getRendByName(aRendName)
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


def txn(aScene, aMsg, aFunc):
    ## EDIT TXN START
    aScene.startUndoTxn(aMsg)
    try:
        aFunc()
    except Exception, e:
        print e, 'error occurred'
        aScene.rollbackUndoTxn()
        return False
    except:
        aScene.rollbackUndoTxn()
        return False
    aScene.commitUndoTxn()
    ## EDIT TXN END
    return True

