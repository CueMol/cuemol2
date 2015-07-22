######################################################
#
# $Id: Makefile.am,v 1.7 2011/03/14 14:55:11 rishitani Exp $
#

pkgdata_DATA = \
Info.plist \
PkgInfo \
$(NULL)

XUL_FRAMEWORK_DIR=@XULRUNNER_SDK_PATH@/bin/XUL.framework

install-pkgdataDATA:
	sh make_appbundle.sh

builddmg:
	perl make_distr.pl CueMol2.app $(XUL_FRAMEWORK_DIR)

buildpovdmg:
	perl add_povray.pl CueMol2.app xxx $(HOME)/bundle/povray/ $(HOME)/bundle/ffmpeg/

