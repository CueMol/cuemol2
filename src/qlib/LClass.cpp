//
// metaclass class
//
// $Id: LClass.cpp,v 1.6 2010/09/15 15:42:44 rishitani Exp $

#include <common.h>

#include "LClass.hpp"
#include "LDynamic.hpp"
#include "ClassRegistry.hpp"
#include "LWrapper.hpp"

using namespace qlib;

LClass::LClass()
{
  // : m_wrapFactories(LWRAPPERID_MAX)
  //  for (int i=0; i<LWRAPPERID_MAX; ++i)
  //    m_wrapFactories[i] = NULL;
}

LClass::~LClass()
{
  //  if (m_pInst!=NULL)
  //    delete m_pInst;

  //  for (int i=0; i<LWRAPPERID_MAX; ++i)
  //    if (m_wrapFactories[i])
  //      delete m_wrapFactories[i];
}

bool LClass::isSingleton() const
{
  return false;
}

