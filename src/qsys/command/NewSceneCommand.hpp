#pragma once

#include <qsys/Scene.hpp>
#include <qsys/View.hpp>
#include <qsys/qsys.hpp>

#include "Command.hpp"

namespace qsys {

using qlib::LString;

/// New scene CLI command
class QSYS_API NewSceneCommand : public Command
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

    virtual void runGUI(void *pwnd_info);

    /// Get command's unique name
    virtual const char *getName() const;

    //////////
    // properties (input)
    inline const LString &getSceneName() const
    {
        return m_sceneName;
    }
    inline void setSceneName(const LString &v)
    {
        m_sceneName = v;
    }

    /// Create view flag (ignored in the cli version)
    bool m_bIsCreateView;

    /// Set created scene as active.
    bool m_bIsSetActive;

    /// scene name generation
    virtual LString generateNewSceneName() const;

    //////////
    // properties (output)

    /// resulting new scene
    ScenePtr m_pResScene;

    /// resulting new view
    ViewPtr m_pResView;
};

}  // namespace qsys
