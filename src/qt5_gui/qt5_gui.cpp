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
#include "QtGlView.hpp"

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
    CmdMgr::init();
    qsys::View::setViewFactory(new QtGlViewFactory);
    return true;
}

void fini()
{
    CmdMgr::fini();
}

}  // namespace qt5_gui
