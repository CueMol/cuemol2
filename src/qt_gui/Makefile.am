######################################################
#
# qt_gui module makefile
#

######################################################

######################################################
#Qt/PyQt specific rules

%_mocmoc.cpp: %_moc.hpp
	$(QTMOC) $< -o $@

sipqmqtguicmodule.cpp sipqmqtguiQtMolWidget.cpp: qmqtgui.sip
	$(SIP) -c . $(SIPFLAGS) $<

######################################################

COMMON_SRC = \
qtgui.cpp \
QtMolWidget.cpp \
QtTimerImpl.cpp \
QtglDisplayContext.cpp \
QtglView.cpp \
QtMolWidget_mocmoc.cpp \
QtTimerImpl_mocmoc.cpp \
sipqmqtguicmodule.cpp \
sipqmqtguiQtMolWidget.cpp \
$(NULL)

######################################################
# Build Python module

lib_LTLIBRARIES = qmqtgui.la

qmqtgui_la_SOURCES = \
$(COMMON_SRC) \
$(NULL)

qmqtgui_la_CXXFLAGS = \
  @CFLAGS_VIS_HIDDEN@ \
  @CXXFLAGS_VIS_HIDDEN@ \
  -DQTGUI_EXPORTS=1 \
  -I$(top_srcdir) -I$(srcdir) \
  @QT_CPPFLAGS@ \
  @PYTHON_CPPFLAGS@ \
  @BOOST_CPPFLAGS@ \
  @GLEW_CPPFLAGS@ \
  $(NULL)

qmqtgui_la_LDFLAGS = \
 -module -avoid-version \
  @PYTHON_LDFLAGS@ \
  @QT_LDFLAGS@ \
  -L../qlib \
  @SCR_LDFLAGS@ \
  -L../qsys \
  -L../sysdep \
$(NULL)

qmqtgui_la_LIBADD = \
  @PYTHON_LDADD@ \
  @QT_LDADD@ \
  -lqlib \
  @SCR_LDADD@ \
  -lqsys \
  -lsysdep \
  $(NULL)

