#!/bin/sh

PYTHON=python3
prefix=/Users/user/proj64/trtiyam/cuemol2/uxbuild/../src//pyqt_gui

env PYTHONPATH=$prefix/lib \
  $PYTHON startup.py $prefix/sysconfig.xml

