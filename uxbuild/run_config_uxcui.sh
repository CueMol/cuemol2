#!/bin/sh

cwd=`pwd`
top_srcdir=$cwd/../src/

#install_dir=$HOME/app/cuemol2
install_dir=/mnt/cuemol2/app

#debug="--enable-debug --enable-m64"
debug="--disable-debug --enable-m64"

usepybr="--with-python"
#usepybr="--disable-python"

# usexrbr="--with-xmlrpc=$HOME/proj64/xmlrpc-c"
usexrbr="--without-xmlrpc"

lcms="--with-lcms=$HOME/app/lcms2-2.7"
xz="--with-xz=$HOME/app/xz-5.2.2"

##

boost_dir=$HOME/app/boost_1_57_0/
fftw_dir=$HOME/app/fftw-3.3.4/
cgal_dir=$HOME/app/CGAL-4.12/

#######################

config_scr=../src/configure

if test ! -f $config_scr; then
    (
	cd ../src
	aclocal; libtoolize; aclocal; autoheader; automake -a; autoconf;
	cd js
#	aclocal; autoheader; automake -a; autoconf;
	aclocal; libtoolize; aclocal; autoheader; automake -a; autoconf;
    )	
fi

# CFLAGS="-O3" CXXFLAGS="-O3" \

env CC=gcc CXX=g++ CXXFLAGS="-std=c++0x -O" \
$config_scr \
--disable-static \
--enable-shared \
--prefix=$install_dir \
$lcms \
$xz \
$usepybr \
$usexrbr \
--enable-cli \
--with-boost=$boost_dir \
--with-fftw=$fftw_dir \
--with-cgal=$cgal_dir \
$debug

