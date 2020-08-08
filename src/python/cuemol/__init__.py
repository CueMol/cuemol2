import os
from cuemol.internal_loader import import_internal
from pathlib import Path

# print("cuemol/__init__.py called", here)

# import _cuemol_internal as ci
ci = import_internal()
if not ci.isInitialized():
    conf_path = os.getenv("CUEMOL_SYSCONFIG_PATH")
    if conf_path is None:
        here = Path(__file__).parent
        conf_path = here / "config"
    else:
        conf_path = Path(conf_path)
    ci.initCueMol(str(conf_path / "sysconfig.xml"))

from cuemol.cuemol import *
