#!/bin/sh

cwd=`pwd`

top_srcdir=$cwd/../src/
install_dir=$top_srcdir/xul_gui/
debug="--enable-debug --enable-m64"

#usepybr="--enable-python"
usepybr="--disable-python"

usexrbr="--with-xmlrpc=/net3/ishitani/app64/xmlrpc-c"
#usexrbr="--without-xmlrpc"

##

# Release version
gecko_sdk_dir=/net3/ishitani/src/xulrunner/xulrunner-23.0.1-sdk/
#gecko_sdk_dir=/net3/ishitani/src/xulrunner/xulrunner-9.0.1-rel/dist/
gecko_rt_dir=/net3/ishitani/src/xulrunner/xulrunner-23.0.1-rt/

# Debug version
# gecko_sdk_dir=/net3/ishitani/src/xulrunner/xulrunner-2.0-obj/dist/

#boost_dir=/usr/local
boost_dir=/net3/ishitani/app64/boost
# boost_dir=/net3/ishitani/app64/boost_1_56_0
fftw_dir=/net3/ishitani/app64/fftw
cgal_dir=/net3/ishitani/app64/CGAL-3.8
glew_dir=/net3/ishitani/app64/glew

#######################

config_scr=../src/configure

if test ! -f $config_scr; then
    (
	cd ../src
	aclocal; libtoolize; aclocal; autoheader; automake -a; autoconf;
	cd js
	aclocal; autoheader; automake -a; autoconf;
    )	
fi

env CC=gcc CXX=g++ \
CFLAGS="-O0 -g -fPIC -DPIC" CXXFLAGS="-O0 -g -fPIC -DPIC" \
$config_scr \
--disable-static \
--enable-shared \
--prefix=$install_dir \
$usepybr \
$usexrbr \
--with-xulrunner-sdk=$gecko_sdk_dir \
--with-xulrunner-runtime=$gecko_rt_dir \
--with-boost=$boost_dir \
--with-fftw=$fftw_dir \
--with-cgal=$cgal_dir \
--with-glew=$glew_dir \
$debug

# $config_scr \
# --prefix=$install_dir \
# --with-boost=$boost_dir \
# --disable-xpcom \
# --disable-npruntime

