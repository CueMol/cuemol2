#pragma once

#include <qlib/LScrObjects.hpp>
#include <qlib/LUIDObject.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>

namespace qsys {

/// Abstract Command
class QSYS_API Command : public qlib::LSimpleCopyScrObject, public qlib::LUIDObject
{
    MC_SCRIPTABLE;

private:
    /// Unique id of this obj
    ///  (TO DO: move to LUIDObject??)
    qlib::uid_t m_uid;

public:
    Command();
    virtual ~Command();

    /// Execute the command
    virtual void run() = 0;

    virtual void runGUI(void *pwnd_info) = 0;

    /// Get command's unique name
    virtual const char *getName() const = 0;

    qlib::uid_t getUID() const
    {
        return m_uid;
    }
};

MC_DECL_SCRSP(Command);

}  // namespace qsys


//////////

#if 0
#include "qsys/SceneManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/StreamManager.hpp"
#include "sysdep/MouseEventHandler.hpp"

/// Open scene file command class
class SceneOpenCommand : public AbstractCommand
{
private:
    // arguments

    /// Target scene file name
    qlib::LString m_fileName;

    /// Target Scene ID
    qlib::uid_t m_nSceneID;

    /// Target View ID
    qlib::uid_t m_nViewID;

public:
    SceneOpenCommand() : m_nSceneID(qlib::invalid_uid), m_nViewID(qlib::invalid_uid) {}
    virtual ~SceneOpenCommand() = default;

    qlib::LString getFileName() const
    {
        return m_fileName;
    }
    void setFileName(const qlib::LString &val)
    {
        m_fileName = val;
    }

    qlib::uid_t getSceneID() const
    {
        return m_nSceneID;
    }
    void setSceneID(qlib::uid_t val)
    {
        m_nSceneID = val;
    }

    qlib::uid_t getViewID() const
    {
        return m_nViewID;
    }
    void setViewID(qlib::uid_t val)
    {
        m_nViewID = val;
    }

    void enumerateStreamHandlers() const {
        auto strMgr = qsys::StreamManager::getInstance();
        auto nhs = strMgr->getStreamHandlerKeys();
        // LOG_DPRINTLN("num handlers: %d", nhs);
        for (auto nm : nhs) {
            auto shi = strMgr->getStreamHandlerInfo(nm);
            LOG_DPRINTLN("%s: %s", nm.c_str(), shi.nickname.c_str());
        }
    }

    virtual void run()
    {
        enumerateStreamHandlers();

        qlib::LString fileName = m_fileName;
        if (fileName.isEmpty()) {
            // if the file name is not supplied, get it from GUI.
            const QString qfileName = QFileDialog::getOpenFileName(
                nullptr, "Open scene file", "", "CueMol Scene (*.qsc)");
            auto utf8fname = qfileName.toUtf8();
            fileName = utf8fname.constData();
        }

        // TO DO: read to the active scene/view, if not supplied.
        auto scMgr = qsys::SceneManager::getInstance();
        auto scene = scMgr->getScene(m_nSceneID);
        scene->clearAllData();

        auto strMgr = qsys::StreamManager::getInstance();
        qsys::SceneXMLReaderPtr reader =
            strMgr->createHandler("qsc_xml", qsys::InOutHandler::IOH_CAT_SCEREADER);
        reader->setPath(fileName);

        reader->attach(scene);
        reader->read();
        reader->detach();

        scene->loadViewFromCam(m_nViewID, "__current");
    }

};
}  // namespace qsys
#endif
