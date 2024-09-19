from __future__ import annotations

import json
import math
import os
import shlex
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

import cuemol as cm

# POVRAY_BIN = "/Users/user/bundle/povray/unix/povray"
POVRAY_BIN = "povray"
# POVRAY_INC = "/Users/user/bundle/povray/include/"
POVRAY_INC = None


class PovRender:
    def __init__(
        self,
        width: int,
        height: int,
        camera: str = "__current",
        nthr: int = 1,
        fps: float = 25.0,
        clip_slab: bool = True,
        post_blend: bool = True,
        edge_lines: bool = True,
        use_pix_imgs: bool = False,
        perspective: bool = False,
        shadow: bool = False,
        use_fog: bool = True,
        rad_mode: int = -1,
        povray_bin: Optional[str] = None,
        povray_inc: Optional[str] = None,
        blendpng_bin: Optional[str] = None,
    ):
        self.width = width
        self.height = height
        self.camera = camera
        self.nthreads = nthr

        if povray_bin is not None:
            self.povray_bin = povray_bin
        else:
            self.povray_bin = POVRAY_BIN

        if povray_inc is not None:
            self.povray_inc = povray_inc
        else:
            self.povray_inc = POVRAY_INC

        self.mbClip = clip_slab
        self.mbPostBlend = post_blend
        self.mbShowEdgeLines = edge_lines
        self.mbUsePixImgs = use_pix_imgs
        self.perspective = perspective
        self.shadow = shadow
        # self.mbShadow = False
        self.use_fog = use_fog

        self.mFPS = fps

        self.blendpng_path = blendpng_bin

        # Lighting/Radiosity
        self.mnLightSpread = 1
        self.mnRadMode = rad_mode
        if rad_mode == -1:
            # Ray-tracing
            self.mbRadiosity = False
            self.mdLightInten = 1.3
            self.mdFlashFrac = 0.8 / 1.3
            self.mdAmbFrac = 0
        else:
            # Radiosity
            self.mbRadiosity = True
            self.mdLightInten = 1.6
            self.mdFlashFrac = 0
            self.mdAmbFrac = 0.7

    def _run_povray(self, aPovFileName, aOutImgPath, aOptArgs):

        povFileDir = "."

        args = [
            self.povray_bin,
            "\"Input_File_Name='" + aPovFileName + "'\"",
            "\"Output_File_Name='" + aOutImgPath + ".png'\"",
            "\"Library_Path='" + self.povray_inc + "'\"",
            "\"Library_Path='" + povFileDir + "'\"",
            # "Declare=_stereo=" + nStereo,
            # "Declare=_iod=" + dSteDep,
            "Declare=_perspective=1",
            "Declare=_shadow=0",
            f"Declare=_perspective={int(self.perspective)}",
            f"Declare=_shadow={int(self.shadow)}",
            f"Declare=_light_inten={self.mdLightInten}",
            f"Declare=_flash_frac={self.mdFlashFrac}",
            f"Declare=_amb_frac={self.mdAmbFrac}",
            "File_Gamma=1",
            "-D",
            f"+WT{self.nthreads}",
            f"+W{self.width}",
            f"+H{self.height}",
            "+FN8",
            "Quality=11",
            "Antialias=On",
            "Antialias_Depth=3",
            "Antialias_Threshold=0.1",
            "Jitter=Off",
        ]

        if self.mbRadiosity:
            print(f"PovRender> Radiosity ON; mode={self.mnRadMode}")
            args.append(f"Declare=_radiosity={self.mnRadMode}")

        if not self.use_fog:
            args.append("Declare=_no_fog=1")

        if aOptArgs:
            args = args + aOptArgs

        print("PovRender options:")
        print("\n ".join(args))

        print(" ".join(args))
        # subprocess.call(args)
        os.system(" ".join(args))

    def _writePovFiles(
        self, pov_base: str, scene: Any, animMgr: Optional[Any] = None
    ) -> list[Any]:

        # create exporter obj
        strMgr = cm.svc("StreamManager")
        exporter = strMgr.createHandler("pov", 2)
        if exporter == None:
            raise RuntimeError("cannot create exporter for pov")

        # Make pov tmp file
        povFileName = pov_base + ".pov"
        print("tmp pov file: " + povFileName)

        # Make inc tmp file
        incFileName = pov_base + ".inc"
        print("tmp inc file: " + incFileName)

        # write pov/inc files
        exporter.useClipZ = self.mbClip
        exporter.usePostBlend = self.mbPostBlend
        exporter.showEdgeLines = self.mbShowEdgeLines
        exporter.usePixImgs = self.mbUsePixImgs
        exporter.perspective = self.perspective

        exporter.makeRelIncPath = False
        exporter.camera = self.camera
        exporter.width = self.width
        exporter.height = self.height

        exporter.setPath(povFileName)
        exporter.setSubPath("inc", incFileName)

        if animMgr is not None:
            animMgr.writeFrame(exporter)
        else:
            exporter.attach(scene)
            exporter.write()
            exporter.detach()

        # let str = exporter.imgFileNames;
        # dd("tmpix files: "+str);
        # mRmPixFiles = str.split(",");

        mBlendTab = []

        if self.mbPostBlend and exporter.blendTable:
            # print(f"BlendTab JSON: {exporter.blendTable}")
            mBlendTab = json.loads(exporter.blendTable)
            print(f"BlendTab Object: {mBlendTab}")

        return mBlendTab

    def _render_blend_pov(self, pov_base, mBlendTab):

        povFileName = pov_base + ".pov"

        nlayer = 1
        allnames = []
        mNames = []
        mAlphas = []

        mNames.append("")
        mAlphas.append(1.0)

        for k in mBlendTab.keys():
            # print("key="+k)
            # print("value="+mBlendTab[k])
            names = mBlendTab[k].split(",")
            allnames = allnames + names
            mNames.append(names)
            mAlphas.append("0." + k)
            nlayer = nlayer + 1
            # print("nlayer="+str(nlayer))

        print("Layers: " + str(nlayer))
        print("Layer names: " + ",".join(allnames))

        mOptArgs = [0] * nlayer
        mImgFile = [0] * nlayer
        remove_files = [povFileName, pov_base + ".inc"]

        mBlendArgs = [self.blendpng_path]

        # Render each layer
        for iLayer in range(0, nlayer):
            print(f"Render Layer: {iLayer}")
            mOptArgs[iLayer] = []
            if iLayer == 0:
                # Background layer
                for elem in allnames:
                    mOptArgs[iLayer].append("Declare=_show" + elem + "=0")
                mAlphas[iLayer] = 1.0
            else:
                # Other layers
                names = mNames[iLayer]
                for elem in allnames:
                    if elem in names:
                        mOptArgs[iLayer].append("Declare=_show" + elem + "=1")
                    else:
                        mOptArgs[iLayer].append("Declare=_show" + elem + "=0")

            mImgFile[iLayer] = pov_base + "-layer" + str(iLayer)
            remove_files.append(mImgFile[iLayer] + ".png")

            self._run_povray(povFileName, mImgFile[iLayer], mOptArgs[iLayer])

            mBlendArgs.append(mImgFile[iLayer] + ".png")
            if iLayer > 0:
                mBlendArgs.append(str(mAlphas[iLayer]))

        # Run Blendpng command
        mBlendArgs.append(pov_base + ".png")
        mBlendArgs.append("300")

        print("BlendPNG options:")
        print("\n ".join(mBlendArgs))

        os.system(" ".join(mBlendArgs))

        for fl in remove_files:
            os.remove(fl)

    def render_anim(self, scene: Any, basename: str, startfrm: int, nfrms: int) -> None:
        # dt in millisec
        dt = 1000.0 / self.mFPS
        print(f"dt={dt}")
        itv = int(math.floor(dt * startfrm))

        animMgr = scene.getAnimMgr()

        if animMgr.size <= 0:
            print(f"No animation in scene: {scene.name}")
            return

        animMgr.startcam = self.camera
        tv_st = cm.timeval(itv)
        tv_en = animMgr.length

        if tv_st.millisec > tv_en.millisec:
            print(f"start frame out of range: {startfrm}")
            return

        nallfrms = animMgr.setupRender(tv_st, tv_en, self.mFPS)
        print(f"Render anim frames: {nallfrms}")
        if nfrms < 0:
            nfrms = nallfrms

        for ifrm in range(startfrm, startfrm + nfrms):
            outbase = f"{basename}-{ifrm:04d}"  # sys.argv[2] + "-" + ("%04d" % ifrm)
            blendtab = self._writePovFiles(outbase, scene, animMgr)
            self._render_blend_pov(outbase, blendtab)

    def render_simple(self, scene: Any, basename: str) -> None:
        # scene.loadViewFromCam(scene.activeViewID, camera)
        # scene.saveViewToCam(scene.activeViewID, "__current")

        strMgr = cm.svc("StreamManager")
        exporter = strMgr.createHandler("pov", 2)
        if exporter is None:
            raise RuntimeError("cannot create exporter for pov")

        blendtab = self._writePovFiles(basename, scene)
        self._render_blend_pov(basename, blendtab)

        # # Make pov tmp file
        # fd, pov_fname = tempfile.mkstemp(suffix=".pov")
        # os.close(fd)
        # print("pov_fname", pov_fname)

        # # Make inc tmp file
        # fd, inc_fname = tempfile.mkstemp(suffix=".inc")
        # os.close(fd)
        # print("inc_fname", inc_fname)

        # exporter.useClipZ = True  # this.mbClip;
        # exporter.perspective = self.perspective
        # exporter.usePostBlend = True

        # exporter.showEdgeLines = True  # this.mbShowEdgeLines;
        # exporter.usePixImgs = True  # this.mbUsePixImgs;

        # exporter.makeRelIncPath = False
        # exporter.camera = camera
        # exporter.width = width
        # exporter.height = height

        # exporter.attach(sc)
        # exporter.setPath(pov_fname)
        # exporter.setSubPath("inc", inc_fname)
        # exporter.write()
        # exporter.detach()

        # if exporter.blendTable:
        #     print("BlendTab JSON:", exporter.blendTable)
        #     blend_tab = json.loads(exporter.blendTable)
        #     print(blend_tab)

        # if exporter.imgFileNames:
        #     print("Img pix fnames:", exporter.imgFileNames)

        # povfile_dir = Path(pov_fname).parent

        # args = [
        #     POVRAY_BIN,
        #     "Input_File_Name='{}'".format(pov_fname),
        #     "Output_File_Name='{}'".format(out_png_file),
        #     "Library_Path='{}'".format(POVRAY_INC),
        #     "Library_Path='{}'".format(povfile_dir),
        #     "Declare=_stereo={}".format(0),
        #     "Declare=_iod={}".format(0),
        #     "Declare=_perspective={}".format(0),
        #     "Declare=_shadow={}".format(0),
        #     "Declare=_light_inten={}".format(1.3),
        #     "Declare=_flash_frac={}".format(0.8 / 1.3),
        #     "Declare=_amb_frac={}".format(0),
        #     "File_Gamma=1",
        #     "-D",
        #     "+WT{}".format(nthr),
        #     "+W{}".format(width),
        #     "+H{}".format(height),
        #     "+FN8",
        #     "Quality=11",
        #     "Antialias=On",
        #     "Antialias_Depth=3",
        #     "Antialias_Threshold=0.1",
        #     "Jitter=Off",
        # ]

        # cmd = " ".join(map(lambda x: shlex.quote(str(x)), args)) + " 2>&1"

        # print(cmd, flush=True)
        # res = subprocess.call(cmd, shell=True)

        # if res != 0 or not Path(out_png_file).is_file():
        #     raise RuntimeError("render failed: " + pov_fname)

        # os.remove(pov_fname)
        # os.remove(inc_fname)
