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
    ~NewSceneCommand() override = default;

    /// Execute the command
    void run() override;

    void runGUI(void *pwnd_info) override;

    /// Get command's unique name
    const char *getName() const override;

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
