#pragma once

#include <qlib/LString.hpp>
#include <qlib/LTypes.hpp>
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
    ~LoadObjectCommand() override = default;

    /// Execute the command
    void run() override;

    void runGUI(void *pwnd_info) override;

    /// Get command's unique name
    const char *getName() const override;

    /// Pick a reader nickname for `m_filePath`.
    ///
    /// When `bContentFirst` is true, the file extension is ignored and
    /// every registered reader of `nCatID` is asked, via content sniff,
    /// to claim the file -- the first YES wins.
    ///
    /// When `bContentFirst` is false (default), the extension narrows
    /// the candidate set first. If exactly one reader claims the
    /// extension the result is purely extension-driven (legacy behaviour);
    /// if several readers share the extension, content sniff
    /// disambiguates among just those candidates, with a final
    /// alphabetic-first fallback when sniffing yields nothing.
    ///
    /// `maxSniffBytes` caps how many bytes each reader's
    /// canHandleContent() sees during disambiguation. 0 (the default)
    /// means unbounded -- the streaming sniff reads each candidate's
    /// stream until it returns a verdict or hits EOF.
    LString guessFileFormat(int nCatID, bool bContentFirst = false,
                            qlib::quint64 maxSniffBytes = 0) const;

    LString createDefaultObjName() const;

    qlib::LStringList searchCompatibleRendNames() const;

    /// Setter for `m_pTargScene` that bypasses the auto-generated
    /// property path. Property writes route through
    /// LScrObjBase::setPropHelper -> setupParentData, which clobbers
    /// the scene's parent-linkage book-keeping (m_thisname / m_rootuid)
    /// and breaks nested undo records. Method calls have no such side
    /// effect, so prefer setTargetScene(scene) over `cmd.target_scene =
    /// scene` from non-UXP callers.
    void setTargetScene(ScenePtr pScene) { m_pTargScene = pScene; }

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

    /// When true, the reader is picked purely from content sniffing
    /// (the extension is ignored). When false, the extension narrows
    /// the candidate set first and sniff disambiguates only when
    /// multiple readers share that extension.
    bool m_bContentFirst = false;

    /// Maximum bytes each reader's canHandleContent() is allowed to
    /// consume during sniff. 0 = unbounded (default), positive value
    /// = byte cap exposed to StreamManager's searchReader{,s}ByContent.
    /// Scripts override this when they want to bound sniffing against
    /// pathological / very large inputs.
    qlib::quint64 m_nMaxSniffBytes = 0;

    //////////
    // properties (output)

    /// resulting object
    ObjectPtr m_pResObj;
};

}  // namespace qsys
