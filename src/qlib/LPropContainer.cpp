//
// LPropContainer dynamic property class implementation
//

#include <common.h>

#include "LPropContainer.hpp"

using namespace qlib;

LDynPropContainer::LDynPropContainer() : m_pProps(NULL) {}

LDynPropContainer::LDynPropContainer(const LDynPropContainer &src) : m_pProps(NULL)
{
    if (src.m_pProps != NULL) m_pProps = MB_NEW DynPropTab(*src.m_pProps);
}

LDynPropContainer &LDynPropContainer::operator=(const LDynPropContainer &src)
{
    if (&src == this) return *this;
    delete m_pProps;
    m_pProps = NULL;
    if (src.m_pProps != NULL) m_pProps = MB_NEW DynPropTab(*src.m_pProps);
    return *this;
}

LDynPropContainer::~LDynPropContainer()
{
    delete m_pProps;
}

bool LDynPropContainer::hasDynProp(const LString &propnm) const
{
    if (m_pProps == NULL) return false;
    DynPropTab::const_iterator i = m_pProps->find(propnm);
    if (m_pProps->end()==i)
        return false; // not found!!
    return true;
}

bool LDynPropContainer::getDynProp(const LString &propnm, qlib::LVariant &presult) const
{
  if (m_pProps == NULL) return false;
  DynPropTab::const_iterator i = m_pProps->find(propnm);
  if (m_pProps->end()==i)
    return false; // not found!!

  presult = i->second;
  return true;
}

bool LDynPropContainer::setDynProp(const LString &propnm, const qlib::LVariant &pvalue)
{
  if (m_pProps == NULL) m_pProps = MB_NEW DynPropTab;
  m_pProps->forceSet(propnm, pvalue);
  return true;
}

bool LDynPropContainer::removeDynProp(const LString &propnm)
{
  if (m_pProps == NULL) return false;
  return m_pProps->remove(propnm);
}

int LDynPropContainer::getDynPropNames(std::set<LString> &names) const
{
  if (m_pProps == NULL) return 0;
  DynPropTab::const_iterator i = m_pProps->begin();
  DynPropTab::const_iterator ie = m_pProps->end();
  
  int nnames = 0;
  for (; i!=ie; ++i) {
    names.insert(i->first);
    ++nnames;
  }

  return nnames;
}

LString LDynPropContainer::getDynPropTypeName(const LString &propnm) const
{
  if (m_pProps == NULL) return LString();
  DynPropTab::const_iterator i = m_pProps->find(propnm);
  if (m_pProps->end()==i)
    return LString(); // not found!!

  return i->second.getTypeString();
}

//////////

bool LDynPropContainer::setDynPropBool(const LString &propname, bool value)
{
  LVariant var;
  var.setBoolValue(value);
  return setDynProp(propname, var);
}

bool LDynPropContainer::setDynPropInt(const LString &propname, int value)
{
  LVariant var;
  var.setIntValue(value);
  return setDynProp(propname, var);
}

bool LDynPropContainer::setDynPropReal(const LString &propname, double value)
{
  LVariant var;
  var.setRealValue(value);
  return setDynProp(propname, var);
}

bool LDynPropContainer::setDynPropStr(const LString &propname, const LString &value)
{
  LVariant var;
  var.setStringValue(value);
  return setDynProp(propname, var);
}

/////////////////

bool LDynPropContainer::getDynPropBool(const LString &propname, bool &value) const
{
  LVariant var;
  if (!getDynProp(propname, var))
    return false;
  if (!var.isBool())
    return false;
  value = var.getBoolValue();
  return true;
}

bool LDynPropContainer::getDynPropInt(const LString &propname, int &value) const
{
  LVariant var;
  if (!getDynProp(propname, var))
    return false;
  if (!var.isInt())
    return false;
  value = var.getIntValue();
  return true;
}

bool LDynPropContainer::getDynPropReal(const LString &propname, double &value) const
{
  LVariant var;
  if (!getDynProp(propname, var))
    return false;
  if (!var.isReal())
    return false;
  value = var.getRealValue();
  return true;
}

bool LDynPropContainer::getDynPropStr(const LString &propname, LString &value) const
{
  LVariant var;
  if (!getDynProp(propname, var))
    return false;
  if (!var.isString())
    return false;
  value = var.getStringValue();
  return true;
}

//////////

bool LDynPropContainer::getDynPropBool(const LString &propname) const
{
  bool rval;
  if (!getDynPropBool(propname, rval)) {
    LString msg = LString::format("Boolean property %s not found", propname.c_str());
    MB_THROW(PropNotFoundException, msg);
    return false;
  }
  return rval;
}

int LDynPropContainer::getDynPropInt(const LString &propname) const
{
  int rval;
  if (!getDynPropInt(propname, rval)) {
    LString msg = LString::format("Integer property %s not found", propname.c_str());
    MB_THROW(PropNotFoundException, msg);
    return 0;
  }
  return rval;
}

double LDynPropContainer::getDynPropReal(const LString &propname) const
{
  double rval;
  if (!getDynPropReal(propname, rval)) {
    LString msg = LString::format("Realnum property %s not found", propname.c_str());
    MB_THROW(PropNotFoundException, msg);
    return 0.0;
  }
  return rval;
}

LString LDynPropContainer::getDynPropStr(const LString &propname) const
{
  LString rval;
  if (!getDynPropStr(propname, rval)) {
    LString msg = LString::format("String property %s not found", propname.c_str());
    MB_THROW(PropNotFoundException, msg);
    return LString();
  }
  return rval;
}

