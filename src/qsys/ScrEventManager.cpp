//
//  Event manager for scripting interface
//
// $Id: ScrEventManager.cpp,v 1.5 2011/01/03 16:47:05 rishitani Exp $

#include <common.h>

#include "ScrEventManager.hpp"
#include "ViewEvent.hpp"
#include "ObjectEvent.hpp"
#include "SceneEvent.hpp"
#include "RendererEvent.hpp"
#include <qlib/LLogEvent.hpp>
#include <qlib/LMsgLog.hpp>
#include <qlib/LVarArgs.hpp>

using namespace qsys;

SINGLETON_BASE_IMPL(ScrEventManager);

// automatic initialization by ClassRegistry
bool ScrEventManager::initClass(qlib::LClass *pcls)
{
  return qlib::SingletonBase<ScrEventManager>::init();
}

// automatic finalization by ClassRegistry (not used!!)
void ScrEventManager::finiClass(qlib::LClass *pcls)
{
  qlib::SingletonBase<ScrEventManager>::fini();
}

//////////

ScrEventManager::ScrEventManager()
{
  m_nLogLsnID = -1;
  qlib::LMsgLog *pLog = qlib::LMsgLog::getInstance();
  if (pLog!=NULL)
    m_nLogLsnID = pLog->addListener(this);
}

ScrEventManager::~ScrEventManager()
{
  qlib::LMsgLog *pLog = qlib::LMsgLog::getInstance();
  if (pLog!=NULL && m_nLogLsnID>=0)
    pLog->removeListener(m_nLogLsnID);
  m_pCb = qlib::LSCBPtr();
  m_slot.clearAndDelete();
}

bool ScrEventManager::fireEventScript(const LString &aCatStr,
                                      int aTgtType, int aEvtType,
                                      qlib::uid_t aSrcID,
                                      qlib::LEvent &event)
{
  if (m_pCb.isnull()) return false;

  SlotTab::const_iterator iter = m_slot.begin();
  SlotTab::const_iterator eiter = m_slot.end();

  for (; iter!=eiter; ++iter) {
    bool bCat = false, bSrc = false, bEvt = false, bUID = false;
    // source UID
    if (iter->second->nSrcUID==qlib::invalid_uid)
      bUID = true;
    else if (aSrcID==iter->second->nSrcUID)
      bUID = true;
    if (!bUID) continue;

    // category name
    if (iter->second->cat.isEmpty())
      bCat = true;
    else if (aCatStr.equals(iter->second->cat))
      bCat = true;
    if (!bCat) continue;

    // target type
    if (iter->second->nTgtType<0)
      bSrc = true; // SEM_ANY
    else if (aTgtType & iter->second->nTgtType) //(aTgtType==iter->second->nTgtType)
      bSrc = true;
    if (!bSrc) continue;

    // event type
    if (iter->second->nEvtType<0)
      bEvt = true;
    else if (aEvtType==iter->second->nEvtType)
      bEvt = true;
    if (!bEvt) continue;

    //if (bCat&&bSrc&&bEvt&&bUID)
    //return iter->first;
    {
      const int nSlotID = iter->first;
      //MB_DPRINTLN("ScrEvent> fire event Slot=%d Cat=%s Tgt=%d Evt=%d", nSlotID, aCatStr.c_str(), aTgtType, aEvtType);

      qlib::LVarArgs args(6);
      
      // target slot ID
      args.at(0).setIntValue(nSlotID);

      // category string
      args.at(1).setStringValue(aCatStr);
      
      // source category ID
      args.at(2).setIntValue(aTgtType);
      
      // event type ID
      args.at(3).setIntValue(aEvtType);
      
      // event source UID (none)
      args.at(4).setIntValue(aSrcID);
      
      // misc info (in JSON format)
      LScriptable *pScrObj = event.getScrObject();
      if (pScrObj==NULL) {
        args.at(5).setStringValue(event.getJSON());
      }
      else {
        args.at(5).setObjectPtr(pScrObj);
      }
      
      bool result = m_pCb->invoke(args);
      if (result) {
        const qlib::LVariant &rval = args.retval();
        if (rval.isBool() && rval.getBoolValue()) {
          // Event is consumed and propagation is canceled
          return true;
        }
      }
    }
  }

  return false;
}

