// -*-Mode: C++;-*-
//
// $Id: NamedObject.cpp,v 1.1 2009/01/05 08:58:44 rishitani Exp $
//

#include <common.h>

#include "NamedObject.hpp"

using namespace qlib;

NamedObject::~NamedObject()
{
}

void NamedObject::setName(const LString &name)
{
  m_name = name;
}

