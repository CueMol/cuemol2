#!/bin/sh

TOP_DIR=$(cd $(dirname $0)/../; pwd)
PYTHON=python3.8

env CUEMOL_SYSCONFIG_PATH=$TOP_DIR/src/xul_gui \
    PYTHONPATH=$TOP_DIR/src/python:$TOP_DIR/build:$TOP_DIR/build/python \
    $PYTHON $TOP_DIR/src/python/cuemol_gui/startup.py
