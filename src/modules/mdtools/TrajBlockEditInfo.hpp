// -*-Mode: C++;-*-
//
// Undo/redo info for trajectory block append
//

#ifndef MDTOOLS_TRAJ_BLOCK_EDIT_INFO_HPP_INCLUDED
#define MDTOOLS_TRAJ_BLOCK_EDIT_INFO_HPP_INCLUDED

#include "mdtools.hpp"

#include <qsys/EditInfo.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

///
/// Undo/redo record for appending a TrajBlock to a Trajectory.
///
/// APPEND only: undo() removes the appended block, redo() re-appends it. The
/// block is retained by smart pointer so redo can restore the same data. The
/// parent Trajectory is resolved by uid at undo/redo time (the object may have
/// been destroyed/recreated by a surrounding object-level edit).
///
class MDTOOLS_API TrajBlockEditInfo : public qsys::EditInfo
{
private:
    /// Parent trajectory UID.
    qlib::uid_t m_nTrajUID;

    /// The appended block (retained for redo).
    TrajBlockPtr m_pBlock;

    /// Block position at append time (== back index).
    int m_nIndex;

public:
    TrajBlockEditInfo() : m_nTrajUID(qlib::invalid_uid), m_nIndex(-1) {}
    ~TrajBlockEditInfo() override {}

    /// Record an append of pBlk at position index.
    void setupAppend(qlib::uid_t traj_uid, const TrajBlockPtr &pBlk, int index)
    {
        m_nTrajUID = traj_uid;
        m_pBlock = pBlk;
        m_nIndex = index;
    }

    bool undo() override;
    bool redo() override;
    bool isUndoable() const override { return true; }
    bool isRedoable() const override { return true; }
};

}  // namespace mdtools

#endif
