#define NO_USING_QTYPES
#include <common.h>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>
#include <gfx/gfx.hpp>
#include <sysdep/sysdep.hpp>

#include <QApplication>
#include <QCommandLineParser>
#include <QCommandLineOption>

#include "mainwindow.hpp"
#include "qt5_gui.hpp"
#include "QtTimerImpl.hpp"
#include "QtTextRender.hpp"

namespace render {
  extern bool init();
  extern void fini();
}

namespace molstr {
  extern bool init();
  extern void fini();
}

namespace molvis {
  extern bool init();
  extern void fini();
}

namespace xtal {
  extern bool init();
  extern void fini();
}

namespace molanl {
  extern bool init();
  extern void fini();
}

namespace surface {
  extern bool init();
  extern void fini();
}

namespace symm {
  extern bool init();
  extern void fini();
}

namespace lwview {
  extern bool init();
  extern void fini();
}

namespace anim {
  extern bool init();
  extern void fini();
}

namespace mdtools {
  extern bool init();
  extern void fini();
}

namespace importers {
  extern bool init();
  extern void fini();
}

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

int main(int argc, char *argv[])
{
  // Q_INIT_RESOURCE(mdi);

  QApplication app(argc, argv);
  QCoreApplication::setApplicationName("CueMol2");
  QCoreApplication::setOrganizationName("CueMol");
  QCoreApplication::setApplicationVersion(QT_VERSION_STR);

  //////////

  qlib::LString confpath;
  confpath = DEFAULT_CONFIG;

  qlib::init();
  qsys::init(confpath);
  sysdep::init();

  // load other modules
  render::init();
  molstr::init();
  molvis::init();
  xtal::init();
  symm::init();
  surface::init();
  molanl::init();
  lwview::init();
  anim::init();
  mdtools::init();
  importers::init();
  qt5_gui::init();

  // setup timer
  QtTimerImpl::init();  
  QtTextRender::init();  

  // QCommandLineParser parser;
  // parser.setApplicationDescription("Qt MDI Example");
  // parser.addHelpOption();
  // parser.addVersionOption();
  // parser.addPositionalArgument("file", "The file to open.");
  // parser.process(app);

  MainWindow mainWin;
  // const QStringList posArgs = parser.positionalArguments();
  // for (const QString &fileName : posArgs)
  //   mainWin.openFile(fileName);
  mainWin.show();
  return app.exec();
}
