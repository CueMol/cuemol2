// -*-Mode: C++;-*-
//
//  Qt5 OpenGL dependent molecular viewer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "qt5_gui.hpp"

#include <qlib/EventManager.hpp>
#include <qlib/LString.hpp>

// #include <qsys/command/CmdMgr.hpp>
// #include "QtNewSceneCommand.hpp"
// #include "QtLoadSceneCommand.hpp"
// #include "QtLoadObjectCommand.hpp"
#include "QtGlView2.hpp"
#include "QtTimerImpl.hpp"

void qt5gui_regClasses();
void qt5gui_unregClasses();

namespace qt5_gui {

class QtGlViewFactory : public qsys::ViewFactory
{
public:
    QtGlViewFactory() {}
    virtual ~QtGlViewFactory() {}
    virtual qsys::View* create()
    {
        return new qt5_gui::QtGlView2();
    }
};

bool init()
{
    // qt5gui_regClasses();
    qsys::View::setViewFactory(new QtGlViewFactory);

    // auto pMgr = qsys::CmdMgr::getInstance();
    // pMgr->regist<QtNewSceneCommand>();
    // pMgr->regist<QtLoadSceneCommand>();
    // pMgr->regist<QtLoadObjectCommand>();

    QtTimerImpl::init();
    // QtTextRender::init();

    return true;
}

void fini()
{
    // qt5gui_unregClasses();
}

}  // namespace qt5_gui

void qt5gui_init()
{
    LOG_DPRINTLN("XXXXX qt5gui_init called!!");
    qt5_gui::init();
}
