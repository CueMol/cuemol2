#!/bin/sh

# debug="--disable-debug"
# debug="--enable-debug --enable-gles2"
debug="--enable-debug"

arch=i386
platform=iPhoneSimulator

# arch=armv7
# platform=iPhoneOS

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
export CFLAGS="-arch ${arch} -pipe -isysroot ${platform_sdk_dir} ${extra_cflags} -g -O0"
export LDFLAGS=""
export CXX="${platform_bin_dir}/g++"
export CXXFLAGS="${CFLAGS}"
export CPP="/Developer/usr/bin/cpp"
export CXXCPP="${CPP}"

cwd=`pwd`
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

#/Developer/Platforms/iPhoneSimulator.platform/Developer/usr/bin/gcc-4.2 -x c++ -arch i386 -fmessage-length=0 -pipe -Wno-trigraphs -fpascal-strings -fasm-blocks -O0 -Wreturn-type -Wunused-variable -DHAVE_CONFIG_H -DDEBUG -isysroot /Developer/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator4.3.sdk -fexceptions -fvisibility=hidden -fvisibility-inlines-hidden -mmacosx-version-min=10.6 -gdwarf-2 -D__IPHONE_OS_VERSION_MIN_REQUIRED=40300 -iquote /Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/Untitled-generated-files.hmap -I/Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/Untitled-own-target-headers.hmap -I/Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/Untitled-all-target-headers.hmap -iquote /Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/Untitled-project-headers.hmap -F/Users/user/Documents/Untitled/build/Debug-iphonesimulator -I/Users/user/Documents/Untitled/build/Debug-iphonesimulator/include -I/Users/user/proj/boost-iphone/include -I/Users/user/proj/cuemol2-ios-test/src -I/Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/DerivedSources/i386 -I/Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/DerivedSources -include /var/folders/89/89e97aoUH84AQgzRH+iSik+++TI/-Caches-/com.apple.Xcode.501/SharedPrecompiledHeaders/Untitled_Prefix-cudeyayqkrwuplfouolubyihgbsf/Untitled_Prefix.pch -c /Users/user/Documents/Untitled/Classes/testboost.cpp -o /Users/user/Documents/Untitled/build/Untitled.build/Debug-iphonesimulator/Untitled.build/Objects-normal/i386/testboost.o

