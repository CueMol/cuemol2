import sys, traceback,os

import cuemol
import cuemol_internal as ci
import json

def guessFormatFromFname(aPathName, aFmt):
    sm = cuemol.svc("StreamManager")
    
    info = json.loads(sm.getInfoJSON2())
    # print("", info)
    
    # Check compression fileext
    basenm, ext = os.path.splitext(aPathName)
    comp = ""
    filenm = aPathName
    if ext == ".gz":
        comp = "gz"
        filenm = basenm
    elif ext == ".xz":
        comp = "xz"
        filenm = basenm
        
    basenm = os.path.basename(filenm)

    # Search matching fext in info data
    for elem in info:
        if not aFmt==None:
            # Format name is specified
            if aFmt==elem["name"]:
                return (elem, basenm, comp)
        else:
            # Guess format from file name
            fext = elem["fext"]
            for aex in fext.split("; "):
                aster, ext = os.path.splitext(aex)
                if filenm.endswith(ext):
                    print("fext=", ext, "")
                    return (elem, basenm, comp)

    raise RuntimeError("cannot guess file format from pathname: "+aPathName)


## def _setupDefaultRenderer(obj):
##     rend = None
##     try:
##         scene = obj.getScene()
        
##         ## EDIT TXN START ##
##         scene.startUndoTxn("Create default renderer")
##         try:
##             rend = obj.createRenderer("simple")
##             rend.applyStyles("DefaultCPKColoring")
##             rend.name = "simple1"
##             rend.sel = util.makesel("*")
##             print("active view ID="+str(scene.activeViewID))
##             view = scene.getActiveView()
##             if view is None:
##                 print("setupDefault renderer: view is null, cannot recenter")
##             else:
##                 pos = rend.getCenter()
##                 view.setViewCenter(pos)
##         except:
##             print("setupDefaultRenderer error")
##             msg = traceback.format_exc()
##             print(msg)
##             scene.rollbackUndoTxn()
##             return None
##         else:
##             scene.commitUndoTxn()
##             ## EDIT TXN END ##
##     except:
##         print("setupDefaultRenderer error")
##         msg = traceback.format_exc()
##         print(msg)

##     return rend

def loadScene(aFileName, aName, aScene, aFmtName, aOpts=None):
    scene = cuemol.scene(aScene)

    strMgr = cuemol.svc("StreamManager")
    reader = strMgr.createHandler(aFmtName, 3)

    if aOpts is not None:
        for k,v in aOpts.items():
            print("scene reader set prop: k=",k,"v=",v)
            ci.setProp(reader, k, v)

    reader.setPath(aFileName)
     
    reader.attach(scene)
    reader.read()
    reader.detach()
    if not aName==None:
        scene.setName(aName)

    return scene
        
def loadObject(aFileName, aName, aScene, aFmtName, aOpts=None):
    scene = cuemol.scene(aScene)

    strMgr = cuemol.svc("StreamManager")
    reader = strMgr.createHandler(aFmtName, 0)

    if aOpts is not None:
        for k,v in aOpts.items():
            print("reader set prop: k=",k,"v=",v)
            ci.setProp(reader, k, v)

    reader.setPath(aFileName)
    newobj = reader.createDefaultObj()

    reader.attach(newobj)
    reader.read();
    reader.detach();
    if not aName==None:
        newobj.name = aName
    scene.addObject(newobj)

    return newobj

def saveObject(aObj, aFileName, aFmtName, aOpts=None):
    obj = cuemol.obj(aObj)

    strMgr = cuemol.svc("StreamManager")
    writer = strMgr.createHandler(aFmtName, 1)

    if aOpts is not None:
        for k,v in aOpts.items():
            print("writer set prop: k=",k,"v=",v)
            ci.setProp(writer, k, v)

    writer.setPath(aFileName)

    writer.attach(obj)
    writer.write();
    writer.detach();

