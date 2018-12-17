# print("cuemol/__init__.py called")

import cuemol_internal as ci
import os
if not ci.isInitialized():
    conf_file = os.environ['CUEMOL2_SYSCONFIG']
    ci.initCueMol(conf_file)

from .util import *

