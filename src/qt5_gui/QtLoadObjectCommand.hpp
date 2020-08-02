#pragma once

#include <qsys/command/LoadObjectCommand.hpp>

#include "qt5_gui.hpp"

namespace qt5_gui {

using qlib::LString;

/// Load object command for GUI actions
class QtLoadObjectCommand : public qsys::LoadObjectCommand
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

public:
    QtLoadObjectCommand() = default;
    virtual ~QtLoadObjectCommand() = default;

    virtual void runGUI(void *pwnd_info);

    /// Get command's unique name
    virtual const char *getName() const;

};

}  // namespace qt5_gui
