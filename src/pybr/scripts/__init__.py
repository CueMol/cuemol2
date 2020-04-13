print("cuemol/__init__.py called")

import _cuemol_internal as ci
import os
if not ci.isInitialized():
    ci.initCueMol("")

from cuemol.cuemol import *
