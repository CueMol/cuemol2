import sys, traceback, re, os

import cuemol

from . import util

def load(filename, name=None, format=None, scene=None):

    scMgr = cuemol.getService("SceneManager")

    if scene is None:
        scene = scMgr.getActiveScene()

    gformat, gname, comp = _guessFormatFromFname(filename)

    print("guessed format: "+gformat)
    print("guessed objname: "+gname)
    print("guessed comp mode: "+comp)

    if format is None:
        format = gformat

    if name is None:
        name = gname

    ncat = _getReaderCategoryID(format)

    if ncat == 0:
        obj = _loadObject(filename, name, scene, format)
        _setupDefaultRenderer(obj)
        
    elif ncat == 3:
        return _loadScene(filename, name, scene, format)
        
    # Unknown category ID, throw exception here
    raise Exception("Unknown category ID")


def _setupDefaultRenderer(obj):
    rend = None
    try:
        scene = obj.getScene()
        
        ## EDIT TXN START ##
        scene.startUndoTxn("Create default renderer")
        try:
            rend = obj.createRenderer("simple")
            rend.applyStyles("DefaultCPKColoring")
            rend.name = "simple1"
            rend.sel = util.makesel("*")
            print("active view ID="+str(scene.activeViewID))
            view = scene.getActiveView()
            if view is None:
                print("setupDefault renderer: view is null, cannot recenter")
            else:
                pos = rend.getCenter()
                view.setViewCenter(pos)
        except:
            print("setupDefaultRenderer error")
            msg = traceback.format_exc()
            print(msg)
            scene.rollbackUndoTxn()
            return None
        else:
            scene.commitUndoTxn()
            ## EDIT TXN END ##
    except:
        print("setupDefaultRenderer error")
        msg = traceback.format_exc()
        print(msg)

    return rend

def _loadScene(filename, name, scene, format):
    strMgr = cuemol.getService("StreamManager")
    reader = strMgr.createHandler(format, 3)
    reader.setPath(filename)
        
    try:
        reader.attach(scene)
        reader.read()
        reader.detach()
        scene.name = name
    except:
        print("loadScene error")
        msg = traceback.format_exc()
        print(msg)
        return None

    return scene
        
def _loadObject(filename, name, scene, format):
    strMgr = cuemol.getService("StreamManager")
    reader = strMgr.createHandler(format, 0)
    reader.setPath(filename)
    newobj = reader.createDefaultObj()

    ## EDIT TXN START ##
    scene.startUndoTxn("Open file")

    try:
        reader.attach(newobj)
        # reader.base64 = true;
        reader.read();
        reader.detach();
        newobj.name = name
        scene.addObject(newobj)
    except:
        print("loadObject error")
        msg = traceback.format_exc()
        print(msg)
        scene.rollbackUndoTxn()
        return None
    else:
        scene.commitUndoTxn()
        ## EDIT TXN END ##

    return newobj

def _guessFormatFromFname(pathname):
    filenm = os.path.basename(pathname)
    basenm, ext = os.path.splitext( filenm )
    comp = ""

    if ext == ".gz":
        comp = "gz"
        basenm, ext = os.path.splitext( path )
    #elif ext == "bz2":

    if ext == ".qsc":
        return ("qsc_xml", basenm, comp)

    if ext == "":
        raise Exception("invalid pathname: "+pathname)

    return (ext[1:], basenm, comp)


def _getReaderCategoryID(format):
    if format == "qsc_xml":
        return 3

    return 0


