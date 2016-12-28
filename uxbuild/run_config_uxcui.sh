#!/bin/sh

cwd=`pwd`
top_srcdir=$cwd/../src/

install_dir=$HOME/app/cuemol2
#debug="--enable-debug --enable-m64"
debug="--disable-debug --enable-m64"

usepybr="--enable-python"
#usepybr="--disable-python"

#usexrbr="--with-xmlrpc=$HOME/proj64/xmlrpc-c"
usexrbr="--without-xmlrpc"

##

#boost_dir=/usr/local

#boost_dir=/net3/ishitani/app64/boost_static
boost_dir=/home/ishitani/app/boost_1_60_0
fftw_dir=/net3/ishitani/app64/fftw
cgal_dir=/home/ishitani/app/CGAL-4.6.1/

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

env CC=gcc CXX=g++ \
$config_scr \
CXXFLAGS="-std=c++0x -O" \
--disable-static \
--enable-shared \
--prefix=$install_dir \
--with-boost=$boost_dir \
$usepybr \
$usexrbr \
--enable-cli \
--enable-python \
--with-fftw=$fftw_dir \
--with-cgal=$cgal_dir \
$debug

