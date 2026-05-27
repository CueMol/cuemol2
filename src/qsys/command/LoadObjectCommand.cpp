#include <common.h>

#include "LoadObjectCommand.hpp"

#include <boost/filesystem.hpp>
#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ObjReader.hpp>
#include <qsys/StreamManager.hpp>

namespace fs = boost::filesystem;

namespace qsys {

// TO DO: use common impl with LoadSceneCommand
LString LoadObjectCommand::guessFileFormat(int nCatID, bool bContentFirst,
                                           qlib::quint64 maxSniffBytes) const
{
    auto strMgr = qsys::StreamManager::getInstance();

    if (bContentFirst) {
        // Content-first mode: ignore the extension entirely. Ask every
        // registered reader of nCatID whether the head of the file
        // matches its format and return the first YES.
        return strMgr->searchReaderByContent(m_filePath, LString(), nCatID,
                                             /*supportCompression=*/false,
                                             maxSniffBytes);
    }

    // Ext-first mode: collect every reader whose registered fext matches
    // the file's extension.
    fs::path file_path = m_filePath.c_str();
    auto extension = LString(file_path.extension().string());

    qlib::LStringList extCandidates;
    const auto &infos = strMgr->getStreamHandlerInfo();
    for (const auto &i : infos) {
        if (i.second.nCatID != nCatID) continue;
        auto &&fext = i.second.fext;
        qlib::LStringList exts;
        if (fext.split_of("; ", exts) == 0) {
            LOG_DPRINTLN("error: %s, %s", i.first.c_str(), fext.c_str());
            continue;
        }
        for (const auto &e : exts) {
            if (e.endsWith(extension)) {
                extCandidates.push_back(i.second.nickname);
                break;
            }
        }
    }

    if (extCandidates.empty()) return LString();
    if (extCandidates.size() == 1) {
        // Unique extension match: legacy behaviour, no sniff needed.
        return extCandidates.front();
    }

    // Several readers share the extension -- disambiguate by content
    // among just those candidates.
    LString hit = strMgr->searchReaderByContent(
        m_filePath, LString::join(",", extCandidates), nCatID,
        /*supportCompression=*/false, maxSniffBytes);
    if (!hit.isEmpty()) return hit;

    // Sniff yielded nothing (file too short, no candidate implements
    // canHandleContent, etc). Fall through to the first ext-matched
    // candidate so the load at least attempts to proceed.
    return extCandidates.front();
}

/// Execute the command
void LoadObjectCommand::run()
{
    MB_ASSERT(!m_pTargScene.isnull());

    if (m_fileFmt.isEmpty()) {
        m_fileFmt = guessFileFormat(nCatID, m_bContentFirst, m_nMaxSniffBytes);
        if (m_fileFmt.isEmpty()) {
            // cannot determine file format from the file name
            MB_THROW(qlib::RuntimeException, "cannot guess file type");
            return;
        }
    }

    auto strMgr = qsys::StreamManager::getInstance();
    qsys::ObjReaderPtr reader = strMgr->createHandler(m_fileFmt, nCatID);
    reader->setPath(m_filePath);

    // check compression
    fs::path file_path = m_filePath.c_str();
    auto extension = LString(file_path.extension().string());
    if (extension.equalsIgnoreCase(".gz"))
        reader->setPropStr("compress", "gzip");

    m_pResObj = reader->createDefaultObj();
    reader->attach(m_pResObj);
    reader->read();
    reader->detach();

    if (m_objectName.isEmpty()) {
        m_pResObj->setPropStr("name", createDefaultObjName());
    }
    else {
        m_pResObj->setPropStr("name", m_objectName);
    }

    m_pTargScene->addObject(m_pResObj);
}

qlib::LStringList LoadObjectCommand::searchCompatibleRendNames() const
{
    // TO DO: reuse reader obj
    auto strMgr = qsys::StreamManager::getInstance();
    qsys::ObjReaderPtr reader = strMgr->createHandler(m_fileFmt, nCatID);
    auto pTmpObj = reader->createDefaultObj();
    LString str = pTmpObj->searchCompatibleRendererNames();
    qlib::LStringList strlist1;
    str.split(',', strlist1);
    return strlist1;
}

LString LoadObjectCommand::createDefaultObjName() const
{
    fs::path file_path = m_filePath.c_str();
    auto stem = file_path.stem().string();
    return LString(stem);
}

void LoadObjectCommand::runGUI(void *pwnd_info) {}

/// Get command's unique name
const char *LoadObjectCommand::getName() const
{
    return "load_object";
}

}  // namespace qsys
