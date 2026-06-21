#!/bin/bash
set -eux

# Dependency versions are defined in build_scripts/deplibs.env
. "$(cd "$(dirname "$0")/.."; pwd)/deplibs.env"

BASEDIR=$1
RUNNER_OS=$2
RUNNER_ARCH=$3

##########

TMPDIR=$BASEDIR/tmp
mkdir -p $TMPDIR
cd $TMPDIR

# Retrieve deplibs binary
DEPLIBS_TGZ=deplibs_${RUNNER_OS}_${RUNNER_ARCH}.tar.bz2
URL=https://github.com/CueMol/build_scripts/releases/download/$DEPLIBS_VERSION/$DEPLIBS_TGZ

# wget --progress=dot:mega -c \
curl -sS -L -O $URL
     
# xattr -cr $DEPLIBS_TGZ

# Extract into a clean staging dir, then move each top-level entry into BASEDIR,
# replacing any pre-existing copy. Keeps re-downloads idempotent (e.g. after a
# DEPLIBS_VERSION bump) instead of failing the move on an existing same-named dir
# that an older bundle already placed. nullglob guards against an empty staging
# dir so the rm never expands to "$BASEDIR/*".
rm -rf target
tar xjf $DEPLIBS_TGZ

shopt -s nullglob
for entry in target/*; do
  rm -rf "$BASEDIR/$(basename "$entry")"
  mv "$entry" "$BASEDIR/"
done
shopt -u nullglob
rmdir target 2>/dev/null || true
