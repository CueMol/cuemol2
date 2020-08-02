#pragma once

#include <qlib/LScrObjects.hpp>
#include <qlib/LVarDict.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include "qt5_gui.hpp"

namespace qt5_gui {

using qlib::LString;

class QT5GUI_API QtGUIManager : public qlib::LSingletonScrObject,
                                public qlib::SingletonBase<QtGUIManager>
{
    using super_t = qlib::SingletonBase<QtGUIManager>;
    MC_SCRIPTABLE;

    void *m_pMainWindow;

public:
    QtGUIManager() : m_pMainWindow(nullptr) {}
    virtual ~QtGUIManager() = default;

    void setMainWindow(void *pwnd);
    LString getMainWindowStr() const;

    static bool init()
    {
        return super_t::init();
    }

    static void fini()
    {
        super_t::fini();
    }
};

}  // namespace qt5_gui

SINGLETON_BASE_DECL(qt5_gui::QtGUIManager);
