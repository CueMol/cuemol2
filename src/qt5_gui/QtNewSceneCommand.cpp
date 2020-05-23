#define NO_USING_QTYPES

#include <common.h>

#include "QtNewSceneCommand.hpp"

#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>

#include "QtMolWidget.hpp"
#include "mainwindow.hpp"

namespace qt5_gui {

void QtNewSceneCommand::runGUI(void *pwnd_info)
{
    qsys::NewSceneCommand::run();
    
    if (m_bIsCreateView) {
        auto pWnd = dynamic_cast<MainWindow *>(reinterpret_cast<QWidget *>(pwnd_info));
        if (pWnd == NULL) {
            MB_THROW(qlib::RuntimeException, "Invalid pwnd_info");
            return;
        }

        auto &&pchild = pWnd->createMolWidget();
        pchild->bind(m_pResScene->getUID(), m_pResView->getUID());
        pchild->showMaximized();
    }
}

/// Get command's unique name
const char *QtNewSceneCommand::getName() const
{
    return "qt_new_scene";
}

}  // namespace qt5_gui
