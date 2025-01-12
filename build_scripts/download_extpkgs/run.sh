#!/bin/bash
#
# download external packages in posix
# usage: run.sh base_dir host_os host_arch
#  host_os ... macOS
#  host_arch ... ARM64, X64

usage()
{
    echo "usage: run.sh base_dir host_os host_arch"
    echo "  host_os ... macOS"
    echo "  host_arch ... ARM64 X64"
    exit 1
}

if [ -z "${1:-}" ] || [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
   usage
fi

set -eux

BASEDIR=$1
RUNNER_OS=$2
RUNNER_ARCH=$3

TMPDIR=$BASEDIR/tmp
mkdir -p $TMPDIR
cd $TMPDIR

##########
# APBS/PDB2PQR

APBSPKG_VER=v0.0.2

# Retrieve apbs binary
APBSPKG_TGZ=apbs_${RUNNER_OS}_${RUNNER_ARCH}.tar.bz2

wget --progress=dot:mega -c \
     https://github.com/CueMol/apbs_bundle/releases/download/$APBSPKG_VER/$APBSPKG_TGZ
if [ $RUNNER_OS = "macOS" ]; then
    xattr -cr $APBSPKG_TGZ
fi
tar xjf $APBSPKG_TGZ

if [ -d $BASEDIR/apbs ]; then
    rm -rf $BASEDIR/apbs
fi
mv apbs $BASEDIR/

##########
# POVRAY

POVRAYPKG_VER=v0.0.5
# Retrieve povray binary
POVRAYPKG_TGZ=povray_${RUNNER_OS}_${RUNNER_ARCH}.tar.bz2

wget --progress=dot:mega -c \
     https://github.com/CueMol/povray_build/releases/download/$POVRAYPKG_VER/$POVRAYPKG_TGZ
if [ $RUNNER_OS = "macOS" ]; then
    xattr -cr $POVRAYPKG_TGZ
fi
tar xjf $POVRAYPKG_TGZ

if [ -d $BASEDIR/povray ]; then
    rm -rf $BASEDIR/povray
fi
mv povray $BASEDIR/

##########
# FFMPEG
if [ $RUNNER_OS = "Linux" ]; then
    # TODO: impl
    return 0
fi

# Retrieve ffmpeg bin
if [ $RUNNER_ARCH = "ARM64" ]; then
    FFMPEG_DIST=ffmpeg61arm
elif [ $RUNNER_ARCH = "X64" ]; then
    FFMPEG_DIST=ffmpeg61intel
else
    echo "unknown runner arch: $RUNNER_ARCH"
    exit 1
fi

wget --progress=dot:mega -c https://www.osxexperts.net/${FFMPEG_DIST}.zip
if [ $RUNNER_OS = "macOS" ]; then
    xattr -cr ${FFMPEG_DIST}.zip
fi
mkdir -p $BASEDIR/ffmpeg/bin
cd $BASEDIR/ffmpeg/bin
unzip -o $TMPDIR/${FFMPEG_DIST}.zip
# popd
