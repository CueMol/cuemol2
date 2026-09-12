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
      const LString tpnm = iter->first;
      MB_DPRINTLN("Renderer %s (%s) UNregistered", tpnm.c_str(), abiname.c_str());
      m_rendtab.erase(iter);

      // Aliases of the removed type cannot resolve any more.
      aliastab_t::iterator ai = m_aliastab.begin();
      while (ai!=m_aliastab.end()) {
        if (ai->second.target.equals(tpnm))
          m_aliastab.erase(ai++);
        else
          ++ai;
      }
      return true;
    }
  }
  
  return false;
}

void RendererFactory::registAlias(const LString &oldName, const LString &newName,
                                  const PresetList &presets)
{
  if (!m_rendtab.get(oldName).isnull()) {
    LString msg = LString::format("Renderer alias %s shadows a registered renderer",
                                  oldName.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  AliasEntry ent;
  ent.target = newName;
  ent.presets = presets;
  m_aliastab[oldName] = ent;

  MB_DPRINTLN("Renderer alias %s --> %s registered", oldName.c_str(), newName.c_str());
}

bool RendererFactory::unregistAlias(const LString &oldName)
{
  aliastab_t::iterator ai = m_aliastab.find(oldName);
  if (ai==m_aliastab.end())
    return false;
  m_aliastab.erase(ai);
  return true;
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
    // Not a registered type: it may be an obsolete name kept as an alias.
    // Aliases resolve in one step, so the target must be registered.
    aliastab_t::const_iterator ai = m_aliastab.find(nickname);
    if (ai!=m_aliastab.end() && !m_rendtab.get(ai->second.target).isnull()) {
      RendererPtr pAliased = create(ai->second.target);
      // setPropStr() clears the property's default flag, so the preset is kept
      // by reapplyStyle() and written out when the scene is saved again.
      for (const auto &preset : ai->second.presets) {
        if (!pAliased->setPropStr(preset.first.c_str(), preset.second))
          LOG_DPRINTLN("RendererFactory> alias %s --> %s: preset %s=%s rejected",
                       nickname.c_str(), ai->second.target.c_str(),
                       preset.first.c_str(), preset.second.c_str());
      }
      MB_DPRINTLN("Renderer alias %s --> %s created",
                  nickname.c_str(), ai->second.target.c_str());
      return pAliased;
    }

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

