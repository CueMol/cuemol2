#!/bin/sh

cwd=`pwd`
top_srcdir=$cwd/../src/

install_dir=/net3/ishitani/app64/cuemol2
debug="--enable-debug --enable-m64"
#debug="--disable-debug --enable-m64"

##

#boost_dir=/usr/local

boost_dir=/net3/ishitani/app64/boost_static
#boost_dir=/net3/ishitani/app64/boost_1_56_0

fftw_dir=/net3/ishitani/app64/fftw
cgal_dir=/net3/ishitani/app64/CGAL-3.8

xmlrpc_dir=/net3/ishitani/app64/xmlrpc-c
thrift_dir=/net3/ishitani/proj/thrift

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

# CFLAGS="-O3" CXXFLAGS="-O3" \

env CC=gcc CXX=g++ \
$config_scr \
--enable-cli \
--enable-python \
--with-rmi=thrift \
--with-thrift=$thrift_dir \
--enable-static --disable-shared \
--prefix=$install_dir \
--with-boost=$boost_dir \
--with-fftw=$fftw_dir \
--with-cgal=$cgal_dir \
$debug

# --with-xmlrpc=$xmlrpc_dir \
