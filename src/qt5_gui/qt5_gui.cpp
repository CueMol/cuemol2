// -*-Mode: C++;-*-
//
//  Qt5 OpenGL dependent molecular viewer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "qt5_gui.hpp"

#include <qlib/EventManager.hpp>
#include <qlib/LString.hpp>

#include "CmdMgr.hpp"
#include "NewSceneCommand.hpp"
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
    CmdMgr::init();
    qsys::View::setViewFactory(new QtGlViewFactory);

    CmdMgr *pMgr = CmdMgr::getInstance();
    CommandPtr pcmd(MB_NEW NewSceneCommand());
    pMgr->regist(pcmd);

    return true;
}

void fini()
{
    CmdMgr::fini();
    qt5gui_unregClasses();
}

}  // namespace qt5_gui
