# print("cuemol/__init__.py called")

import cuemol._internal as ci
import os
if not ci.isInitialized():
    ci.initCueMol("")

from .cuemol import *

