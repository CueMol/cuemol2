######################################################
#
# qt_gui module makefile
#

######################################################

COMMON_SRC = \
qtgui.cpp \
QtMolWidget.cpp \
QtglDisplayContext.cpp \
QtglView.cpp \
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
  @PYTHON_CPPFLAGS@ \
  @BOOST_CPPFLAGS@ \
  $(NULL)

qmqtgui_la_LDFLAGS = \
 -module -avoid-version -export-symbols-regex initqmqtgui \
  -L../qlib \
  @SCR_LDFLAGS@ \
  -L../qsys \
  -L../sysdep \
$(NULL)

qmqtgui_la_LIBADD = \
  @PYTHON_LDADD@ \
  -lqlib \
  @SCR_LDADD@ \
  -lqsys \
  -lsysdep \
  $(NULL)

