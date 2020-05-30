#define NO_USING_QTYPES

#include <common.h>

#include "QtLoadSceneCommand.hpp"

#include <QFileDialog>
#include <qlib/LRegExpr.hpp>
#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/StreamManager.hpp>
#include <qsys/command/CmdMgr.hpp>

#include "QtMolWidget.hpp"
#include "QtNewSceneCommand.hpp"
#include "mainwindow.hpp"

namespace qt5_gui {

bool QtLoadSceneCommand::createFilter(int nCatID, qlib::LStringList &filters,
                                      qlib::LStringList &type_names) const
{
    qlib::LRegExpr re_descr("(\\w+[\\w\\s]+\\w+)\\s+\\(");

    auto strMgr = qsys::StreamManager::getInstance();
    const auto &infos = strMgr->getStreamHandlerInfo();
    for (const auto &i : infos) {
        // LOG_DPRINTLN("%s: %s", nm.c_str(), shi.nickname.c_str());
        if (i.second.nCatID != nCatID) continue;
        auto &&fext = i.second.fext;
        auto &&descr = i.second.descr;
        if (!re_descr.match(descr) || re_descr.getSubstrCount() < (1 + 1)) {
            LOG_DPRINTLN("Error: %s, %s", i.first.c_str(), descr.c_str());
            continue;
        }
        auto sub_descr = re_descr.getSubstr(1);

        qlib::LStringList exts;
        if (fext.split_of("; ", exts) == 0) {
            LOG_DPRINTLN("error: %s, %s", i.first.c_str(), fext.c_str());
            continue;
        }
        auto ext_fmt = LString::join(" ", exts);
        filters.push_back(sub_descr + " (" + ext_fmt + ")");
        type_names.push_back(i.second.nickname);
    }
    // auto filter_fmt = LString::join(";;", filters);

    return true;
}

void QtLoadSceneCommand::runGUI(void *pwnd_info)
{
    auto pWnd = dynamic_cast<MainWindow *>(reinterpret_cast<QWidget *>(pwnd_info));
    if (pWnd == NULL) {
        MB_THROW(qlib::RuntimeException, "Invalid pwnd_info");
        return;
    }

    constexpr int nCatID = qsys::InOutHandler::IOH_CAT_SCEREADER;
    qlib::LStringList filters, type_names;
    createFilter(nCatID, filters, type_names);
    auto filter_str = LString::join(";;", filters);

    QFileDialog dlg(pWnd, "Open scene file", "", filter_str.c_str());
    if (dlg.exec() != QDialog::Accepted) {
        return;
    }

    auto files = dlg.selectedFiles();
    auto filter = dlg.selectedNameFilter();

    for (const auto &f : files) {
        LOG_DPRINTLN("Selected file: %s", f.toUtf8().constData());
        m_filePath = f.toUtf8().constData();
        break;
    }

    LOG_DPRINTLN("Selected filter: %s", filter.toUtf8().constData());
    LString filter2 = filter.toUtf8().constData();
    int i = 0;
    {
        auto iter_filter = filters.begin();
        auto iter_type = type_names.begin();
        for (; iter_filter != filters.end() && iter_type != type_names.end();
             ++iter_filter, ++iter_type) {
            if (iter_filter->equals(filter2)) {
                m_fileFmt = *iter_type;
                break;
            }
        }
    }
    LOG_DPRINTLN("selected: %s, %s", m_filePath.c_str(), m_fileFmt.c_str());

    // const QString fileName =
    //     QFileDialog::getOpenFileName(pWnd, "Open scene file", "",
    //     filter_str.c_str());

    auto pScMgr = qsys::SceneManager::getInstance();
    auto actsc_id = pScMgr->getActiveSceneID();
    auto pActSc = pScMgr->getScene(actsc_id);
    if (!pActSc.isnull() && pActSc->isJustCreated()) {
        // Do not creaet scene if active scene is empty.
        LOG_DPRINTLN("LoadScene> active scene: %d", actsc_id);
        m_pTargScene = pActSc;
    }
    else {
        LOG_DPRINTLN("LoadScene> no active scene: %d", actsc_id);
        auto pMgr = qsys::CmdMgr::getInstance();
        auto pResult = pMgr->runGUICmd("qt_new_scene", pWnd);
        auto pResPtr = dynamic_cast<QtNewSceneCommand *>(pResult.get());
        m_pTargScene = pResPtr->m_pResScene;
        // auto pWidget = reinterpret_cast<QtMolWidget *>(pResPtr->m_pMolWidget);
    }
    m_bSetCamera = true;
    qsys::LoadSceneCommand::run();

    // pWidget->update();
    pWnd->update();
    auto p = pWnd->activeMolWidget();
    if (p!=nullptr)
        p->update();
}

/// Get command's unique name
const char *QtLoadSceneCommand::getName() const
{
    return "qt_load_scene";
}

}  // namespace qt5_gui
