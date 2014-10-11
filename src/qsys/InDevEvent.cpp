//
//  Input device event
//
// $Id: InDevEvent.cpp,v 1.1 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "InDevEvent.hpp"

using namespace qsys;

qlib::LCloneableObject *InDevEvent::clone() const
{
  // MB_ASSERT(false);
  return MB_NEW InDevEvent(*this);
}

InDevEvent::~InDevEvent()
{
}

LString InDevEvent::getJSON() const
{
  LString json = "{ ";
  json += LString::format("\"x\": %d, \"y\": %d, \"mod\": %d",
                          getX(), getY(), getModifier());
  json += " }";
  return json;
}

void InDevEvent::copyFrom(const InDevEvent &arg)
{
  m_pSource = arg.m_pSource;
  m_nType = arg.m_nType;
  m_nModifier = arg.m_nModifier;
  m_fConsumed = arg.m_fConsumed;
  m_x = arg.m_x;
  m_y = arg.m_y;
  m_deltax = arg.m_deltax;
  m_deltay = arg.m_deltay;
  m_movex = arg.m_movex;
  m_movey = arg.m_movey;
  m_velox = arg.m_velox;
  m_veloy = arg.m_veloy;
}

