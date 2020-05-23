#define NO_USING_QTYPES

#include <common.h>

#include "QtLoadSceneCommand.hpp"

#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>

#include "QtMolWidget.hpp"
#include "mainwindow.hpp"

namespace qt5_gui {

void QtLoadSceneCommand::runGUI(void *pwnd_info)
{
    auto pWnd = dynamic_cast<MainWindow *>(reinterpret_cast<QWidget *>(pwnd_info));
    if (pWnd == NULL) {
        MB_THROW(qlib::RuntimeException, "Invalid pwnd_info");
        return;
    }

    const QString fileName = QFileDialog::getOpenFileName(pWnd, "Open scene file", "",
                                                          "CueMol Scene (*.qsc)");

    qsys::LoadSceneCommand::run();
}

/// Get command's unique name
const char *QtLoadSceneCommand::getName() const
{
    return "qt_load_scene";
}

}  // namespace qt5_gui
