import json
import os
import shlex
import subprocess
import tempfile
from pathlib import Path

import cuemol as cm

# POVRAY_BIN = "/Users/user/bundle/povray/unix/povray"
POVRAY_BIN = "povray"
# POVRAY_INC = "/Users/user/bundle/povray/include/"
POVRAY_INC = None


def render(scene, out_png_file, width=640, height=480, camera="__current", nthr=1):

    scene.loadViewFromCam(scene.activeViewID, camera)
    scene.saveViewToCam(scene.activeViewID, "__current")

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

    exporter.useClipZ = True  # this.mbClip;
    exporter.perspective = False  # !this.bOrtho;
    exporter.usePostBlend = True

    exporter.showEdgeLines = True  # this.mbShowEdgeLines;
    exporter.usePixImgs = True  # this.mbUsePixImgs;

    exporter.makeRelIncPath = False
    exporter.camera = camera
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
        print(blend_tab)

    if exporter.imgFileNames:
        print("Img pix fnames:", exporter.imgFileNames)

    povfile_dir = Path(pov_fname).parent

    args = [
        POVRAY_BIN,
        "Input_File_Name='{}'".format(pov_fname),
        "Output_File_Name='{}'".format(out_png_file),
        "Library_Path='{}'".format(POVRAY_INC),
        "Library_Path='{}'".format(povfile_dir),
        "Declare=_stereo={}".format(0),
        "Declare=_iod={}".format(0),
        "Declare=_perspective={}".format(0),
        "Declare=_shadow={}".format(0),
        "Declare=_light_inten={}".format(1.3),
        "Declare=_flash_frac={}".format(0.8 / 1.3),
        "Declare=_amb_frac={}".format(0),
        "File_Gamma=1",
        "-D",
        "+WT{}".format(nthr),
        "+W{}".format(width),
        "+H{}".format(height),
        "+FN8",
        "Quality=11",
        "Antialias=On",
        "Antialias_Depth=3",
        "Antialias_Threshold=0.1",
        "Jitter=Off",
    ]

    cmd = " ".join(map(lambda x: shlex.quote(str(x)), args)) + " 2>&1"

    print(cmd, flush=True)
    res = subprocess.call(cmd, shell=True)

    if res != 0 or not Path(out_png_file).is_file():
        raise RuntimeError("render failed: " + pov_fname)

    os.remove(pov_fname)
    os.remove(inc_fname)
