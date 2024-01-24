#!/bin/bash

SRC_DIR=../../Pale-Moon

diff -x "*.pyc" -x "*~" -r -u $SRC_DIR/platform platform > uxp_diff.patch
