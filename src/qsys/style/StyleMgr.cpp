// -*-Mode: C++;-*-
//
// Style/color database
//
// $Id: StyleMgr.cpp,v 1.5 2011/04/18 14:06:23 rishitani Exp $

#include <common.h>

#include "StyleMgr.hpp"
#include "StyleSet.hpp"
#include "StyleSupports.hpp"

#include <gfx/SolidColor.hpp>
#include <gfx/NamedColor.hpp>

#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Stream.hpp>

// #define DELIM STYLEMGR_DB_DELIM

SINGLETON_BASE_IMPL(qsys::StyleMgr);

using namespace qsys;

using qlib::LDom2Node;
using gfx::SolidColor;
using gfx::SolidColorPtr;
using gfx::AbstractColor;
using gfx::NamedColor;

//////////////////////////////////////////////////
// Static initializer/finalizer (invoked upon startup/termination)

namespace {
  // Named color resolver using style manager
  class NamedColResImpl : public gfx::NamedColorResolver
  {
  public:
    StyleMgr *m_pSM;

    NamedColResImpl() : m_uidgen(0) {}

    /// Resolve named color
    virtual ColorPtr getColor(const LString &rkey)
    {
      return m_pSM->getColor(rkey);
    }

    /// Resolve named color with scene ID
    virtual ColorPtr getColor(const LString &rkey, qlib::uid_t nScopeID)
    {
      return m_pSM->getColor(rkey, nScopeID);
    }

    /// Get current context ID
    virtual qlib::uid_t getContextID()
    {
      return m_pSM->getContextID();
    }

    //
    // named color's cache implementation
    //
    
  private:
    typedef std::set<qlib::uid_t> CacheTable;

    qlib::uid_t m_uidgen;

    /// UID --> cached flag
    CacheTable m_catab;

    qlib::uid_t createNewUID() {
      return ++m_uidgen;
    }
    
  public:

    virtual qlib::uid_t makeCache() {
      qlib::uid_t uid = createNewUID();
      bool res = m_catab.insert(uid).second;
      if (res)
        return uid;
      else
        return qlib::invalid_uid;
    }

    virtual bool isCached(qlib::uid_t uid) const {
      CacheTable::const_iterator i = m_catab.find(uid);
      if (i==m_catab.end())
        return false;
      return true;
    }

    virtual void setCached(qlib::uid_t uid, bool b) {
      if (b)
        m_catab.insert(uid);
      else {
        CacheTable::iterator i = m_catab.find(uid);
        if (i!=m_catab.end())
          m_catab.erase(i);
      }
    }

    virtual void invalidateCache() {
      m_catab.clear();
    }

  };

  NamedColResImpl *gRes;
}

//static
bool StyleMgr::init()
{
  bool res = qlib::SingletonBase<StyleMgr>::init();

  gRes = MB_NEW NamedColResImpl();
  gRes->m_pSM = getInstance();
  NamedColor::setResolver(gRes);

  return res;
}

//static
void StyleMgr::fini()
{
  NamedColor::setResolver(NULL);
  delete gRes;
  qlib::SingletonBase<StyleMgr>::fini();
}

/////////////////////////

StyleMgr::StyleMgr()
{
  // global context
  m_curCtxtStack.push_front(qlib::invalid_uid);

  // create global context
  m_pGlob = getCreateStyleList(qlib::invalid_uid);

  m_pLsnrs = MB_NEW StyleEventCaster;
}

StyleMgr::~StyleMgr()
{
  // destroy StyleLists
  BOOST_FOREACH (data2_t::value_type &v, m_data2) {
    if (v.second!=NULL)
      delete v.second;
  }

  delete m_pLsnrs;

  MB_DPRINTLN("StyleMgr> m_data destructor OK.");
}

/////////////////////////

StyleList *StyleMgr::getCreateStyleList(qlib::uid_t nid)
{
  data2_t::const_iterator iter = m_data2.find(nid);
  if (iter==m_data2.end()) {
    StyleList *pNew = MB_NEW StyleList;
    m_data2.insert(data2_t::value_type(nid, pNew));
    return pNew;
  }

  return iter->second;
}

void StyleMgr::destroyContext(qlib::uid_t nid)
{
  if (nid == qlib::invalid_uid) return;
  
  data2_t::iterator iter = m_data2.find(nid);
  if (iter==m_data2.end()) {
    return;
  }
  StyleList *pSet = iter->second;
  m_data2.erase(iter);
  delete pSet;
}

//////////////////////////////////////////////////////////////////////////

void StyleMgr::addListener(StyleEventListener *pLsnr)
{
  // TO DO: listen for related styleset's event
  m_pLsnrs->add(pLsnr);
}

void StyleMgr::removeListener(StyleEventListener *pLsnr)
{
  m_pLsnrs->remove(pLsnr);
}

void StyleMgr::fireEvent(StyleEvent &ev)
{
  m_pLsnrs->replicaFire(ev);
}

LString StyleMgr::getStyleNamesJSON(qlib::uid_t nSceneID)
{
  LString rval = "[";

  StyleList *pSL = getCreateStyleList(nSceneID);
  MB_ASSERT(pSL!=NULL);

  bool bfirst = true;
  BOOST_FOREACH (StyleSetPtr pSet, *pSL) {
    LString elem = pSet->getStyleNamesJSON(false);
    if (elem.isEmpty()) continue;

    if (!bfirst)
      rval += ",";
    else
      bfirst = false;

    rval += elem;
  }

  rval += "]";
  return rval;
}

LString StyleMgr::getStyleSetsJSON(qlib::uid_t nSceneID)
{
  LString rval = "[";

  StyleList *pSL = getCreateStyleList(nSceneID);
  MB_ASSERT(pSL!=NULL);

  bool bfirst = true;
  BOOST_FOREACH (StyleSetPtr pSet, *pSL) {

    if (!bfirst)
      rval += ",";
    else
      bfirst = false;

    qlib::uid_t nSceneID = pSet->getContextID();
    qlib::uid_t nUID = pSet->getUID();
    LString src = pSet->getSource();
    LString name = pSet->getName();
    bool bModif = pSet->isModified();
    bool bReadOnly = pSet->isReadOnly();

    rval += "{\"name\":";
    rval += "\""+name.escapeQuots()+"\",";

    rval += "\"src\":";
    rval += "\""+src.escapeQuots()+"\",";

    rval += LString::format("\"scene_id\": %d, ", nSceneID);
    rval += LString::format("\"uid\": %d, ", nUID);
    rval += LString::format("\"modified\": %s, ", bModif?"true":"false");
    rval += LString::format("\"readonly\": %s}\n", bReadOnly?"true":"false");
  }

  rval += "]";
  return rval;
}

/*
StyleSetPtr StyleMgr::getStyleSetById(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID)
{
  StyleList *pSL = getCreateStyleList(nScopeID);

  BOOST_FOREACH(StyleSetPtr pSet, *pSL) {
    if (nStyleSetID==pSet->getUID())
      return pSet;
  }  

  return StyleSetPtr();
}
*/

