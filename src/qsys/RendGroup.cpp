
#include <common.h>

#include "RendGroup.hpp"
#include "Object.hpp"

using namespace qsys;
using gfx::DisplayContext;

///////////////////////////////////////////////////////////////////
// Ctor/Dtor

RendGroup::RendGroup()
{
}

RendGroup::~RendGroup()
{
}

const char *RendGroup::getTypeName() const
{
  return "*group";
}

bool RendGroup::isCompatibleObj(ObjectPtr pobj) const
{
  // rendgrp is compatible for all object
  return true;
}

LString RendGroup::toString() const
{
  return LString("Renderer group");
}

/// Called just before this object is unloaded
void RendGroup::unloading()
{
}

qlib::Vector4D RendGroup::getCenter() const
{
  // Calc COM of renderers in this group
  Vector4D resvec;
  int nsum = 0;
  ObjectPtr pObj = getClientObj();
  Object::RendIter iter = pObj->beginRend();
  Object::RendIter eiter = pObj->endRend();
  for (;iter!=eiter;++iter) {
    RendererPtr pRend = iter->second;
    if (!pRend->getGroupName().equals(getName()))
      continue;
    if (pRend->hasCenter()) {
      resvec += pRend->getCenter();
      ++nsum;
    }
  }
  if (nsum>0)
    return resvec.divide(nsum);
  else
    return qlib::Vector4D();
}

bool RendGroup::hasCenter() const
{
  ObjectPtr pObj = getClientObj();
  Object::RendIter iter = pObj->beginRend();
  Object::RendIter eiter = pObj->endRend();
  for (;iter!=eiter;++iter) {
    RendererPtr pRend = iter->second;
    if (!pRend->getGroupName().equals(getName()))
      continue;
    if (pRend->hasCenter()) {
      return true;
    }
  }

  // none of the renderers in this group has valid center
  return false;
}

void RendGroup::display(DisplayContext *pdc)
{
}

