#include <common.h>

#include "LoadSceneCommand.hpp"

#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SceneXMLReader.hpp>
#include <qsys/StreamManager.hpp>

namespace qsys {

/// Execute the command
void LoadSceneCommand::run()
{
    if (m_pTargScene.isnull()) {
        auto pScMgr = qsys::SceneManager::getInstance();
        m_pResScene = pScMgr->createScene();
    } else {
        m_pResScene = m_pTargScene;
    }

    auto strMgr = qsys::StreamManager::getInstance();
    qsys::SceneXMLReaderPtr reader = strMgr->createHandler("qsc_xml", 3);
    reader->setPath(m_filePath);

    reader->attach(m_pResScene);
    reader->read();
    reader->detach();

    // m_pResScene->loadViewFromCam(m_nViewID, "__current");
}

void LoadSceneCommand::runGUI(void *pwnd_info) {}

/// Get command's unique name
const char *LoadSceneCommand::getName() const
{
    return "load_scene";
}

}  // namespace qsys
