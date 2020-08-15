#include <common.h>

#include "NewSceneCommand.hpp"

#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>

namespace qsys {

/// Execute the command
void NewSceneCommand::run()
{
    auto pScMgr = qsys::SceneManager::getInstance();
    auto pSc = pScMgr->createScene();

    if (m_sceneName.isEmpty()) {
        pSc->setName(generateNewSceneName());
    } else {
        pSc->setName(m_sceneName);
    }

    m_pResScene = pSc;
    if (m_bIsCreateView) {
        auto pView = pSc->createView();
        pView->setName("0");
        m_pResView = pView;
        // auto &&pchild = pWnd->createMolWidget();
        // pchild->bind(pSc->getUID(), pView->getUID());
        // pchild->showMaximized();
        if (m_bIsSetActive)
            pSc->setActiveViewID(pView->getUID());
    }

    if (m_bIsSetActive)
        pScMgr->setActiveSceneID(pSc->getUID());

}

void NewSceneCommand::runGUI(void *pwnd_info) {}

/// Get command's unique name
const char *NewSceneCommand::getName() const
{
    return "new_scene";
}

LString NewSceneCommand::generateNewSceneName() const
{
    auto pScMgr = qsys::SceneManager::getInstance();

    for (int i=1; ; ++i) {
        auto s = LString::format("Untitled %d", i);
        if (pScMgr->getSceneByName(s).isnull())
            return s;
    }
}

}  // namespace qsys
