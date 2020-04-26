#define NO_USING_QTYPES

#include <common.h>

#include "NewSceneCommand.hpp"

#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>

#include "QtMolWidget.hpp"
#include "mainwindow.hpp"

namespace qt5_gui {

/// Execute the command
void NewSceneCommand::run() {}

void NewSceneCommand::runGUI(QWidget *pwnd_info)
{
    auto pWnd = dynamic_cast<MainWindow *>(pwnd_info);
    if (pWnd == NULL) {
        MB_THROW(qlib::RuntimeException, "Invalid pwnd_info");
        return;
    }

    auto pScMgr = qsys::SceneManager::getInstance();
    auto pSc = pScMgr->createScene();

    if (m_sceneName.isEmpty()) {
        // TO DO: locale dependent
        pSc->setName("Untitled");
    } else {
        pSc->setName(m_sceneName);
    }

    if (m_bIsCreateView) {
        auto &&pchild = pWnd->createMolWidget();
        auto pView = pSc->createView();
        pView->setName("0");
        pchild->bind(pSc->getUID(), pView->getUID());
        pchild->showMaximized();
    }
}

/// Get command's unique name
const char *NewSceneCommand::getName() const
{
    return "new_scene";
}

}  // namespace qt5_gui
