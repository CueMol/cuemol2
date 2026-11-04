// -*-Mode: C++;-*-
//
// Undo/Redo manager
//
// $Id: UndoManager.cpp,v 1.6 2011/04/03 11:11:06 rishitani Exp $

#include <common.h>

#include "UndoManager.hpp"
#include <qsys/SceneManager.hpp>

using namespace qsys;

UndoManager::UndoManager()
{
  m_fDisable = false;
  m_pPendInfo = NULL;
  m_nTxnNestLevel = 0;
//  m_nLimit = 20;
  m_bHistoryDropped = false;
}

namespace {
  /// Disables recording for its scope, and restores the flag on any exit
  /// (an exception included), so a failed undo never leaves recording off.
  class DisableGuard
  {
  private:
    bool &m_flag;
    bool m_old;

  public:
    explicit DisableGuard(bool &flag) : m_flag(flag), m_old(flag) { m_flag = true; }
    ~DisableGuard() { m_flag = m_old; }
  };
}

bool UndoManager::runStep(UndoInfo *pui, bool bUndo)
{
  const char *what = bUndo ? "undo" : "redo";
  DisableGuard guard(m_fDisable);
  try {
    if (bUndo ? pui->undo() : pui->redo())
      return true;
    LOG_DPRINTLN("UndoManager> %s of \"%s\" failed", what, pui->getDesc().c_str());
  }
  catch (const qlib::LException &e) {
    LOG_DPRINTLN("UndoManager> %s of \"%s\" failed: %s", what, pui->getDesc().c_str(), e.getMsg().c_str());
  }
  catch (const std::exception &e) {
    LOG_DPRINTLN("UndoManager> %s of \"%s\" failed: %s", what, pui->getDesc().c_str(), e.what());
  }
  catch (...) {
    LOG_DPRINTLN("UndoManager> %s of \"%s\" failed: unknown exception", what, pui->getDesc().c_str());
  }
  return false;
}

void UndoManager::dropHistory(const char *what, const LString &desc)
{
  LOG_DPRINTLN("UndoManager> %s of \"%s\" failed; the scene may be partly changed, so the undo history was cleared",
               what, desc.c_str());
  clearAllInfo();
  m_bHistoryDropped = true;
}

UndoManager::~UndoManager()
{
  clearAllInfo();

  MB_ASSERT(m_pPendInfo==NULL);
  if (m_pPendInfo!=NULL) delete m_pPendInfo;
}

bool UndoManager::isUndoable() const
{
  if (m_udata.size()<=0)
    return false;

  UndoInfo *pui = m_udata.front();
  if (pui->isUndoable())
    return true;
  return false;
}

bool UndoManager::isRedoable() const
{
  if (m_rdata.size()<=0)
    return false;

  UndoInfo *pui = m_rdata.front();
  if (pui->isRedoable())
    return true;
  return false;
}

bool UndoManager::undo()
{
  if (!isUndoable())
    return false;

  // Moved to the redo side only once it has worked: on failure the scene
  // may be partly changed, and the whole history goes (dropHistory).
  UndoInfo *pui = m_udata.front();
  if (!runStep(pui, true)) {
    dropHistory("undo", pui->getDesc());
    return false;
  }
  m_udata.pop_front();
  m_rdata.push_front(pui);
  return true;
}

bool UndoManager::redo()
{
  if (!isRedoable())
    return false;

  UndoInfo *pui = m_rdata.front();
  if (!runStep(pui, false)) {
    dropHistory("redo", pui->getDesc());
    return false;
  }
  m_rdata.pop_front();
  m_udata.push_front(pui);
  return true;
}

bool UndoManager::undo(int n)
{
  for (int i=0; i<=n; ++i) {
    if (!undo())
      return false;
  }
  return true;
}

bool UndoManager::redo(int n)
{
  for (int i=0; i<=n; ++i) {
    if (!redo())
      return false;
  }
  return true;
}

bool UndoManager::getUndoDesc(int n, LString &str) const
{
  if (!isUndoable())
    return false;
  if (n<0 || n>=int(m_udata.size()))
    return false;
  // UndoInfo *pui = m_udata.front();
  UndoInfoList::const_iterator iter = m_udata.begin();
  for (int i=0; i<n; ++i)
    ++iter;
  if (iter==m_udata.end()) return false;
  UndoInfo *pui = *(iter);
  
  str = pui->getDesc();
  return true;
}

bool UndoManager::getRedoDesc(int n, LString &str) const
{
  if (!isRedoable())
    return false;
  if (n<0 || n>=int(m_rdata.size()))
    return false;
  //UndoInfo *pui = m_rdata.front();
  UndoInfoList::const_iterator iter = m_rdata.begin();
  for (int i=0; i<n; ++i)
    ++iter;
  if (iter==m_rdata.end()) return false;
  UndoInfo *pui = *(iter);

  str = pui->getDesc();
  return true;
}

