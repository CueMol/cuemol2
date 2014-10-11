//
// Renderer factory singleton class
//
// $Id: RendererFactory.cpp,v 1.4 2010/03/13 14:15:44 rishitani Exp $
//

#include <common.h>

#include "RendererFactory.hpp"
#include "Renderer.hpp"
#include "style/StyleMgr.hpp"

#include <qlib/ClassRegistry.hpp>

SINGLETON_BASE_IMPL(qsys::RendererFactory);

using namespace qsys;

RendererFactory::RendererFactory()
{
}

RendererFactory::~RendererFactory()
{
}

void RendererFactory::regist(const LString &abiname)
{
  qlib::ClassRegistry *pCR = qlib::ClassRegistry::getInstance();
  qlib::LClass *pCls = pCR->getClassObjByAbiName(abiname);
  
  // Create a dummy instance to retrieve type information
  qlib::LDynamic *pObj0 = pCls->createObj();
  Renderer *pObj = dynamic_cast<Renderer *>(pObj0);
  if (pObj==NULL) {
    LString msg = LString::format("Class %s is not Renderer", abiname.c_str());
    MB_THROW(qlib::InvalidCastException, msg);
    return;
  }

  RendererPtr rRend(pObj);
  LString tpnm = rRend->getTypeName();
  m_rendtab.set(tpnm, rRend);

  // // reset all props to default value
  // rRend->resetAllProps();

  MB_DPRINTLN("Renderer %s (%s) registered", tpnm.c_str(), abiname.c_str());
}

bool RendererFactory::unregist(const LString &abiname)
{
  rendtab_t::iterator iter = m_rendtab.begin();
  for (; iter!=m_rendtab.end(); ++iter) {
    Renderer *pRend = (iter->second).get();
    if (abiname.equals(typeid(*pRend).name())) {
      MB_DPRINTLN("Renderer %s (%s) UNregistered", iter->first.c_str(), abiname.c_str());
      m_rendtab.erase(iter);
      return true;
    }
  }
  
  return false;
}

bool RendererFactory::isRegistered(const LString &abiname)
{
  rendtab_t::const_iterator iter = m_rendtab.begin();
  for (; iter!=m_rendtab.end(); ++iter) {
    Renderer *pRend = (iter->second).get();
    if (abiname.equals(typeid(*pRend).name()))
      return true;
  }
  return false;
}

RendererPtr RendererFactory::create(const LString &nickname)
{
  RendererPtr rRend = m_rendtab.get(nickname);
  if (rRend.isnull()) {
    LString msg = LString::format("Unknown renderer %s", nickname.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return RendererPtr();
  }

  qlib::LClass *pCls = rRend->getClassObj();
  Renderer *pObj = dynamic_cast<Renderer *>(pCls->createObj());
  if (pObj==NULL) {
    LString msg = LString::format("Cannot instanciate renderer %s", nickname.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return RendererPtr();
  }

  // reset all props to default value
  pObj->resetAllProps();
  
  // listen style events (for update by style change)
  StyleMgr *pSMgr = StyleMgr::getInstance();
  if (pSMgr!=NULL)
    pSMgr->addListener(pObj);

  return RendererPtr(pObj);
}

int RendererFactory::searchCompatibleRenderers(ObjectPtr pobj, std::list<LString> &result)
{
  int n=0;
  rendtab_t::const_iterator iter = m_rendtab.begin();
  for (; iter!=m_rendtab.end(); ++iter) {
    if (!iter->second->isCompatibleObj(pobj))
      continue;
    result.push_back(iter->first);
    ++n;
  }
  return n;
}

