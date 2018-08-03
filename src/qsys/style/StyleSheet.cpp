// -*-Mode: C++;-*-
//
// Style sheet implementation
//
// $Id: StyleSheet.cpp,v 1.7 2011/05/02 12:42:55 rishitani Exp $

#include <common.h>

#include "StyleSheet.hpp"
#include "StyleSupports.hpp"
#include "StyleMgr.hpp"

#include <qlib/LDOM2Stream.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/PropSpec.hpp>
#include <qlib/LPropEvent.hpp>
#include <qlib/ObjectManager.hpp>
#include <qlib/LRegExpr.hpp>
#include <qlib/LExceptions.hpp>

using namespace qsys;
using qlib::LDom2Node;
using qlib::LVariant;
using qlib::LScriptable;
using qlib::LRegExpr;

void StyleSheet::setStyleNames(const LString &s)
{
  m_styl.clear();
  if (s.isEmpty())
    return;

  std::list<LString> ls;
  s.split(',', ls);

  BOOST_FOREACH(LString &str, ls) {
    //str = str.trim();
    m_styl.push_front(str.trim());
  }

  //m_styl = ls;

  //////////
  // TO DO: check the validity of the style sheet names in m_styl
  /*
  StyleMgr *pSM = StyleMgr::getInstance();
  BOOST_REVERSE_FOREACH(const LString &nm, m_styl) {
    LDom2Node *pSty = pSM->getStyleNode(nm, m_nScopeID);
  }
   */
}

LString StyleSheet::getStyleNames() const
{
  if (m_styl.empty())
    return LString();

  std::list<LString> ls = m_styl;
  std::reverse(ls.begin(), ls.end());

  return LString::join(",", ls);
}

void StyleSheet::applyStyle(qlib::LScriptable *pthat)
{
  // Applies this style sheet to the object pthat.
  // Pushing context is required here, because resolving style sheet
  // may invoke conversion of color names to color objects.
  StyleMgr *pSM = StyleMgr::getInstance();
  pSM->pushContextID(m_nScopeID);
  try {
    applyStyleHelper(LString(), pthat);
  }
  catch (...) {
    pSM->popContextID();
    throw;
  }
  pSM->popContextID();
}

void StyleSheet::applyStyleHelper(const LString &parent_name, LScriptable *pthat)
{
  LVariant variant;

  std::set<LString> nameset;
  pthat->getPropNames(nameset);
  qlib::PropSpec spec;

  BOOST_FOREACH(const LString &key, nameset) {

    try {
      // Get the property's spec description
      if (!pthat->getPropSpecImpl(key, &spec)) {
        // TO DO: throw exception ??
        MB_DPRINTLN("StyleSheet::applyStyle>"
                    "Fatal error, prop %s is not found", key.c_str());
        continue;
      }

      if (!pthat->getProperty(key, variant)) {
        // TO DO: throw exception ??
        MB_DPRINTLN("StyleSheet::applyStyle>"
                    "Fatal error, prop %s is not found", key.c_str());
        continue;
      }
    }
    catch (qlib::LException &e) {
      MB_DPRINTLN("applyStyle> Exception occured in getProp for %s: %s (skipped)",
                  key.c_str(), e.getFmtMsg().c_str());
      continue;
    }
    
    LString nested_name;
    if (parent_name.isEmpty())
      nested_name = key;
    else
      nested_name = parent_name + "." + key;

    //////////////////////////////

    bool bLeaf = false;
    if (variant.isObject()) {
      if (variant.isStrConv())
        bLeaf = true;
    }
    else if (variant.isNull()) {
      // Property's value is NULL.
      // There is posibility that property is NULL node object.
      //bLeaf = false;
    }
    else
      bLeaf = true;

    //////////////////////////////

    if (bLeaf) {
      //
      // Apply style's value to the leaf property
      //

      if (spec.bReadOnly) {
        // We cannot apply styles to the read-only properties.
        continue;
      }

      if (!pthat->isPropDefault(key)) {
        // Property is overwritten by user value
        continue;
      }

      // resolve style sheet
      if (!resolveStyleSheet2(nested_name, variant)) {
        // MB_DPRINTLN("no stylesheet value for %s", nested_name.c_str());
        // No stylesheet value --> reset to the qif-defined default value
        pthat->resetPropertyImpl(key);
        continue;
      }

      // set style's value to the property
      //MB_DPRINTLN("Set stylesheet value for %s", nested_name.c_str());
      pthat->setPropertyImpl(key, variant);

      // TO DO: notify changes (of styles and default values)
      continue;
    }

    //////////////////////////////
    //
    // Node property
    //

    // variant should be object
    LScriptable *pChObj = NULL;
    if (variant.isObject())
      pChObj = variant.getObjectPtr();

    if (spec.bReadOnly) {
      // Read-only Node property
      // Readonly node prop shuould not be null
      if (pChObj==NULL) {
        LOG_DPRINTLN("StyleSheet::applyStyle> Error: cannot get object");
        continue;
      }
      applyStyleHelper(nested_name, pChObj);
      continue;
    }
    else {
      // Writable Node property -> replace with style values if required

      if (!pthat->isPropDefault(key)) {
        // Property has been overwritten by user value
        continue;
      }

      // XX current impl: Always relpace with the new style value,
      //   regardless to the class/type of the prop
      /*
      LString nam1;
      qlib::LClass *pClass = pChObj->getClassObj();
      if (pClass!=NULL)
        nam1 = pClass->getClassName();
      LString nam2 = pNode->getTypeName();
      if (nam1.equals(nam2)) {
        // the same classes: overwrite as like as the readonly props
        applyStyleHelper(nested_name, pChObj);
        continue;
      }
      // different classes: replace all values
       */

      LDom2Node *pNode = resolveStyleSheet(nested_name);
      if (pNode==NULL) {
        //MB_DPRINTLN("no stylesheet value for %s", nested_name.c_str());
        // No stylesheet value --> reset to the qif-defined default value
        pthat->resetPropertyImpl(key);
        continue;
      }

      if (!pNode->convToVariant(variant)) {
        MB_DPRINTLN("cannot conv to variant for node %s", nested_name.c_str());
        continue;
      }

      //MB_DPRINTLN("Set stylesheet value for %s", nested_name.c_str());
      pthat->setPropertyImpl(key, variant);

      // TO DO: notify changes (of styles and default values)
      continue;
    }
  }

}