void UndoManager::getUndoDescList(std::list<LString> &str) const
{
  str.erase(str.begin(), str.end());

  UndoInfoList::const_iterator iter = m_udata.begin();
  for (; iter!=m_udata.end(); ++iter) {
    UndoInfo *pui = *iter;
    MB_ASSERT(pui!=NULL);
    if (!pui->isUndoable())
      break;
    str.push_back(pui->getDesc());
  }
}

void UndoManager::getRedoDescList(std::list<LString> &str) const
{
  str.erase(str.begin(), str.end());

  UndoInfoList::const_iterator iter = m_rdata.begin();
  for (; iter!=m_rdata.end(); ++iter) {
    UndoInfo *pui = *iter;
    MB_ASSERT(pui!=NULL);
    if (!pui->isRedoable())
      break;
    str.push_back(pui->getDesc());
  }
}

/** discard all Undo/Redo infomation */
void UndoManager::clearAllInfo()
{
  while (m_udata.size()>0) {
    UndoInfo *pei = m_udata.front();
    m_udata.pop_front();
    delete pei;
  }

  while (m_rdata.size()>0) {
    UndoInfo *pei = m_rdata.front();
    m_rdata.pop_front();
    delete pei;
  }
}

void UndoManager::startTxn(const LString &desc)
{
  if (isDisabled()) return; // ignore nested txn !!

  if (m_pPendInfo!=NULL) {
    m_nTxnNestLevel ++;
    return;
  }
  m_pPendInfo = MB_NEW UndoInfo();
  m_pPendInfo->setDesc(desc);

  MB_DPRINTLN("===== START UNDO TXN (%s) =====", desc.c_str());
}

void UndoManager::addEditInfo(EditInfo *pei)
{
  MB_ASSERT(!m_fDisable);
  if (m_fDisable || m_pPendInfo==NULL) {
    // ignore nested txn!!
    delete pei;
    return;
  }
  // MB_ASSERT(!=NULL);
  m_pPendInfo->add(pei);
}


void UndoManager::rollbackTxn()
{
  if (isDisabled()) return; // ignore nested txn !!

  if (m_nTxnNestLevel>0) {
    m_nTxnNestLevel--;
    return;
  }
  
  if (m_pPendInfo==NULL) {
    // script-visible: rollbackTxn() without a matching startTxn()
    LOG_DPRINTLN("UndoManager> rollbackTxn() called outside a transaction (ignored)");
    return;
  }

  // undo pending operation, with recording off so the undo itself adds
  // nothing to the transaction being taken back
  UndoInfo *pPend = m_pPendInfo;
  m_pPendInfo = NULL;
  const LString desc = pPend->getDesc();
  const bool ok = runStep(pPend, true);
  delete pPend;
  // The change it could not take back stays in the scene, which the
  // existing undo/redo records were not made for.
  if (!ok)
    dropHistory("rollback", desc);

  MB_DPRINTLN("===== Rollback TXN =====");
}

void UndoManager::commitTxn()
{
  if (isDisabled()) return; // ignore nested txn !!

  if (m_nTxnNestLevel>0) {
    m_nTxnNestLevel--;
    return;
  }

  if (m_pPendInfo==NULL) {
    // script-visible: commitTxn() without a matching startTxn()
    LOG_DPRINTLN("UndoManager> commitTxn() called outside a transaction (ignored)");
    return;
  }

  if (m_pPendInfo->size()>0) {
    m_udata.push_front(m_pPendInfo);
    MB_DPRINTLN("===== Commit TXN (%d) =====", m_pPendInfo->size());

    /*
    // remove EditInfo exceeding the buffer limit
    while (m_udata.size()>m_nLimit) {
      UndoInfo *pui = m_udata.back();
      m_udata.pop_back();
      delete pui;
    }
     */
  }
  else {
    MB_DPRINTLN("===== Discard empty TXN =====");
    delete m_pPendInfo;
  }

  m_pPendInfo = NULL;

  // discard Redo info
  while (m_rdata.size()>0) {
    UndoInfo *pui = m_rdata.front();
    m_rdata.pop_front();
    delete pui;
  }

}

//////////

UndoUtil::UndoUtil(qlib::uid_t nSceneID)
{
  ScenePtr pScene = SceneManager::getSceneS(nSceneID);
  if (pScene.isnull())
    m_pUM=NULL;
  else
    m_pUM = pScene->getUndoMgr();
}

UndoUtil::UndoUtil(ScenePtr pScene)
{
  if (pScene.isnull())
    m_pUM=NULL;
  else
    m_pUM = pScene->getUndoMgr();
}

UndoUtil::UndoUtil(const Scene *pScene)
{
  if (pScene==NULL)
    m_pUM=NULL;
  else
    m_pUM = const_cast<Scene*>(pScene)->getUndoMgr();
}

