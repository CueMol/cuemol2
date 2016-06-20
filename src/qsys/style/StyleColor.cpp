// -*-Mode: C++;-*-
//
// style manager impl (color/material related routines)
//

#include <common.h>

#include "StyleMgr.hpp"
#include "StyleSet.hpp"
#include "StyleFile.hpp"
#include "StyleSupports.hpp"

#include <gfx/SolidColor.hpp>
#include <gfx/NamedColor.hpp>

using namespace qsys;

using qlib::LDom2Node;
using gfx::SolidColor;
using gfx::SolidColorPtr;
using gfx::AbstractColor;
using gfx::NamedColor;

//////////
// color operations

ColorPtr StyleMgr::getColor(const LString &rkey)
{
  return getColor(rkey, getContextID());
}

ColorPtr StyleMgr::getColor(const LString &rkey, qlib::uid_t nScopeID)
{
  StyleList *pSL = getCreateStyleList(nScopeID);

  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    ColorPtr rval;
    if (pSet->getColor(rkey, rval)) {
      return rval;
    }
  }  

  // check global context
  if (nScopeID!=qlib::invalid_uid)
    return getColor(rkey, qlib::invalid_uid);
  
  // not found
  return ColorPtr();
}

ColorPtr StyleMgr::getColor(const LString &key,
                            qlib::uid_t nScopeID,
                            qlib::uid_t nStyleSetID)
{
  ColorPtr rval;
  StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);

  if (pTgtSet.isnull()) {
    LString msg = LString::format("StyleMgr.getColor> invalid setID: %d", nStyleSetID);
    MB_THROW(qlib::RuntimeException, msg);
    return rval;
  }

  if (pTgtSet->getColor(key, rval))
    return rval;

  // ERROR ??
  return rval;
}

bool StyleMgr::setColor(const LString &key,
                        const ColorPtr &color,
                        qlib::uid_t nScopeID,
                        qlib::uid_t nStyleSetID)
{
  StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);

  if (pTgtSet.isnull()) {
    LString msg = LString::format("StyleMgr.setColor> invalid setID: %d", nStyleSetID);
    MB_THROW(qlib::RuntimeException, msg);
    return false;
  }

  bool res = pTgtSet->setColor(key, color);

  // set to the pending event list
  m_pendEvts.insert(PendEventSet::value_type(nScopeID, ">color"));

  return res;
}

bool StyleMgr::removeColor(const LString &key, qlib::uid_t nScopeID, qlib::uid_t nStyleSetID)
{
  StyleSetPtr pTgtSet = getStyleSetById(nScopeID, nStyleSetID);

  if (pTgtSet.isnull()) {
    LString msg = LString::format("StyleMgr.removeColor> invalid setID: %d", nStyleSetID);
    MB_THROW(qlib::RuntimeException, msg);
    return false;
  }

  bool res = pTgtSet->removeColor(key);

  // set to the pending event list
  m_pendEvts.insert(PendEventSet::value_type(nScopeID, ">color"));

  return res;
}

ColorPtr StyleMgr::compileColor(const LString &rep, qlib::uid_t nScopeID)
{
  ColorPtr rval;
  pushContextID(nScopeID);

  try {
    rval = ColorPtr(AbstractColor::fromStringS(rep));
  }
  catch (...) {
    popContextID();
    throw;
  }

  popContextID();
  return rval;
}

LString StyleMgr::getColorDefsJSON(qlib::uid_t nScopeID,
                                   qlib::uid_t nStyleSetID /*= qlib::invalid_uid*/)
{
  StyleList *pSL = getCreateStyleList(nScopeID);

  LString rval = "[";

  bool bfirst = true;
  BOOST_FOREACH(StyleSetPtr pSet, *pSL) {
    if (nStyleSetID!=qlib::invalid_uid) {
      if (nStyleSetID!=pSet->getUID())
        continue; // skip non-target stylesets
    }

    LString str = pSet->getColorDefsJSON(false);
    if (str.isEmpty())
      continue;

    if (!bfirst)
      rval += ",";
    else
      bfirst = false;

    rval += str;

    /*
    StyleSet::coldata_iterator iter = pSet->colBegin();
    StyleSet::coldata_iterator eiter = pSet->colEnd();
    for (; iter!=eiter; ++iter) {
      const LString &fkey = iter->first;
  
      if (!bfirst)
        rval += ",";
      else
        bfirst = false;

      rval += "\""+fkey.escapeQuots()+"\"";
    }*/
  }  

  rval += "]";
  return rval;
}

//////////////////////////////////////////////////
// Material operations
/*
Material *StyleMgr::getMaterial(const LString &mat_id, qlib::uid_t nScopeID)
{
  StyleList *pSL = getCreateStyleList(nScopeID);

  Material *pMat;
  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    pMat = pSet->getMaterial(mat_id);
    if (pMat!=NULL)
      return pMat;
  }  

  // check global context
  if (nScopeID!=qlib::invalid_uid)
    return getMaterial(mat_id, qlib::invalid_uid);
  
  // not found
  return NULL;
}*/

Material *StyleMgr::getMaterialImpl(const LString &mat_id, const LString &rend_type, int nType, qlib::uid_t nScopeID)
{
  StyleList *pSL = getCreateStyleList(nScopeID);
  bool bSys;
  if (rend_type.isEmpty() && nType>=0)
    bSys = true;
  else
    bSys = false;

  Material *pMat;
  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    pMat = pSet->getMaterial(mat_id);
    if (pMat!=NULL) {
      if (bSys) {
        if (pMat->hasSysValue(nType))
          return pMat;
      }
      else {
        if (pMat->hasDepValue(rend_type))
          return pMat;
      }
    }
  }  

  // check global context
  if (nScopeID!=qlib::invalid_uid)
    return getMaterialImpl(mat_id, rend_type, nType, qlib::invalid_uid);
  
  // not found
  return NULL;
}

LString StyleMgr::getMaterial(const LString &mat_id, const LString &rend_type)
{
  Material *pMat = getMaterialImpl(mat_id, rend_type, -1, getContextID());
  if (pMat==NULL)
    return LString();
  
  return pMat->getDepValue(rend_type);
}

double StyleMgr::getMaterial(const LString &mat_id, int nType)
{
  Material *pMat = getMaterialImpl(mat_id, LString(), nType, getContextID());
  if (pMat==NULL)
    return -1.0;
  
  return pMat->getSysValue(nType);
}

LString StyleMgr::getMaterialNamesJSON(qlib::uid_t nScopeID,
                                      qlib::uid_t nStyleSetID /*= qlib::invalid_uid*/)
{
  StyleList *pSL = getCreateStyleList(nScopeID);

  LString rval = "[";

  bool bfirst = true;
  BOOST_FOREACH(StyleSetPtr pSet, *pSL) {
    if (nStyleSetID!=qlib::invalid_uid) {
      if (nStyleSetID!=pSet->getUID())
        continue; // skip non-target stylesets
    }

    LString str = pSet->getMaterialNamesJSON(false);
    if (str.isEmpty())
      continue; // no material defs in this set, skip

    if (!bfirst)
      rval += ",";
    else
      bfirst = false;

    rval += str;

    /*
    StyleSet::matdata_iterator iter = pSet->matBegin();
    StyleSet::matdata_iterator eiter = pSet->matEnd();
    for (; iter!=eiter; ++iter) {
      const LString &fkey = iter->first;
  
      if (!bfirst)
        rval += ",";
      else
        bfirst = false;

      rval += "\""+fkey.escapeQuots()+"\"";
    }*/
  }  

  rval += "]";
  return rval;
}
