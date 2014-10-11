// -*-Mode: C++;-*-
//
// View related events
//
// $Id: ViewEvent.cpp,v 1.1 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "ViewEvent.hpp"
#include "ScrEventManager.hpp"
#include <qlib/LPropEvent.hpp>

using namespace qsys;

ViewEvent::~ViewEvent()
{
}

qlib::LCloneableObject *ViewEvent::clone() const
{
  return MB_NEW ViewEvent(*this);
}

LString ViewEvent::getJSON() const
{
  //LString json = "{}";

  LString json = "{";
  if (getType()==VWE_PROPCHG_DRG)
    json += "\"dragging\": true, ";
  else
    json += "\"dragging\": false, ";

  if (getType()==VWE_PROPCHG||getType()==VWE_PROPCHG_DRG) {
    qlib::LPropEvent *pev = getPropEvent();
    if (pev!=NULL) {
      json += "\"propname\": \"" + pev->getName().escapeQuots() + "\", ";
      // json += "\"parentname\": \"" + pev->getParentName().escapeQuots() + "\", ";
    }
    else {
      // emulate prop event
      json += "\"propname\": \"" + getDescr().escapeQuots() + "\", ";
    }
  }
  json += LString::format("\"target_uid\": %d,", getTarget());
  json += "\"descr\": \"" + getDescr().escapeQuots() + "\" ";
  json += "}";

  return json;
}

bool ViewEvent::getCategory(LString &category, int &nTgtType, int &nEvtType) const
{
  const int nev = getType();
  switch (nev) {
  case ViewEvent::VWE_PROPCHG:
    nEvtType = ScrEventManager::SEM_PROPCHG;
    nTgtType = ScrEventManager::SEM_VIEW;
    category = "viewPropChanged";
    break;

  case ViewEvent::VWE_PROPCHG_DRG:
    nEvtType = ScrEventManager::SEM_PROPCHG;
    nTgtType = ScrEventManager::SEM_VIEW;
    category = "viewPropChgDragging";
    break;

  case ViewEvent::VWE_ACTIVATED:
    nEvtType = ScrEventManager::SEM_OTHER;
    nTgtType = ScrEventManager::SEM_VIEW;
    category = "viewActivated";
    break;

  case ViewEvent::VWE_SIZECHG:
    nEvtType = ScrEventManager::SEM_CHANGED;
    nTgtType = ScrEventManager::SEM_VIEW;
    category = "viewSizeChanged";
    break;

  default:
    MB_DPRINTLN("FATAL ERROR: unknown event type");
    return false;
  }

  //MB_DPRINTLN("View Event descr=%s type=%d, target=%d",
  //getDescr().c_str(), nEvtType, nTgtType);
  return true;
}

