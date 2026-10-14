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

#include <qlib/LDOM2Tree.hpp>
#include <gfx/AbstractColor.hpp>

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
    // Redo of creation: put the set back where it was created
    if (!pSM->registerStyleSet(m_pTgt, m_nInsBefore, m_nSceneID))
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

//////////////////////////////////////////////////

StyleReadOnlyEditInfo::StyleReadOnlyEditInfo() : m_bAfter(false)
{
}

StyleReadOnlyEditInfo::~StyleReadOnlyEditInfo()
{
}

void StyleReadOnlyEditInfo::setup(StyleSetPtr pTgt, bool bAfter)
{
  m_pTgt = pTgt;
  m_bAfter = bAfter;
}

bool StyleReadOnlyEditInfo::isUndoable() const
{
  return !m_pTgt.isnull();
}

bool StyleReadOnlyEditInfo::isRedoable() const
{
  return !m_pTgt.isnull();
}

StyleEntryEditInfo::StyleEntryEditInfo()
     : m_nKind(COLOR), m_bHasBefore(false), m_bHasAfter(false), m_pNode(NULL)
{
}

StyleEntryEditInfo::~StyleEntryEditInfo()
{
  if (m_pNode!=NULL)
    delete m_pNode;
}

void StyleEntryEditInfo::setupColor(StyleSetPtr pTgt, const LString &key,
                                    bool bHasBefore, const gfx::ColorPtr &before,
                                    bool bHasAfter, const gfx::ColorPtr &after)
{
  m_pTgt = pTgt;
  m_nKind = COLOR;
  m_key = key;
  m_bHasBefore = bHasBefore;
  m_colBefore = before;
  m_bHasAfter = bHasAfter;
  m_colAfter = after;
}

void StyleEntryEditInfo::setupString(StyleSetPtr pTgt, const LString &key,
                                     bool bHasBefore, const LString &before,
                                     bool bHasAfter, const LString &after)
{
  m_pTgt = pTgt;
  m_nKind = STRING;
  m_key = key;
  m_bHasBefore = bHasBefore;
  m_strBefore = before;
  m_bHasAfter = bHasAfter;
  m_strAfter = after;
}

void StyleEntryEditInfo::setupStyleRemove(StyleSetPtr pTgt, const LString &key, qlib::LDom2Node *pNode)
{
  m_pTgt = pTgt;
  m_nKind = STYLE;
  m_key = key;
  m_bHasBefore = true;
  m_bHasAfter = false;
  m_pNode = pNode;
}

void StyleEntryEditInfo::apply(bool bHas, const gfx::ColorPtr &col, const LString &str)
{
  LString setname;
  if (m_nKind==COLOR) {
    if (bHas)
      m_pTgt->setColor(m_key, col);
    else
      m_pTgt->removeColor(m_key);
    setname = ">color";
  }
  else if (m_nKind==STRING) {
    if (bHas)
      m_pTgt->setString(m_key, str);
    else
      m_pTgt->removeString(m_key);
  }
  else {
    if (bHas) {
      // the set owns the node again
      if (m_pNode!=NULL && m_pTgt->putData(m_key, m_pNode))
        m_pNode = NULL;
    }
    else if (m_pNode==NULL) {
      m_pNode = m_pTgt->detachData(m_key);
    }
  }

  StyleMgr *pSM = StyleMgr::getInstance();
  pSM->addPendingEvent(m_pTgt->getContextID(), setname);
  pSM->firePendingEvents();
}

bool StyleEntryEditInfo::undo()
{
  if (m_pTgt.isnull())
    return false;
  apply(m_bHasBefore, m_colBefore, m_strBefore);
  return true;
}

bool StyleEntryEditInfo::redo()
{
  if (m_pTgt.isnull())
    return false;
  apply(m_bHasAfter, m_colAfter, m_strAfter);
  return true;
}

bool StyleEntryEditInfo::isUndoable() const
{
  return !m_pTgt.isnull();
}

bool StyleEntryEditInfo::isRedoable() const
{
  return !m_pTgt.isnull();
}

//////////////////////////////////////////////////

bool StyleReadOnlyEditInfo::undo()
{
  if (m_pTgt.isnull())
    return false;
  m_pTgt->setReadOnly(!m_bAfter);
  return true;
}

bool StyleReadOnlyEditInfo::redo()
{
  if (m_pTgt.isnull())
    return false;
  m_pTgt->setReadOnly(m_bAfter);
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

