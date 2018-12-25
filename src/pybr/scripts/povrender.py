import tempfile
import os
import json

import cuemol as cm
import cuemol.fileio as fileio

POVRAY_BIN = "~/bundle/povray/unix/povray"
POVRAY_INC = "~/bundle/povray/include/"

def render(scene, out_png_file, width=640, height=480):
    
    strMgr = cm.svc("StreamManager")
    exporter = strMgr.createHandler("pov", 2)

    if exporter is None:
        raise RuntimeError("cannot create exporter for pov")

    sc = cm.scene(scene)
    if sc is None:
        raise RuntimeError("Scene ({}) does not exist".format(str(scene)))

    # Make pov tmp file
    fd, pov_fname = tempfile.mkstemp(suffix=".pov")
    os.close(fd)
    print("pov_fname", pov_fname)

    # Make inc tmp file
    fd, inc_fname = tempfile.mkstemp(suffix=".inc")
    os.close(fd)
    print("inc_fname", inc_fname)

    exporter.useClipZ = True #this.mbClip;
    exporter.perspective = False #!this.bOrtho;
    exporter.usePostBlend = True

    exporter.showEdgeLines = True #this.mbShowEdgeLines;
    exporter.usePixImgs = True #this.mbUsePixImgs;

    exporter.makeRelIncPath = False
    exporter.camera = "__current"
    exporter.width = width
    exporter.height = height

    exporter.attach(sc)
    exporter.setPath(pov_fname)
    exporter.setSubPath("inc", inc_fname)
    exporter.write()
    exporter.detach()

    if exporter.blendTable:
        print("BlendTab JSON:", exporter.blendTable)
        blend_tab = json.loads(exporter.blendTable)

    if exporter.imgFileNames:
        print("Img pix fnames:", exporter.imgFileNames)

    os.remove(pov_fname)
    os.remove(inc_fname)
