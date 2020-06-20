// -*-Mode: C++;-*-
//
// Object factory for de-seriazliation
//
// $Id: ClassRegistry.cpp,v 1.6 2008/12/23 12:04:54 rishitani Exp $

#include <common.h>
#include "LClass.hpp"
#include "LDynamic.hpp"
#include "ClassRegistry.hpp"

using namespace qlib;

//static
ClassRegistry *ClassRegistry::m_sInstance;

// static
bool ClassRegistry::init()
{
  m_sInstance = MB_NEW ClassRegistry();
  MB_DPRINTLN("Class registry: initialized %p", m_sInstance);
  return true;
}

// static
void ClassRegistry::fini()
{
  if (m_sInstance!=NULL) {
    delete m_sInstance;
    m_sInstance = NULL;
    MB_DPRINTLN("Class registry: finalized");
  }
  else {
    LOG_DPRINTLN("WARNING: Class registry is not initialized!!");
  }
}

///////////////////////////////////

ClassRegistry::~ClassRegistry()
{
  // Cleanup all remainning class objects
  ClassTable::const_iterator iter = m_abitab.begin();
  for (; iter!=m_abitab.end(); ++iter) {
    // call the class finalization function
    iter->second->callFini();
    delete iter->second;
  }
}

LClass *ClassRegistry::getClassObjByAbiNameNx(const LString &name) noexcept
{
  ClassTable::const_iterator iter = m_abitab.find(name);
  if (iter==m_abitab.end()) {
    return NULL;
  }
  return iter->second;
}

LClass *ClassRegistry::getClassObjByAbiName(const LString &name)
{
  LClass *p = getClassObjByAbiNameNx(name);
  if (p==NULL) {
    MB_THROW(ClassNotFoundException,
		 LString::format("class \"%s\" is not founnd.", name.c_str()));
  }
  return p;
}

bool ClassRegistry::regClassObj(LClass *pcls)
{
  MB_ASSERT(this!=NULL);
  const LString &abiname = pcls->getAbiClassName();

  //
  // register the ABI name table
  //

  ClassTable::iterator iter = m_abitab.find(abiname);
  if (iter!=m_abitab.end()) {
    LClass *pp = iter->second;
    // remove the abstract class entry
    m_abitab.erase(iter);
    delete pp;
  }

  bool res = m_abitab.insert(ClassTable::value_type(abiname, pcls)).second;
  if (!res)
    LOG_DPRINTLN("FATAL ERROR: cannot ovwr classabitab %s %p", pcls->getClassName().c_str(), pcls);

  //
  // register the common name table
  //

  const LString &name = pcls->getClassName();
  iter = m_nametab.find(name);
  if (iter!=m_nametab.end())
    m_nametab.erase(iter); // overwrite the existing entry

  res = m_nametab.insert(ClassTable::value_type(name, pcls)).second;
  if (!res)
    LOG_DPRINTLN("FATAL ERROR: cannot ovwr classnametab %s %p", pcls->getClassName().c_str(), pcls);

  // call the class initialization function
  pcls->callInit();

  MB_DPRINTLN("Class ABI=%s, COM=%s, ptr=%p registered", abiname.c_str(), name.c_str(), pcls);

  return true;
}

bool ClassRegistry::unregClassObj(const std::type_info &t)
{
  ClassTable::iterator iter = m_abitab.find(t.name());
  if (iter==m_abitab.end()) {
    MB_DPRINTLN("ClsReg> unregClassObj() Class %s not found.", t.name());
    return false;
  }

  LClass *pcls = iter->second;

  // unregister from the ABI name table
  m_abitab.erase(iter);

  // unregister from the common name table
  const LString &name = pcls->getClassName();
  iter = m_nametab.find(name);
  if (iter==m_nametab.end()) {
    // the table becomes inconsistent!! (ignore)
    MB_DPRINTLN("ClassRegistry::unregClassObj> Class %s not found in the common name table.", t.name());
  }
  else {
    m_nametab.erase(iter);
  }

  // call the class finalization function
  pcls->callFini();

  // LClass inherits SingletonBase class,
  //  so pcls will be destructed in the SingletonBase::fini() method.
  // delete pcls;

  MB_DPRINTLN("ClsReg> MetaClass for %s (%p) unregistered", t.name(), pcls);
  
  return true;
}


LClass *ClassRegistry::getClassObj(const LString &name)
{
  ClassTable::const_iterator iter = m_nametab.find(name);
  if (iter==m_nametab.end()) {
    LString msg = LString::format("class \"%s\" is not founnd.", name.c_str());
    MB_DPRINTLN("ClassRegistry::getClassObj(): %s ", msg.c_str());
    MB_THROW(ClassNotFoundException, msg);
    return NULL;
  }
  return iter->second;
}

LDynamic *ClassRegistry::createObj(const LString &name)
{
  LClass *pCls = getClassObj(name);
  /*if (pCls==NULL) {
    LOG_DPRINTLN("ClassRegistry> Cannot get class obj for <%s>", name.c_str());
    LOG_DPRINTLN("ClassRegistry> createObj() failed");
    return NULL;
    }*/

  if (pCls->isSingleton()) {
    LString msg = LString::format("Cannot instantiate a singleton class \"%s\"",
				  name.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(IllegalArgumentException, msg);
    return NULL;
  }

  return pCls->createObj();
}

LDynamic *ClassRegistry::getSingletonObj(const LString &name)
{
  LClass *pCls = getClassObj(name);

  if (!pCls->isSingleton()) {
    LString msg = LString::format("\"%s\" is not a singleton class",
				  name.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(IllegalArgumentException, msg);
    return NULL;
  }

  // Singleton's createObj method calls its getInstance() static method.
  return pCls->createObj();
}

void ClassRegistry::getAllClassNames(std::list<LString> &ls)
{
  ClassTable::const_iterator iter = m_nametab.begin();
  ClassTable::const_iterator eiter = m_nametab.end();
  
  for (; iter!=eiter; ++iter) {
    ls.push_back(iter->first);
  }

}

