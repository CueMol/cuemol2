#!/bin/sh

cwd=`pwd`

top_srcdir=$cwd/../src/
install_dir=$top_srcdir/pyqt_gui/

# debug="--disable-debug --enable-m64"
debug="--enable-debug --enable-m64"

usepybr="--enable-pymodule"
usexrbr="--without-xmlrpc"

##

boost_dir=$HOME/proj64/boost_1_57/
fftw_dir=$HOME/proj64/fftw
cgal_dir=$HOME/proj64/CGAL-4.6.1/
glew_dir=$HOME/proj64/glew

qtdir=/usr/local/Cellar/qt5/5.5.1_2
pyqtdir=/usr/local/Cellar/pyqt5/5.5.1

#######################

config_scr=../src/configure

if test ! -f $config_scr; then
    (
	cd ../src
	aclocal; glibtoolize --force; aclocal; autoheader; automake -a -W none; autoconf;
	cd js
	aclocal; autoheader; automake -a; autoconf;
    )	
fi

env \
PYTHON="python3" \
CC="clang" \
CFLAGS="-O" \
CXX="clang++" \
CXXFLAGS=" -O -Wno-parentheses-equality -Wno-c++11-narrowing -Wno-extra-tokens -Wno-invalid-pp-token" \
$config_scr \
--disable-static \
--enable-shared \
--prefix=$install_dir \
--with-ui=qt \
--with-qtdir=$qtdir \
--with-pyqtdir=$pyqtdir \
$usepybr \
$usexrbr \
--with-boost=$boost_dir \
--with-fftw=$fftw_dir \
--with-cgal=$cgal_dir \
--with-glew=$glew_dir \
$debug

#-std=c++11 -stdlib=libc++ 
# --enable-npruntime
