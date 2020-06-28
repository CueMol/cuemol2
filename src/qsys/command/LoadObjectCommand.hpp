#pragma once

#include <qlib/LString.hpp>
#include <qsys/ObjReader.hpp>
#include <qsys/Scene.hpp>
#include <qsys/View.hpp>
#include <qsys/qsys.hpp>

#include "Command.hpp"

namespace qsys {

using qlib::LString;

/// Load object CLI command
class QSYS_API LoadObjectCommand : public Command
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

private:
    static constexpr int nCatID = InOutHandler::IOH_CAT_OBJREADER;

public:
    LoadObjectCommand() = default;
    virtual ~LoadObjectCommand() = default;

    /// Execute the command
    virtual void run();

    virtual void runGUI(void *pwnd_info);

    /// Get command's unique name
    virtual const char *getName() const;

    LString guessFileFormat(int nCatID) const;

    LString createDefaultObjName() const;

    qlib::LStringList searchCompatibleRendNames() const;

    //////////
    // properties (input)

    /// Target scene
    ScenePtr m_pTargScene;

    /// object file path
    LString m_filePath;

    /// object name (optional)
    LString m_objectName;

    /// object file format (optional)
    LString m_fileFmt;

    //////////
    // properties (output)

    /// resulting object
    ObjectPtr m_pResObj;
};

}  // namespace qsys
