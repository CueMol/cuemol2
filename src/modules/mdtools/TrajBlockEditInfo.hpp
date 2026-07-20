// -*-Mode: C++;-*-
//
// Undo/redo info for trajectory block append / remove / move
//

#ifndef MDTOOLS_TRAJ_BLOCK_EDIT_INFO_HPP_INCLUDED
#define MDTOOLS_TRAJ_BLOCK_EDIT_INFO_HPP_INCLUDED

#include "mdtools.hpp"

#include <qsys/EditInfo.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

///
/// Undo/redo record for a block-set edit on a Trajectory.
///
/// One of three modes:
///  - APPEND: undo removes the appended block, redo re-appends it.
///  - REMOVE: undo re-inserts the removed block at its index, redo removes it.
///  - MOVE:   undo moves the block back (to -> from), redo moves it (from -> to).
///
/// The block is retained by smart pointer (APPEND/REMOVE) so redo/undo can
/// restore it. The parent Trajectory is resolved by uid at undo/redo time.
///
class MDTOOLS_API TrajBlockEditInfo : public qsys::EditInfo
{
private:
    enum
    {
        MODE_APPEND,
        MODE_REMOVE,
        MODE_MOVE,
    };

    int m_nMode;

    /// Parent trajectory UID.
    qlib::uid_t m_nTrajUID;

    /// The block (retained for APPEND redo / REMOVE undo).
    TrajBlockPtr m_pBlock;

    /// APPEND: back index; REMOVE: removed index; MOVE: from index.
    int m_nIndex;

    /// MOVE: to index (unused otherwise).
    int m_nToIndex;

public:
    TrajBlockEditInfo()
        : m_nMode(MODE_APPEND), m_nTrajUID(qlib::invalid_uid), m_nIndex(-1), m_nToIndex(-1)
    {
    }
    ~TrajBlockEditInfo() override {}

    /// Record an append of pBlk at position index (back).
    void setupAppend(qlib::uid_t traj_uid, const TrajBlockPtr &pBlk, int index)
    {
        m_nMode = MODE_APPEND;
        m_nTrajUID = traj_uid;
        m_pBlock = pBlk;
        m_nIndex = index;
    }

    /// Record a remove of pBlk from position index.
    void setupRemove(qlib::uid_t traj_uid, const TrajBlockPtr &pBlk, int index)
    {
        m_nMode = MODE_REMOVE;
        m_nTrajUID = traj_uid;
        m_pBlock = pBlk;
        m_nIndex = index;
    }

    /// Record a move of the block at `from` to position `to`.
    void setupMove(qlib::uid_t traj_uid, int from, int to)
    {
        m_nMode = MODE_MOVE;
        m_nTrajUID = traj_uid;
        m_nIndex = from;
        m_nToIndex = to;
    }

    bool undo() override;
    bool redo() override;
    bool isUndoable() const override { return true; }
    bool isRedoable() const override { return true; }
};

}  // namespace mdtools

#endif
