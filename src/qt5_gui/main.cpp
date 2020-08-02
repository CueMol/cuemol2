#define NO_USING_QTYPES
#include <common.h>

#include <QApplication>
#include <QCommandLineOption>
#include <QCommandLineParser>
#include <gfx/gfx.hpp>
#include <pybr/pybr.hpp>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>
#include <sysdep/sysdep.hpp>

#include "QtGUIManager.hpp"
#include "QtTextRender.hpp"
#include "QtTimerImpl.hpp"
#include "mainwindow.hpp"
#include "qt5_gui.hpp"

namespace render {
extern bool init();
extern void fini();
}  // namespace render

namespace molstr {
extern bool init();
extern void fini();
}  // namespace molstr

namespace molvis {
extern bool init();
extern void fini();
}  // namespace molvis

namespace xtal {
extern bool init();
extern void fini();
}  // namespace xtal

namespace molanl {
extern bool init();
extern void fini();
}  // namespace molanl

namespace surface {
extern bool init();
extern void fini();
}  // namespace surface

namespace symm {
extern bool init();
extern void fini();
}  // namespace symm

namespace lwview {
extern bool init();
extern void fini();
}  // namespace lwview

namespace anim {
extern bool init();
extern void fini();
}  // namespace anim

namespace mdtools {
extern bool init();
extern void fini();
}  // namespace mdtools

namespace importers {
extern bool init();
extern void fini();
}  // namespace importers

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

    // pybr
    pybr::init(confpath);

    // Setup qt5_gui module
    qt5_gui::QtGUIManager::init();
    // setup timer
    QtTimerImpl::init();
    QtTextRender::init();

    // QCommandLineParser parser;
    // parser.setApplicationDescription("Qt MDI Example");
    // parser.addHelpOption();
    // parser.addVersionOption();
    // parser.addPositionalArgument("file", "The file to open.");
    // parser.process(app);

    MainWindow *pMainWnd = new MainWindow();
    auto pmgr = qt5_gui::QtGUIManager::getInstance();
    pmgr->setMainWindow(pMainWnd);

    // const QStringList posArgs = parser.positionalArguments();
    // for (const QString &fileName : posArgs)
    //   mainWin.openFile(fileName);
    pMainWnd->show();
    return app.exec();
}
