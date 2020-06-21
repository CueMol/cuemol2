#!/bin/sh

BUILD_GUI=ON
BUILD_PYTHON_BINDINGS=ON

# Install location
CMAKE_INSTALL_PREFIX=$HOME/tmp

# Prerequisites
CMAKE_PREFIX_PATH="/usr/local/opt/qt5/lib/cmake/Qt5;$HOME/proj64_cmake"

cmake .. \
      -DCMAKE_INSTALL_PREFIX=$CMAKE_INSTALL_PREFIX \
      -DCMAKE_PREFIX_PATH=$CMAKE_PREFIX_PATH \
      -DBUILD_GUI=$BUILD_GUI \
      -DBUILD_PYTHON_BINDINGS=$BUILD_PYTHON_BINDINGS \

      # -DFFTW_ROOT=$HOME/proj64_cmake/fftw

#      -DQt5_DIR=/usr/local/opt/qt5/lib/cmake/Qt5 \
#      -G "Xcode" \
