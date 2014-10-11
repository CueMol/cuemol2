######################################################
#
# $Id: Makefile.am,v 1.2 2010/12/19 13:17:26 rishitani Exp $
#

JARMAKER = $(srcdir)/jarmaker/make-jars.pl
PREPROC = $(srcdir)/jarmaker/preprocessor.pl

chromedir=${prefix}/chrome
# xul_guidir=${prefix}

pkgdata_DATA = \
$(NULL)

install-pkgdataDATA:
	rm -fr $(chromedir)/cuemol2
	rm -f $(chromedir)/cuemol2.jar
	rm -f $(chromedir)/cuemol2.manifest
	perl $(PREPROC) < $(srcdir)/chrome/jar.mn >  $(srcdir)/chrome/jar.mn_processed
	perl $(JARMAKER) \
		-d $(chromedir) \
		-s $(srcdir)/chrome \
		-p $(PREPROC) \
		-z zip < $(srcdir)/chrome/jar.mn_processed
	rm -fr $(chromedir)/cuemol2
