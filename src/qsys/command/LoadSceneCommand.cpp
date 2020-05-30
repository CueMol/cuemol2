#include <common.h>

#include "LoadSceneCommand.hpp"

#include <boost/filesystem.hpp>
#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SceneXMLReader.hpp>
#include <qsys/StreamManager.hpp>

namespace fs = boost::filesystem;

namespace qsys {

LString LoadSceneCommand::guessFileFormat(int nCatID) const
{
    fs::path file_path = m_filePath.c_str();
    auto extension = LString(file_path.extension().string());

    auto strMgr = qsys::StreamManager::getInstance();
    const auto &infos = strMgr->getStreamHandlerInfo();
    for (const auto &i : infos) {
        // LOG_DPRINTLN("%s: %s", nm.c_str(), shi.nickname.c_str());
        if (i.second.nCatID != nCatID) continue;
        auto &&fext = i.second.fext;
        qlib::LStringList exts;
        if (fext.split_of("; ", exts) == 0) {
            LOG_DPRINTLN("error: %s, %s", i.first.c_str(), fext.c_str());
            continue;
        }
        for (const auto &e : exts) {
            // LOG_DPRINTLN("%s: %s", i.first.c_str(), e.c_str());
            if (e.endsWith(extension)) {
                LOG_DPRINTLN("exten mached: %s==%s (%s)", extension.c_str(), e.c_str(),
                             i.first.c_str());
                return i.second.nickname;
            }
        }
    }

    // not found
    return LString();
}

/// Execute the command
void LoadSceneCommand::run()
{
    if (m_pTargScene.isnull()) {
        auto pScMgr = qsys::SceneManager::getInstance();
        m_pResScene = pScMgr->createScene();
        LOG_DPRINTLN("LoadScene> created new scene: %p %d", m_pResScene.get(),
                     m_pResScene->getUID());
    } else {
        m_pResScene = m_pTargScene;
        LOG_DPRINTLN("LoadScene> load to scene: %p %d", m_pResScene.get(),
                     m_pResScene->getUID());
    }

    constexpr int nCatID = InOutHandler::IOH_CAT_SCEREADER;
    ;
    if (m_fileFmt.isEmpty()) {
        m_fileFmt = guessFileFormat(nCatID);
        if (m_fileFmt.isEmpty()) {
            // cannot determine file format from the file name
            MB_THROW(qlib::RuntimeException, "cannot guess file type");
            return;
        }
    }

    auto strMgr = qsys::StreamManager::getInstance();
    qsys::SceneXMLReaderPtr reader = strMgr->createHandler(m_fileFmt, nCatID);
    reader->setPath(m_filePath);

    reader->attach(m_pResScene);
    reader->read();
    reader->detach();

    LOG_DPRINTLN("Set view camera m_bSetCamera = %d", m_bSetCamera);
    if (m_bSetCamera) {
        const auto &views = m_pResScene->getViewTable();
        for (const auto &elem : views) {
            LOG_DPRINTLN("Set camera to view %p (ID %d)", elem.second.get(),
                         elem.second->getUID());
            m_pResScene->loadViewFromCam(elem.second->getUID(), "__current");
        }
    }
}

void LoadSceneCommand::runGUI(void *pwnd_info) {}

/// Get command's unique name
const char *LoadSceneCommand::getName() const
{
    return "load_scene";
}

}  // namespace qsys
