#!/bin/sh

debug="--disable-debug"
debug_cflag="-Os"

# debug="--enable-debug"
# debug_cflag="-O0 -g"

# arch=i386
# platform=iPhoneSimulator

arch=armv7
platform=iPhoneOS

##

boost_dir=$HOME/iosproj/boost-$(arch)/
fftw_dir=$HOME/proj/
libpng_dir=$HOME/proj/

#######################

config_scr=../src/configure

if test ! -f $config_scr; then
    (
	cd ../src
	aclocal; glibtoolize --force; aclocal; autoheader; automake -a; autoconf;
	cd js
	aclocal; autoheader; automake -a; autoconf;
    )	
fi


#######################

default_gcc_version=4.2
default_iphoneos_version=5.0
default_iphoneos_version_digit=50000
default_macos_version=10.6

GCC_VERSION="${GCC_VERSION:-$default_gcc_version}"
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-$default_iphoneos_version}"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-$default_macos_version}"

extra_cflags="-D__IPHONE_OS_VERSION_MIN_REQUIRED=$default_iphoneos_version_digit"
echo "extra cflags: $extra_cflags"

platform_dir="/Developer/Platforms/${platform}.platform/Developer"
platform_bin_dir="${platform_dir}/usr/bin"
platform_sdk_dir="${platform_dir}/SDKs/${platform}${IPHONEOS_DEPLOYMENT_TARGET}.sdk"
prefix="${prefix:-${HOME}${platform_sdk_dir}}"

#######################

# export CC="${platform_bin_dir}/gcc-${GCC_VERSION}"
#export CFLAGS="-arch ${arch} -pipe -isysroot ${platform_sdk_dir} -mmacosx-version-min=${default_macos_version} ${extra_cflags}"
#export LDFLAGS="-arch ${arch} -isysroot ${platform_sdk_dir}"
#export CXX="${platform_bin_dir}/g++-${GCC_VERSION}"
#export CPP="/Developer/usr/bin/cpp-${GCC_VERSION}"
# install_dir=$cwd/build-${platform}-${arch}/

export CC="${platform_bin_dir}/gcc"
export CFLAGS="-arch ${arch} -pipe -isysroot ${platform_sdk_dir} ${extra_cflags} ${debug_cflag}"
export LDFLAGS=""
export CXX="${platform_bin_dir}/g++"
export CXXFLAGS="${CFLAGS}"
export CPP="/Developer/usr/bin/cpp"
export CXXCPP="${CPP}"

cwd=`pwd`
# install_dir=$cwd/build-${platform}-${arch}/
install_dir=$cwd/build/

env \
$config_scr \
--host="${arch}-apple-darwin" \
--prefix=$install_dir \
--enable-lightweight \
--enable-iphoneos \
--with-boost=$boost_dir \
--disable-shared \
--enable-static \
$debug

#--enable-cli

