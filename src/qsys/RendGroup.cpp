
#include <common.h>

#include "RendGroup.hpp"

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
  // TO DO: calc COM of renderers in this group
  return qlib::Vector4D();
}

void RendGroup::display(DisplayContext *pdc)
{
}

