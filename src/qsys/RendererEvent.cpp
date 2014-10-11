// -*-Mode: C++;-*-
//
// Renderer related events
//
// $Id: RendererEvent.cpp,v 1.1 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "RendererEvent.hpp"
#include "ScrEventManager.hpp"
#include <qlib/LPropEvent.hpp>

using namespace qsys;

RendererEvent::~RendererEvent()
{
}

qlib::LCloneableObject *RendererEvent::clone() const
{
  return MB_NEW RendererEvent(*this);
}

LString RendererEvent::getJSON() const
{
  LString json = "{";
  if (getType()==RNE_PROPCHG) {
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

bool RendererEvent::getCategory(LString &category, int &nSrcType, int &nEvtType) const
{
  const int nev = getType();
  switch (nev) {
  case RendererEvent::RNE_CHANGED:
    nEvtType = ScrEventManager::SEM_CHANGED;
    nSrcType = ScrEventManager::SEM_RENDERER;
    category = getDescr();
    break;
  case RendererEvent::RNE_PROPCHG:
    nEvtType = ScrEventManager::SEM_PROPCHG;
    nSrcType = ScrEventManager::SEM_RENDERER;
    category = getDescr();
    break;

  default:
    MB_DPRINTLN("FATAL ERROR: unknown event type");
    return false;
  }

  return true;
}

