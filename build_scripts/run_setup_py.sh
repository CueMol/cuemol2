#/bin/sh

NCPU=4
PYTHON=python3
SCRIPT_DIR=$(cd $(dirname $0); pwd)
# Prerequisites
CMAKE_PREFIX_PATH="/usr/local/opt/qt5/lib/cmake/Qt5;$HOME/proj64_cmake"

BUILD_SET_PATH="CMAKE_PREFIX_PATH=${CMAKE_PREFIX_PATH}"

(
    cd ${SCRIPT_DIR}/..
    env MAKEFLAGS=-j${NCPU} \
        BUILD_MINIMUM_MODULES=OFF \
        $BUILD_SET_PATH \
        $PYTHON -m pip install -v -e .
)
