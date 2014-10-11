// -*-Mode: C++;-*-
//
// Property edit info
//

#include <common.h>

#include "PropEditInfo.hpp"

using namespace qsys;

/// Perform undo
bool PropEditInfo::undo()
{
  qlib::LPropSupport *pTgt = getTarget();
  if (pTgt==NULL) return false;

  qlib::NestedPropHandler nph(getPropName(), pTgt);
  if (m_bOldDef)
    return nph.apply()->resetProperty(nph.last_name());
  else
    return nph.apply()->setProperty(nph.last_name(), m_oldvalue);
}

/// Perform redo
bool PropEditInfo::redo()
{
  qlib::LPropSupport *pTgt = getTarget();
  if (pTgt==NULL) return false;

  qlib::NestedPropHandler nph(getPropName(), pTgt);
  if (m_bNewDef)
    return nph.apply()->resetProperty(nph.last_name());
  else
    return nph.apply()->setProperty(nph.last_name(), m_newvalue);
}

bool PropEditInfo::isUndoable() const
{
  qlib::LPropSupport *pTgt = getTarget();
  if (pTgt==NULL) {
    MB_DPRINTLN("PropEditInfo> isUndoable target(%d) is NULL", getTargetUID());
    return false;
  }
  
  // XXX
  // TO DO: check actually undoable
  return true;
}

bool PropEditInfo::isRedoable() const
{
  qlib::LPropSupport *pTgt = getTarget();
  if (pTgt==NULL) {
    MB_DPRINTLN("PropEditInfo> isRedoable target(%d) is NULL", getTargetUID());
    return false;
  }
  
  // XXX
  // TO DO: check actually redoable
  return true;
}

