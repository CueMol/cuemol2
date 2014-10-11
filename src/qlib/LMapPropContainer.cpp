//
// Property container with std::map implementation
//
// $Id: LMapPropContainer.cpp,v 1.2 2009/12/12 17:27:56 rishitani Exp $

#include <common.h>

#include "LMapPropContainer.hpp"
#include "LString.hpp"
#include "LPropEvent.hpp"
#include "ObjectManager.hpp"

using namespace qlib;

LMapPropContainer::~LMapPropContainer()
{
  PropMap::iterator i = m_props.begin();
  for (; i!=m_props.end(); ++i) {
    i->second.value.cleanup();
  }
}

bool LMapPropContainer::addProperty(const LString &propnm, bool bWritable,
                                    const LString &typenm, const LVariant &inivalue)
{
  std::pair<PropMap::iterator, bool> res = m_props.insert(PropMap::value_type(propnm, PropEnt()));
  if (!res.second) return false;

  res.first->second.value.copyAndOwn(inivalue);
  res.first->second.bWritable = bWritable;
  res.first->second.typenm = typenm;
  
  return true;
}

bool LMapPropContainer::removeProperty(const LString &propnm)
{
  PropMap::iterator i = m_props.find(propnm);
  if (i==m_props.end()) return false;
  i->second.value.cleanup();
  m_props.erase(i);
  return true;
}

//////////

bool LMapPropContainer::hasProperty(const LString &propnm) const
{
  PropMap::const_iterator i = m_props.find(propnm);
  if (i!=m_props.end()) return true;
  return false;
}

bool LMapPropContainer::hasWritableProperty(const LString &propnm) const
{
  PropMap::const_iterator i = m_props.find(propnm);
  if (i!=m_props.end()) return i->second.bWritable;
  return false;
}

bool LMapPropContainer::getProperty(const LString &propnm, LVariant &presult) const
{
  PropMap::const_iterator i = m_props.find(propnm);
  if (i!=m_props.end()) return false;
  presult = i->second.value;
  return true;
}

bool LMapPropContainer::setProperty(const LString &propnm, const LVariant &pvalue)
{
  PropMap::iterator i = m_props.find(propnm);
  if (i!=m_props.end()) return false;

  i->second.value.copyAndOwn(pvalue);
  return true;
}

void LMapPropContainer::getPropNames(std::set<LString> &sret) const
{
  PropMap::const_iterator i = m_props.begin();
  for (; i!=m_props.end(); ++i) {
    sret.insert( i->first );
  }
}

const char *LMapPropContainer::getPropTypeName(const char *propnm) const
{
  PropMap::const_iterator i = m_props.find(propnm);
  if (i==m_props.end()) return NULL;
  return i->second.typenm.c_str();
}

////////////////////////

// #include "ObjStream.hpp"

/*
void LMapPropContainer::writeTo(ObjOutStream &oos) const
{
}

void LMapPropContainer::readFrom(ObjInStream &ois)
{
}
*/

