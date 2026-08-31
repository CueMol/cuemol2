
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

// Membership scan shared by getCenter/hasCenter. A group is never a member of
// a group (nesting is not supported), so other RendGroups are skipped -- and
// have to be: a group whose name matches the scan (itself, or another group
// carrying the same name, both typically empty on a group whose name was lost
// in serialization) would recurse through here without end. That was reachable
// by pasting such an object and crashed on stack overflow.
static bool isGroupMember(const RendGroup *pThis, const RendererPtr &pRend)
{
  if (dynamic_cast<const RendGroup *>(pRend.get()) != NULL)
    return false;
  return pRend->getGroupName().equals(pThis->getName());
}

qlib::Vector4D RendGroup::getCenter() const
{
  // Calc COM of renderers in this group
  Vector4D resvec;
  int nsum = 0;
  ObjectPtr pObj = getClientObj();
  if (pObj.isnull())
    return qlib::Vector4D();
  Object::RendIter iter = pObj->beginRend();
  Object::RendIter eiter = pObj->endRend();
  for (;iter!=eiter;++iter) {
    RendererPtr pRend = iter->second;
    if (!isGroupMember(this, pRend))
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
  if (pObj.isnull())
    return false;
  Object::RendIter iter = pObj->beginRend();
  Object::RendIter eiter = pObj->endRend();
  for (;iter!=eiter;++iter) {
    RendererPtr pRend = iter->second;
    if (!isGroupMember(this, pRend))
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

