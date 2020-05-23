// -*-Mode: C++;-*-
//
//  Qt5 OpenGL dependent molecular viewer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "qt5_gui.hpp"

#include <qlib/EventManager.hpp>
#include <qlib/LString.hpp>

#include <qsys/command/CmdMgr.hpp>
#include "QtNewSceneCommand.hpp"
#include "QtGlView.hpp"

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
        return new qt5_gui::QtGlView();
    }
};

bool init()
{
    qt5gui_regClasses();
    qsys::CmdMgr::init();
    qsys::View::setViewFactory(new QtGlViewFactory);

    auto pMgr = qsys::CmdMgr::getInstance();
    // qsys::CommandPtr pcmd(MB_NEW QtNewSceneCommand());
    // pMgr->regist(pcmd);
    pMgr->regist<QtNewSceneCommand>();

    return true;
}

void fini()
{
    qt5gui_unregClasses();
}

}  // namespace qt5_gui
