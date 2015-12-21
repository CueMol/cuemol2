#!/bin/sh

SRCDIR=$HOME/proj64/trtiyam/cuemol2/src

env PYTHONPATH=$SRCDIR/qt_gui/lib \
  python3 -i startup.py $SRCDIR/xul_gui/sysconfig.xml

