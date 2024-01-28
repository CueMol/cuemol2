#!/bin/bash

SRC_DIR=../../../src/Pale-Moon

diff -x "*.pyc" -x "*~" -r -u $SRC_DIR/platform platform > uxp_diff.patch
