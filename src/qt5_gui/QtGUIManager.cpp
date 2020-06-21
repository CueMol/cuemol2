#include <common.h>

#include "QtGUIManager.hpp"

SINGLETON_BASE_IMPL(qt5_gui::QtGUIManager);

namespace qt5_gui {

void QtGUIManager::setMainWindow(void *pwnd)
{
    m_pMainWindow = pwnd;
}

LString QtGUIManager::getMainWindowStr() const
{
    return LString::format("%p", m_pMainWindow);
}

}  // namespace qt5_gui
