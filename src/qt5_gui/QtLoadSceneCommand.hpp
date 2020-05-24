#pragma once

#include <qsys/command/LoadSceneCommand.hpp>

#include "qt5_gui.hpp"

namespace qt5_gui {

using qlib::LString;

/// Abstract Command for GUI actions
class QtLoadSceneCommand : public qsys::LoadSceneCommand
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

public:
    QtLoadSceneCommand() = default;
    virtual ~QtLoadSceneCommand() = default;

    virtual void runGUI(void *pwnd_info);

    /// Get command's unique name
    virtual const char *getName() const;

    qlib::LString createFilter(int nCatID) const;
};

}  // namespace qt5_gui
