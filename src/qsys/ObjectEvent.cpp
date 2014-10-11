// -*-Mode: C++;-*-
//
// Object related events
//
// $Id: ObjectEvent.cpp,v 1.1 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "ObjectEvent.hpp"
#include "ScrEventManager.hpp"
#include <qlib/LPropEvent.hpp>

using namespace qsys;

ObjectEvent::~ObjectEvent()
{
}

qlib::LCloneableObject *ObjectEvent::clone() const
{
  return MB_NEW ObjectEvent(*this);
}

LString ObjectEvent::getJSON() const
{
  LString json = "{";
  if (getType()==OBE_PROPCHG) {
    qlib::LPropEvent *pev = getPropEvent();
    if (pev!=NULL) {
      json += "\"propname\": \"" + pev->getName().escapeQuots() + "\", ";
      json += "\"parentname\": \"" + pev->getParentName().escapeQuots() + "\", ";
    }
  }
  json += LString::format("\"target_uid\": %d,", getTarget());
  json += "\"descr\": \"" + getDescr().escapeQuots() + "\" ";
  json += "}";
  return json;
}

bool ObjectEvent::getCategory(LString &category, int &nSrcType, int &nEvtType) const
{
  const int nev = getType();
  switch (nev) {
  case ObjectEvent::OBE_CHANGED:
    nEvtType = ScrEventManager::SEM_CHANGED;
    nSrcType = ScrEventManager::SEM_OBJECT;
    category = getDescr();
    break;
  case ObjectEvent::OBE_PROPCHG:
    nEvtType = ScrEventManager::SEM_PROPCHG;
    nSrcType = ScrEventManager::SEM_OBJECT;
    category = getDescr();
    break;

  default:
    MB_DPRINTLN("FATAL ERROR: unknown event type");
    return false;
  }

  return true;
}

