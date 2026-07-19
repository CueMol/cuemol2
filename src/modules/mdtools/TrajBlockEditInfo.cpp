// -*-Mode: C++;-*-
//
// Undo/redo info for trajectory block append / remove / move
//

#include <common.h>

#include "TrajBlockEditInfo.hpp"
#include "Trajectory.hpp"

#include <qlib/ObjectManager.hpp>

using namespace mdtools;

bool TrajBlockEditInfo::undo()
{
    // Recording is disabled by the UndoManager while undo runs, so the
    // Trajectory edit methods below do not re-record.
    Trajectory *pTraj = qlib::ObjectManager::sGetObj<Trajectory>(m_nTrajUID);
    if (pTraj == NULL) return false;
    try {
        switch (m_nMode) {
        case MODE_APPEND:
            pTraj->removeBlock(m_nIndex);
            break;
        case MODE_REMOVE:
            pTraj->insertBlock(m_nIndex, m_pBlock);
            break;
        case MODE_MOVE:
            pTraj->moveBlock(m_nToIndex, m_nIndex);
            break;
        default:
            return false;
        }
    } catch (...) {
        return false;
    }
    return true;
}

bool TrajBlockEditInfo::redo()
{
    Trajectory *pTraj = qlib::ObjectManager::sGetObj<Trajectory>(m_nTrajUID);
    if (pTraj == NULL) return false;
    try {
        switch (m_nMode) {
        case MODE_APPEND:
            pTraj->append(m_pBlock);
            break;
        case MODE_REMOVE:
            pTraj->removeBlock(m_nIndex);
            break;
        case MODE_MOVE:
            pTraj->moveBlock(m_nIndex, m_nToIndex);
            break;
        default:
            return false;
        }
    } catch (...) {
        return false;
    }
    return true;
}
