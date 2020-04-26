#pragma once

#include "Command.hpp"
#include "qt5_gui.hpp"

namespace qt5_gui {

using qlib::LString;

/// Abstract Command for GUI actions
class NewSceneCommand : public GUICommand
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

private:
    LString m_sceneName;

public:
    NewSceneCommand() = default;
    virtual ~NewSceneCommand() = default;

    /// Execute the command
    virtual void run();

    virtual void runGUI(QWidget *pwnd_info);

    /// Get command's unique name
    virtual const char *getName() const;

    // properties
    inline const LString &getSceneName() const
    {
        return m_sceneName;
    }
    inline void setSceneName(const LString &v)
    {
        m_sceneName = v;
    }

    /// Create view flag
    bool m_bIsCreateView;
};

}  // namespace qt5_gui
