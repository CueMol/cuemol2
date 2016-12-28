#!/bin/sh

cwd=`pwd`

top_srcdir=$cwd/../src/
install_dir=$top_srcdir/xul_gui/
debug="--disable-debug --enable-m64"
#debug="--enable-debug --enable-m64"

#usepybr="--enable-python"
usepybr="--disable-python"

#usexrbr="--with-xmlrpc=$HOME/proj64/xmlrpc-c"
usexrbr="--without-xmlrpc"

lcms="--with-lcms=$HOME/proj64/lcms2"

xz="--with-xz=$HOME/proj64/xz"

##

gecko_sdk_dir=$HOME/proj64/xulrunner/xulrunner-39.0-sdk
#gecko_sdk_dir=$HOME/proj64/xulrunner/xulrunner-39.0-obj/dist

boost_dir=$HOME/proj64/boost_1_57/
fftw_dir=$HOME/proj64/fftw
cgal_dir=$HOME/proj64/CGAL-4.6.1/
glew_dir=$HOME/proj64/glew

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

env CC="clang" \
CFLAGS="-O3" \
CXX="clang++" \
CXXFLAGS=" -O3 -Wno-parentheses-equality -Wno-c++11-narrowing -Wno-extra-tokens -Wno-invalid-pp-token" \
$config_scr \
--disable-static \
--enable-shared \
--prefix=$install_dir \
$lcms \
$xz \
$usepybr \
$usexrbr \
--with-xulrunner-sdk=$gecko_sdk_dir \
--with-boost=$boost_dir \
--with-fftw=$fftw_dir \
--with-cgal=$cgal_dir \
--with-glew=$glew_dir \
$debug

#-std=c++11 -stdlib=libc++ 
# --enable-npruntime