/// Resolve style sheet for keyname, and convert to the variant
bool StyleSheet::resolveStyleSheet2(const LString &keyname, qlib::LVariant &variant)
{
  qlib::LDom2Node *pNode = resolveStyleSheet(keyname);
  if (pNode==NULL) return false;
  return pNode->convToVariant(variant);
}

/// Resolve style sheet for keyname, and returns LDom2Node object
LDom2Node *StyleSheet::resolveStyleSheet(const LString &keyname)
{
  if (m_styl.empty()) return NULL;

  StyleMgr *pMgr = StyleMgr::getInstance();
  LDom2Node *pNode = NULL;
  LString style_name;

  // Check the style sheet name list, from the last to the first.
  BOOST_FOREACH(const LString &style_name, m_styl) {
    //LString dotname = style_name + "." + keyname;
    //MB_DPRINTLN("ResolveSS> Search style node for dotname=%s", dotname.c_str());
    pNode = pMgr->getStyleNode2(style_name, keyname, m_nScopeID);
    if (pNode!=NULL)
      break;
  }

  if (pNode==NULL) {
    // style def is not found (should be ignored)
    //MB_DPRINTLN("ResolveSS> style node for name=%s not found", keyname.c_str());
  }

  //MB_DPRINTLN("");
  return pNode;
}

bool StyleSheet::removeByRe(const LString &regex)
{
  if (m_styl.empty())
    return false;

  qlib::LRegExpr re(regex);

  data_t::iterator iter = m_styl.begin();
  data_t::iterator eiter = m_styl.end();

  int nremove = 0;
  for (; iter!=eiter; ) {
    const LString &name = *iter;
    if (re.match(name)) {
      iter = m_styl.erase(iter);
      // eiter is invalidated by erase()
      //   --> should be updated.
      eiter = m_styl.end();
      ++nremove;
    }
    else
      ++iter;
  }

  return (nremove>0);
}

//static
bool StyleSheet::resolve3(const LString &propnm, qlib::LScrObjBase *pThat, qlib::LVariant &variant)
{
  StyleSheet *pSS;
  StyleSupports *pRoot = NULL;

  LString nested_name = propnm;
  qlib::uid_t rootuid = pThat->getRootUID();
  LString thisname = pThat->getThisName();

  if (rootuid!=qlib::invalid_uid) {
    pRoot = qlib::ensureNotNull(qlib::ObjectManager::sGetObj<StyleSupports>(rootuid));
    if (!thisname.isEmpty())
      nested_name = thisname + "." + propnm;
  }
  else {
    pRoot = qlib::ensureNotNull(dynamic_cast<StyleSupports*>(pThat));
  }

  pSS = pRoot->getStyleSheet();

  return pSS->resolveStyleSheet2(nested_name, variant);
}

