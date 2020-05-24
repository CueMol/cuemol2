#define NO_USING_QTYPES

#include <common.h>

#include "QtLoadSceneCommand.hpp"

#include <QFileDialog>
#include <qlib/LRegExpr.hpp>
#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/StreamManager.hpp>

#include "QtMolWidget.hpp"
#include "mainwindow.hpp"

namespace qt5_gui {

qlib::LString QtLoadSceneCommand::createFilter(int nCatID) const
{
    qlib::LRegExpr re_descr("(\\w+[\\w\\s]+\\w+)\\s+\\(");

    qlib::LStringList filters;
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
    }
    auto filter_fmt = LString::join(";;", filters);

    return filter_fmt;
}

void QtLoadSceneCommand::runGUI(void *pwnd_info)
{
    auto pWnd = dynamic_cast<MainWindow *>(reinterpret_cast<QWidget *>(pwnd_info));
    if (pWnd == NULL) {
        MB_THROW(qlib::RuntimeException, "Invalid pwnd_info");
        return;
    }

    constexpr int nCatID = qsys::InOutHandler::IOH_CAT_SCEREADER;
    auto filter_str = createFilter(nCatID);

    const QString fileName = QFileDialog::getOpenFileName(pWnd, "Open scene file", "",
                                                          filter_str.c_str());

    // qsys::LoadSceneCommand::run();
}

/// Get command's unique name
const char *QtLoadSceneCommand::getName() const
{
    return "qt_load_scene";
}

}  // namespace qt5_gui
