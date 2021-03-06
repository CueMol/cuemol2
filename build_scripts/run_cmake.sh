#!/bin/sh

BUILD_GUI=ON
BUILD_PYTHON_BINDINGS=ON
BUILD_PYTHON_MODULE=ON

# Install location
CMAKE_INSTALL_PREFIX=$HOME/tmp

# Prerequisites
PROJ_DIR=$HOME/proj64_cmake
CMAKE_PREFIX_PATH="/usr/local/opt/qt5/lib/cmake/Qt5;$PROJ_DIR"

cmake .. \
      -DCMAKE_INSTALL_PREFIX=$CMAKE_INSTALL_PREFIX \
      -DCMAKE_PREFIX_PATH=$CMAKE_PREFIX_PATH \
      -DFFTW_ROOT=$PROJ_DIR/fftw \
      -DBUILD_GUI=$BUILD_GUI \
      -DBUILD_PYTHON_BINDINGS=$BUILD_PYTHON_BINDINGS \
      -DBUILD_PYTHON_MODULE=$BUILD_PYTHON_MODULE \
      -DCGAL_DO_NOT_WARN_ABOUT_CMAKE_BUILD_TYPE=TRUE


      # -DFFTW_ROOT=$HOME/proj64_cmake/fftw
#      -DQt5_DIR=/usr/local/opt/qt5/lib/cmake/Qt5 \
#      -G "Xcode" \
