#pragma once

#include <qsys/Scene.hpp>
#include <qsys/View.hpp>
#include <qsys/qsys.hpp>

#include "Command.hpp"

namespace qsys {

using qlib::LString;

/// Load scene CLI command
class QSYS_API LoadSceneCommand : public Command
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

private:

public:
    LoadSceneCommand() = default;
    ~LoadSceneCommand() override = default;

    /// Execute the command
    void run() override;

    void runGUI(void *pwnd_info) override;

    /// Get command's unique name
    const char *getName() const override;

    LString guessFileFormat(int nCatID) const;

    //////////
    // properties (input)

    /// scene name (optional)
    LString m_sceneName;

    /// scene file path
    LString m_filePath;

    /// scene file format (optional)
    LString m_fileFmt;

    /// Target scene (optional/should be empty)
    ScenePtr m_pTargScene;

    /// Set camera (optional)
    bool m_bSetCamera;

    //////////
    // properties (output)

    /// resulting scene (new or same as targScene)
    ScenePtr m_pResScene;

};

}  // namespace qsys
