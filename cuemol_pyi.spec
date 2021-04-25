# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

import glob
from pathlib import Path

# TODO: from env var
proj_dir = Path("d:\\proj64_cmake")

top_dir = proj_dir / "cuemol2"
wrapper_classes = []
for f in glob.glob(str(top_dir / "build" / "python" / "wrappers" / "*.py")):
    print(f)
    wrapper_classes.append("wrappers." + str(Path(f).stem))

pathex = [
    top_dir / "src\\python",
    top_dir / "build\\RelWithDebInfo",
    top_dir / "build\\python",
    proj_dir / "bin",
    proj_dir / "boost\\boost_1_72_0\\lib64-msvc-14.2",
]

a = Analysis(
    ["src/python/cuemol_gui/startup.py"],
    pathex=[str(i) for i in pathex],
    binaries=[],
    datas=[],
    hiddenimports=["_cuemol_internal"] + wrapper_classes,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="cuemol",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="cuemol",
)
