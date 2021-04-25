"""
CueMol File I/O related functions
"""

import json
import os

import cuemol as cm
from cuemol.internal_loader import import_internal

from . import renderer

ci = import_internal()

__all__ = ["loadScene", "loadObject", "load"]


def guessFormatFromFname(aPathName, aFmt=None):
    sm = cm.strMgr()

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
        if aFmt is not None:
            # Format name is specified
            if aFmt == elem["name"]:
                return (elem, basenm, comp)
        else:
            # Guess format from file name
            fext = elem["fext"]
            for aex in fext.split("; "):
                aster, ext = os.path.splitext(aex)
                if filenm.endswith(ext):
                    print("fext=", ext, "")
                    return (elem, basenm, comp)

    raise RuntimeError("cannot guess file format from pathname: " + aPathName)


def loadScene(aFileName, aName, aScene, aFmtName, aOpts=None):
    scene = cm.scene(aScene)

    strMgr = cm.strMgr()
    reader = strMgr.createHandler(aFmtName, 3)

    if aOpts is not None:
        for k, v in aOpts.items():
            print("scene reader set prop: k=", k, "v=", v)
            ci.setProp(reader._wrapped, k, v)

    reader.setPath(aFileName)

    reader.attach(scene)
    reader.read()
    reader.detach()
    if aName is not None:
        scene.setName(aName)

    return scene


def loadObject(aFileName, aName, aScene, aFmtName, aOpts=None):
    scene = cm.scene(aScene)

    strMgr = cm.strMgr()
    reader = strMgr.createHandler(aFmtName, 0)

    if aOpts is not None:
        for k, v in aOpts.items():
            print("reader:", reader._wrapped)
            print("reader set prop: k=", k, "v=", v)
            ci.setProp(reader._wrapped, k, v)
            print(ci.getProp(reader._wrapped, k))

    reader.setPath(aFileName)
    newobj = reader.createDefaultObj()

    reader.attach(newobj)
    reader.read()
    reader.detach()
    if aName is not None:
        newobj.name = aName
    scene.addObject(newobj)

    return newobj


def saveObject(aObj, aFileName, aFmtName, aOpts=None):
    obj = cm.obj(aObj)

    strMgr = cm.strMgr()
    writer = strMgr.createHandler(aFmtName, 1)

    if aOpts is not None:
        for k, v in aOpts.items():
            print("writer set prop: k=", k, "v=", v)
            ci.setProp(writer._wrapped, k, v)

    writer.setPath(aFileName)

    writer.attach(obj)
    writer.write()
    writer.detach()


def getReaderCategoryID(format):
    if format == "qsc_xml":
        return 3

    return 0


def load(filename, name=None, format=None, scene=None):

    # scMgr = cm.sceMgr()

    scene = cm.scene(scene)

    gformat, gname, comp = guessFormatFromFname(filename, format)

    print("guessed format: ", gformat)
    print("guessed objname: ", gname)
    print("guessed comp mode: ", comp)

    if format is None:
        format = gformat["name"]

    if name is None:
        name = gname

    ncat = getReaderCategoryID(format)

    if ncat == 0:
        obj = loadObject(filename, name, scene, format)
        renderer.setupDefaultRenderer(obj)
        return obj
    elif ncat == 3:
        return loadScene(filename, name, scene, format)
    else:
        # Unknown category ID, throw exception here
        raise RuntimeError("Unknown category ID:" + str(ncat))
