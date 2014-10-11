// -*-Mode: C++;-*-
//
// LRcObject.cpp
//   reference counter class LRcObject
//
// $Id: LRcObject.cpp,v 1.1 2007/03/30 15:20:56 rishitani Exp $

#include <common.h>

#include "LRcObject.hpp"

using namespace qlib;

LRcObject::~LRcObject() 
{
  // reference counter must be ZERO !!
  MB_ASSERT(m_nRef==0);
}
