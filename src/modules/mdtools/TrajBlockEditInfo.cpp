// -*-Mode: C++;-*-
//
// Undo/redo info for trajectory block append
//

#include <common.h>

#include "TrajBlockEditInfo.hpp"
#include "Trajectory.hpp"

#include <qlib/ObjectManager.hpp>

using namespace mdtools;

bool TrajBlockEditInfo::undo()
{
    // Undo an append: remove the block that was appended. Recording is disabled
    // by the UndoManager while undo runs, so removeBlock does not re-record.
    Trajectory *pTraj = qlib::ObjectManager::sGetObj<Trajectory>(m_nTrajUID);
    if (pTraj == NULL) return false;
    try {
        pTraj->removeBlock(m_nIndex);
    } catch (...) {
        return false;
    }
    return true;
}

bool TrajBlockEditInfo::redo()
{
    // Redo an append: re-append the retained block at the back (its original
    // position, since undo removes are LIFO within a transaction).
    Trajectory *pTraj = qlib::ObjectManager::sGetObj<Trajectory>(m_nTrajUID);
    if (pTraj == NULL) return false;
    try {
        pTraj->append(m_pBlock);
    } catch (...) {
        return false;
    }
    return true;
}
