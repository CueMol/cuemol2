#define NO_USING_QTYPES

#include <common.h>

#include "QtLoadObjectCommand.hpp"

#include <QFileDialog>
#include <qlib/LRegExpr.hpp>
#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/StreamManager.hpp>
#include <qsys/command/CmdMgr.hpp>
#include <qsys/command/NewRendererCommand.hpp>

#include "QtCreateRendDlg.hpp"
#include "QtLoadSceneCommand.hpp"
#include "QtMolWidget.hpp"
#include "mainwindow.hpp"

namespace qt5_gui {

void QtLoadObjectCommand::runGUI(void *pwnd_info)
{
    // get default scene
    if (m_pTargScene.isnull()) {
        auto pScMgr = qsys::SceneManager::getInstance();
        auto actsc_id = pScMgr->getActiveSceneID();
        m_pTargScene = pScMgr->getScene(actsc_id);
    }

    auto pWnd = dynamic_cast<MainWindow *>(reinterpret_cast<QWidget *>(pwnd_info));
    if (pWnd == NULL) {
        MB_THROW(qlib::RuntimeException, "Invalid pwnd_info");
        return;
    }

    constexpr int nCatID = qsys::InOutHandler::IOH_CAT_OBJREADER;
    qlib::LStringList filters, type_names;
    QtLoadSceneCommand::createFilter(nCatID, filters, type_names);
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

    // XXX: Renderer/LoadObj options dialog GUI
    auto rend_types = searchCompatibleRendNames();
    QtCreateRendDlg crdlg(m_pTargScene->getUID(), pWnd);
    crdlg.initRendTypeBox(rend_types);
    crdlg.setObjectName(createDefaultObjName());
    if (crdlg.exec() != QDialog::Accepted) {
        return;
    }

    m_objectName = crdlg.getObjectName();

    qsys::LoadObjectCommand::run();

    // Create renderer
    auto pMgr = qsys::CmdMgr::getInstance();
    auto pNewRendCmd = pMgr->getCmd<qsys::NewRendererCommand>("new_renderer");
    pNewRendCmd->m_pTargObj = m_pResObj;
    pNewRendCmd->m_rendTypeName = crdlg.getRendTypeName();
    pNewRendCmd->m_rendName = crdlg.getRendName();
    pNewRendCmd->m_bRecenView = crdlg.isRecenView();
    pNewRendCmd->run();
    
    pWnd->update();
    auto p = pWnd->activeMolWidget();
    if (p != nullptr) p->update();
}

/// Get command's unique name
const char *QtLoadObjectCommand::getName() const
{
    return "qt_load_object";
}

}  // namespace qt5_gui
