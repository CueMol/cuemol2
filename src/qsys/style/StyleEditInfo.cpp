// -*-Mode: C++;-*-
//
// Style edit info
//
// $Id: RendStyleEditInfo.cpp,v 1.1 2011/05/02 12:42:55 rishitani Exp $
//

#include <common.h>

#include "StyleEditInfo.hpp"
#include "StyleSupports.hpp"
#include "StyleSheet.hpp"
#include "StyleSet.hpp"
#include "StyleMgr.hpp"

using namespace qsys;

StyleCreateEditInfo::StyleCreateEditInfo()
     :m_nSceneID(qlib::invalid_uid), m_nInsBefore(0)
{
}

StyleCreateEditInfo::~StyleCreateEditInfo()
{
}

void StyleCreateEditInfo::setupCreate(qlib::uid_t scid, StyleSetPtr pTgt, int nBefore)
{
  m_bCreate = true;
  m_nSceneID = scid;
  m_pTgt = pTgt;
  m_nInsBefore = nBefore;
}

void StyleCreateEditInfo::setupDestroy(qlib::uid_t scid, StyleSetPtr pTgt, int nBefore)
{
  m_bCreate = false;
  m_nSceneID = scid;
  m_pTgt = pTgt;
  m_nInsBefore = nBefore;
}

/// perform undo
bool StyleCreateEditInfo::undo()
{
  if (m_pTgt.isnull())
    return false;
  StyleMgr *pSM = StyleMgr::getInstance();

  if (m_bCreate) {
    // Undo of creation
    qlib::uid_t nStyleID = m_pTgt->getUID();
    pSM->destroyStyleSet(m_nSceneID, nStyleID);
  }
  else {
    // Undo of destruction
    if (!pSM->registerStyleSet(m_pTgt, m_nInsBefore, m_nSceneID))
      return false;
  }
  return true;
}

/// perform redo
bool StyleCreateEditInfo::redo()
{
  if (m_pTgt.isnull())
    return false;
  StyleMgr *pSM = StyleMgr::getInstance();

  if (m_bCreate) {
    // Redo of creation
    if (!pSM->registerStyleSet(m_pTgt, 0, m_nSceneID))
      return false;
  }
  else {
    // Redo of destruction
    qlib::uid_t nStyleID = m_pTgt->getUID();
    pSM->destroyStyleSet(m_nSceneID, nStyleID);
  }
  return true;
}

bool StyleCreateEditInfo::isUndoable() const
{
  // TO DO: check actually undoable
  return true;
}

bool StyleCreateEditInfo::isRedoable() const
{
  // TO DO: check actually redoable
  return true;
}

//////////////////////////////////////////////////

StyleSrcEditInfo::StyleSrcEditInfo()
{
}

StyleSrcEditInfo::~StyleSrcEditInfo()
{
}

void StyleSrcEditInfo::setup( StyleSetPtr pTgt, LString before, LString after)
{
  m_pTgt = pTgt;
  m_before = before;
  m_after = after;
}

/// perform undo
bool StyleSrcEditInfo::undo()
{
  if (m_pTgt.isnull())
    return false;

  // Undo of before->after (i.e. set as before)
  m_pTgt->setSource(m_before);

  return true;
}

/// perform redo
bool StyleSrcEditInfo::redo()
{
  if (m_pTgt.isnull())
    return false;

  // Redo of before->after (i.e. set as after)
  m_pTgt->setSource(m_after);

  return true;
}

bool StyleSrcEditInfo::isUndoable() const
{
  // TO DO: check actually undoable
  return true;
}

bool StyleSrcEditInfo::isRedoable() const
{
  // TO DO: check actually redoable
  return true;
}


////////////////////////////////////////////////

RendStyleEditInfo::~RendStyleEditInfo()
{
}

/// Perform undo
bool RendStyleEditInfo::undo()
{
  StyleSupports *pTgt =
    qlib::ObjectManager::sGetObj<StyleSupports>(getTargetUID());
  if (pTgt==NULL) return false;

  StyleSheet *pSS = pTgt->getStyleSheet();
  pSS->setStyleNames(m_oldvalue);

  // fire event
  fireStyleEvents(pTgt);
  return true;
}

/// Perform redo
bool RendStyleEditInfo::redo()
{
  StyleSupports *pTgt =
    qlib::ObjectManager::sGetObj<StyleSupports>(getTargetUID());
  if (pTgt==NULL) return false;

  StyleSheet *pSS = pTgt->getStyleSheet();
  pSS->setStyleNames(m_newvalue);

  // fire event
  fireStyleEvents(pTgt);
  return true;
}

bool RendStyleEditInfo::isUndoable() const
{
  // TO DO: check actually undoable
  return true;
}

bool RendStyleEditInfo::isRedoable() const
{
  // TO DO: check actually redoable
  return true;
}

void RendStyleEditInfo::fireStyleEvents(StyleSupports *pTgt)
{
  // Style changed event
  {
    StyleEvent ev;
    pTgt->styleChanged(ev);
  }

  // Fake the style-prop changed event
  qlib::LPropEventListener *pPropTgt = dynamic_cast<qlib::LPropEventListener *>(pTgt);
  if (pPropTgt!=NULL) {
    qlib::LPropEvent ev("styles");
    pPropTgt->propChanged(ev);
  }
}

