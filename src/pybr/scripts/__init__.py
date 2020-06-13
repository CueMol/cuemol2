import os
from cuemol.internal_loader import import_internal
from pathlib import Path

here = Path(__file__).parent
print("cuemol/__init__.py called", here)

# import _cuemol_internal as ci
ci = import_internal()
if not ci.isInitialized():
    ci.initCueMol(str(here / "config" / "sysconfig.xml"))

from cuemol.cuemol import *
