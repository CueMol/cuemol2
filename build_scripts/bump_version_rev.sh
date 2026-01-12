#!/bin/bash

TOPDIR=$(cd $(dirname $0)/..; pwd)
VENV_DIR=$TOPDIR/.venv

if [ ! -d $VENV_DIR ]; then
    python3 -m venv $VENV_DIR
fi
source $VENV_DIR/bin/activate
pip install --upgrade bump-my-version

cd $TOPDIR
bump-my-version --version
bump-my-version show
bump-my-version bump --allow-dirty --verbose patch
