// -*-Mode: C++;-*-
//
// style manager impl (string data (selection, etc) related routines)
//

#include <common.h>

#include "StyleMgr.hpp"
#include "StyleSet.hpp"

#include <qsys/SysConfig.hpp>

using namespace qsys;
using qlib::LDom2Node;

LString StyleMgr::getStrImpl(const LString &key, qlib::uid_t nScopeID)
{
  StyleList *pSL = getCreateStyleList(nScopeID);

  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    LString rval;
    if (pSet->getString(key, rval)) {
      return rval;
    }
  }  

  // check global context
  if (nScopeID!=qlib::invalid_uid)
    return getStrImpl(key, qlib::invalid_uid);
  
  // not found
  return LString();
}

LString StyleMgr::getConfig(const LString &cfg_id, const LString &rend_type)
{
  // LString key = cfg_id+DELIM+rend_type+DELIM+"cfg";
  LString key = StyleSet::makeStrDataKey("cfg", rend_type, cfg_id);
  return getStrImpl(key, getContextID());
}

LString StyleMgr::getStrData(const LString &cat, const LString &key, qlib::uid_t nScopeID)
{
  // LString ckey = key + DELIM + "string" +DELIM + cat;
  LString ckey = StyleSet::makeStrDataKey("string", cat, key);
  return getStrImpl(ckey, nScopeID);
}

int StyleMgr::getMultiPath(const LString &akey, qlib::uid_t nScopeID, std::list<LString> &ls)
{
  // LString ckey = StyleSet::makeStrDataKey("string", "path", akey);
  int nret = 0;

  StyleList *pSL = getCreateStyleList(nScopeID);

  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    LString rval = pSet->getPath(akey);
    if (!rval.isEmpty()) {
      ls.push_back(rval);
      ++nret;
    }
  }  

  // check global context
  if (nScopeID!=qlib::invalid_uid) {
    nret += getMultiPath(akey, qlib::invalid_uid, ls);
  }
  
  return nret;
}


// TO DO: remove impl (use StyleSet method)
LString StyleMgr::getStrData(const LString &cat, const LString &key,
                             qlib::uid_t nScopeID,
                             qlib::uid_t nStyleSetID)
{
  LString rval;

  LString ckey = StyleSet::makeStrDataKey("string", cat, key);
  StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);

  if (pTgtSet.isnull()) {
    LString msg = LString::format("StyleMgr.getStrData> invalid setID: %d", nStyleSetID);
    MB_THROW(qlib::RuntimeException, msg);
    return rval;
  }

  if (!pTgtSet->getString(ckey, rval))
    return LString(); // not found

  return rval;
}

// TO DO: remove impl (use StyleSet method)
bool StyleMgr::setStrData(const LString &cat, const LString &key,
                          const LString &value,
                          qlib::uid_t nScopeID,
                          qlib::uid_t nStyleSetID)
{
  LString ckey = StyleSet::makeStrDataKey("string", cat, key);
  StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);

  if (pTgtSet.isnull()) {
    LString msg = LString::format("StyleMgr.setStrData> invalid setID: %d", nStyleSetID);
    MB_THROW(qlib::RuntimeException, msg);
    return false;
  }

  bool res = pTgtSet->setString(ckey, value);

  // set to the pending event list
  m_pendEvts.insert(PendEventSet::value_type(nScopeID, ""));

  return res;
}

// TO DO: remove impl (use StyleSet method)
bool StyleMgr::removeStrData(const LString &cat, const LString &key,
                             qlib::uid_t nScopeID, qlib::uid_t nStyleSetID)
{
  LString ckey = StyleSet::makeStrDataKey("string", cat, key);
  StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);

  if (pTgtSet.isnull()) {
    LString msg = LString::format("StyleMgr.removeStrData> invalid setID: %d", nStyleSetID);
    MB_THROW(qlib::RuntimeException, msg);
    return false;
  }

  bool res = pTgtSet->removeString(ckey);

  // set to the pending event list
  m_pendEvts.insert(PendEventSet::value_type(nScopeID, ""));

  return res;
}

LString StyleMgr::getStrDataDefsJSON(const LString &cat,
                                     qlib::uid_t nScopeID,
                                     qlib::uid_t nStyleSetID /*= qlib::invalid_uid*/)
{
  LString rval = "[";

  if (nStyleSetID!=qlib::invalid_uid) {
    StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);
    if (pTgtSet.isnull()) {
      LString msg = LString::format("StyleMgr.getStrDataDefsJSON> invalid setID: %d", nStyleSetID);
      MB_THROW(qlib::RuntimeException, msg);
      return LString();
    }
    rval += pTgtSet->getStrDataNamesJSON("string", cat, false);
  }
  else {
    StyleList *pSL = getCreateStyleList(nScopeID);
    bool bfirst = true;
    BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
      LString elem = pSet->getStrDataNamesJSON("string", cat, false);
      if (elem.isEmpty())
        continue;
      
      if (!bfirst)
        rval += ",";
      else
        bfirst = false;
      
      rval += elem;
    }
  }

  rval += "]";
  return rval;
}