bool ScrEventManager::fireEventImpl(QsysEvent &event)
{
  LString aCatStr;
  int aTgtType;
  int aEvtType;

  if (!event.getCategory(aCatStr, aTgtType, aEvtType))
    return false;

  qlib::uid_t aSrcID = event.getSource();
  return fireEventScript(aCatStr, aTgtType, aEvtType, aSrcID, event);
}

bool ScrEventManager::fireViewEvent(ViewEvent &event)
{
  bool bcancel = fireNativeViewEvent(event);
  if (bcancel) return true;
  return fireEventImpl(event);
}

/*
bool ScrEventManager::fireObjectEvent(ObjectEvent &event)
{
  return fireEventImpl(event);
}

bool ScrEventManager::fireSceneEvent(SceneEvent &event)
{
  return fireEventImpl(event);
}

bool ScrEventManager::fireRendererEvent(RendererEvent &event)
{
  return fireEventImpl(event);
}
*/

int ScrEventManager::addListener(qlib::LSCBPtr scb)
{
  m_pCb = scb;
  return 0;
}

bool ScrEventManager::removeListener(int nid)
{
  m_pCb = qlib::LSCBPtr();
  return true;
}

int ScrEventManager::append(const LString &category,
                            int nTgtType,
                            int nEvtType,
                            int nSrcUID)
{
  Entry *pent = MB_NEW Entry;
  pent->cat = category;
  pent->nTgtType = nTgtType;
  pent->nEvtType = nEvtType;
  if (nSrcUID<0)
    pent->nSrcUID = qlib::invalid_uid;
  else
    pent->nSrcUID = nSrcUID;
  int id = m_slot.put(pent);
  return id;
}

bool ScrEventManager::remove(int nSlotID)
{
  Entry *pOld = m_slot.remove(nSlotID);
  if (pOld==NULL) return false;
  delete pOld;
  return true;
}

/// XXX: ???
int ScrEventManager::searchSlot(const LString &category,
                                int nTgtType, int nEvtType, qlib::uid_t nSrcUID)
{
  return -1;
}

void ScrEventManager::logAppended(qlib::LLogEvent &ev)
{
  if (m_pCb.isnull()) return;
  if (ev.getType()>qlib::LMsgLog::DL_WARN) return;
  
  fireEventScript("log", SEM_LOG, SEM_ADDED, 0, ev);
}

void ScrEventManager::addViewListener(qlib::uid_t nFilter,
                                      ViewEventListener *pL)
{
  m_viewListeners.push_back( ViewListeners::value_type(nFilter, pL) );
}

bool ScrEventManager::removeViewListener(ViewEventListener *pL)
{
  int nremv = 0;
  for (;;) {
    ViewListeners::iterator i = m_viewListeners.begin();
    ViewListeners::iterator end = m_viewListeners.end();
    bool bRemoved = false;
    
    for ( ;i!=end; ++i) {
      const ViewListeners::value_type &elem = *i;
      if (i->second == pL) {
        m_viewListeners.erase(i);
        ++nremv;
        bRemoved = true;
        break;
      }
    }
    
    if (!bRemoved)
      return (nremv>0) ? true : false;
  }
  
  // Not reached here!!
  return false;
}

bool ScrEventManager::fireNativeViewEvent(ViewEvent &event)
{
  int i, nls = m_viewListeners.size();
  if (nls==0) return false;

  // make copy
  std::vector<ViewETuple> lsns(nls);
  std::copy(m_viewListeners.begin(), m_viewListeners.end(), lsns.begin());

  for (i=0; i<nls; ++i) {
    if (lsns[i].first==qlib::invalid_uid) {
      // Non-specific listener
      lsns[i].second->viewChanged(event);
    }
    else if (lsns[i].first==event.getTarget() ||
             lsns[i].first==event.getSource()) {
      // Target/Source match
      lsns[i].second->viewChanged(event);
    }
  }

  // propagate to the next chain.
  return false;
}

