#pragma once

#include <qsys/command/NewSceneCommand.hpp>

#include "qt5_gui.hpp"

namespace qt5_gui {

using qlib::LString;

/// Abstract Command for GUI actions
class QtNewSceneCommand : public qsys::NewSceneCommand
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

public:
    QtNewSceneCommand() : m_pMolWidget(nullptr) {}
    virtual ~QtNewSceneCommand() = default;

    virtual void runGUI(void *pwnd_info);

    /// Get command's unique name
    virtual const char *getName() const;

    void *m_pMolWidget;
};

}  // namespace qt5_gui
