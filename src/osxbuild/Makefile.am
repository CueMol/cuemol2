######################################################
#
# $Id: Makefile.am,v 1.7 2011/03/14 14:55:11 rishitani Exp $
#

pkgdata_DATA = \
Info.plist \
PkgInfo \
$(NULL)

XUL_FRAMEWORK_DIR=@XULRUNNER_SDK_PATH@/bin/XUL.framework
XUL_BINDIR=$(XUL_FRAMEWORK_DIR)/Versions/Current
TARGET_BINDIR=CueMol2.app/Contents/MacOS
TARGET_RESDIR=CueMol2.app/Contents/Resources
DEPLOY_DIR=$(top_srcdir)/xul_gui
REL_DEPLOY_DIR=../../../$(DEPLOY_DIR)

install-pkgdataDATA:
	rm -rf "CueMol2.app"
	$(INSTALL) -d "CueMol2.app/Contents/"
	$(INSTALL) -d $(TARGET_BINDIR)
#	$(INSTALL) -d $(TARGET_RESDIR)
	$(LN_S) ../../$(top_srcdir)/xul_gui CueMol2.app/Contents/Resources
	$(INSTALL) -d "CueMol2.app/Contents/Frameworks"
	$(INSTALL) -m 644 Info.plist "CueMol2.app/Contents/Info.plist"
	$(INSTALL) -m 644 $(srcdir)/PkgInfo "CueMol2.app/Contents/PkgInfo"
	$(INSTALL) -m 644 $(DEPLOY_DIR)/chrome/icons/default/cuemol2.icns $(TARGET_RESDIR)/cuemol2.icns
	$(LN_S) $(XUL_FRAMEWORK_DIR) CueMol2.app/Contents/Frameworks/XUL.framework
	$(LN_S) $(XUL_BINDIR)/XUL $(TARGET_BINDIR)/XUL
	$(LN_S) $(XUL_BINDIR)/libfreebl3.dylib $(TARGET_BINDIR)/libfreebl3.dylib
	$(LN_S) $(XUL_BINDIR)/libmozalloc.dylib $(TARGET_BINDIR)/libmozalloc.dylib
	$(LN_S) $(XUL_BINDIR)/libmozglue.dylib $(TARGET_BINDIR)/libmozglue.dylib
	$(LN_S) $(XUL_BINDIR)/libnss3.dylib $(TARGET_BINDIR)/libnss3.dylib
	$(LN_S) $(XUL_BINDIR)/libnssckbi.dylib $(TARGET_BINDIR)/libnssckbi.dylib
	$(LN_S) $(XUL_BINDIR)/libnssdbm3.dylib $(TARGET_BINDIR)/libnssdbm3.dylib
	$(LN_S) $(XUL_BINDIR)/libplugin_child_interpose.dylib $(TARGET_BINDIR)/libplugin_child_interpose.dylib
	$(LN_S) $(XUL_BINDIR)/libsoftokn3.dylib $(TARGET_BINDIR)/libsoftokn3.dylib
	$(LN_S) $(XUL_BINDIR)/plugin-container.app $(TARGET_BINDIR)/plugin-container.app
	$(LN_S) $(XUL_BINDIR)/updater.app $(TARGET_BINDIR)/updater.app
	$(LN_S) $(REL_DEPLOY_DIR)/bin/cuemol $(TARGET_BINDIR)/cuemol
	$(LN_S) $(XUL_BINDIR)/dependentlibs.list $(TARGET_RESDIR)/dependentlibs.list
	$(LN_S) $(XUL_BINDIR)/dictionaries $(TARGET_RESDIR)/dictionaries
	$(LN_S) $(XUL_BINDIR)/gmp-clearkey $(TARGET_RESDIR)/gmp-clearkey


# 	$(LN_S) $(XUL_BINDIR)/omni.ja $(TARGET_RESDIR)/omni.ja
#	$(LN_S) $(XUL_BINDIR)/platform.ini $(TARGET_RESDIR)/platform.ini
#	$(LN_S) $(XUL_BINDIR)/res $(TARGET_RESDIR)/res

#	$(INSTALL) -d "CueMol2.app/Contents/PlugIns"
#	$(LN_S) ../Frameworks/XUL.framework/Versions/Current/libmozutils.dylib "CueMol2.app/Contents/MacOS/libmozutils.dylib"
#	$(LN_S) ../../$(top_srcdir)/xul_gui CueMol2.app/Contents/Resources

# 	$(LN_S) $(REL_DEPLOY_DIR)/application.ini $(TARGET_RESDIR)/application.ini
# 	$(LN_S) $(REL_DEPLOY_DIR)/bin $(TARGET_RESDIR)/bin
# 	$(LN_S) $(REL_DEPLOY_DIR)/chrome $(TARGET_RESDIR)/chrome
# 	$(LN_S) $(REL_DEPLOY_DIR)/chrome.manifest $(TARGET_RESDIR)/chrome.manifest
# 	$(LN_S) $(REL_DEPLOY_DIR)/components $(TARGET_RESDIR)/components
# 	$(LN_S) $(REL_DEPLOY_DIR)/data $(TARGET_RESDIR)/data
# 	$(LN_S) $(REL_DEPLOY_DIR)/defaults $(TARGET_RESDIR)/defaults
# 	$(LN_S) $(REL_DEPLOY_DIR)/document-pdb.icns $(TARGET_RESDIR)/document-pdb.icns
# 	$(LN_S) $(REL_DEPLOY_DIR)/document-qsc.icns $(TARGET_RESDIR)/document-qsc.icns
# 	$(LN_S) $(REL_DEPLOY_DIR)/document-qsl.icns $(TARGET_RESDIR)/document-qsl.icns
# 	$(LN_S) $(REL_DEPLOY_DIR)/harness-options.json $(TARGET_RESDIR)/harness-options.json
# 	$(LN_S) $(REL_DEPLOY_DIR)/lib $(TARGET_RESDIR)/lib
# 	$(LN_S) $(REL_DEPLOY_DIR)/resources $(TARGET_RESDIR)/resources
# 	$(LN_S) $(REL_DEPLOY_DIR)/scripts $(TARGET_RESDIR)/scripts
# 	$(LN_S) $(REL_DEPLOY_DIR)/sysconfig.xml $(TARGET_RESDIR)/sysconfig.xml


builddmg:
	perl make_distr.pl CueMol2.app $(XUL_FRAMEWORK_DIR)

buildpovdmg:
	perl add_povray.pl CueMol2.app xxx $(HOME)/bundle/povray/ $(HOME)/bundle/ffmpeg/
