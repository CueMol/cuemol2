######################################################
#
# $Id: Makefile.am,v 1.7 2011/03/14 14:55:11 rishitani Exp $
#

pkgdata_DATA = \
Info.plist \
$(NULL)

XUL_FRAMEWORK_DIR=@XULRUNNER_SDK_PATH@/bin/XUL.framework

install-pkgdataDATA:
	rm -rf "CueMol2.app"
	$(INSTALL) -d "CueMol2.app/Contents/"
	$(INSTALL) -d "CueMol2.app/Contents/MacOS/"
	$(INSTALL) -d "CueMol2.app/Contents/Frameworks"
	$(INSTALL) -d "CueMol2.app/Contents/PlugIns"
	$(INSTALL) -m 644 Info.plist "CueMol2.app/Contents/Info.plist"
	$(LN_S) ../../$(top_srcdir)/xul_gui CueMol2.app/Contents/Resources
	$(INSTALL) -m 644 $(top_srcdir)/xul_gui/chrome/icons/default/cuemol2.icns "CueMol2.app/Contents/Resources/cuemol2.icns"
	$(LN_S) $(XUL_FRAMEWORK_DIR) CueMol2.app/Contents/Frameworks/XUL.framework
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/xulrunner CueMol2.app/Contents/MacOS/xulrunner
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/dependentlibs.list CueMol2.app/Contents/MacOS/dependentlibs.list
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/libmozglue.dylib CueMol2.app/Contents/MacOS/libmozglue.dylib
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/libnss3.dylib CueMol2.app/Contents/MacOS/libnss3.dylib
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/libmozalloc.dylib CueMol2.app/Contents/MacOS/libmozalloc.dylib
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/XUL CueMol2.app/Contents/MacOS/XUL
	$(LN_S) ../Resources/bin/cuemol CueMol2.app/Contents/MacOS/cuemol

#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/libmozutils.dylib "CueMol2.app/Contents/MacOS/libmozutils.dylib"

builddmg:
	perl make_distr.pl CueMol2.app $(XUL_FRAMEWORK_DIR)

buildpovdmg:
	perl add_povray.pl CueMol2.app xxx $(HOME)/bundle/povray/ $(HOME)/bundle/ffmpeg/
