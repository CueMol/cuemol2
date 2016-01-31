// -*-Mode: C++;-*-
//
// Style sheet implementation in StyleMgr database
//
// $Id: StyleMgrStyleImpl.cpp,v 1.3 2011/04/17 06:16:17 rishitani Exp $

#include <common.h>

#include "StyleMgr.hpp"
#include "StyleSet.hpp"
#include "StyleSheet.hpp"
#include "StyleFile.hpp"
#include "StyleEditInfo.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/ObjectManager.hpp>
#include <qlib/PropSpec.hpp>
#include <gfx/NamedColor.hpp>
#include <qsys/SceneManager.hpp>

using namespace qsys;
using qlib::LDom2Node;

namespace {
  bool splitKeyName(const LString &keyname, LString &subkey, LString &trailkey)
  {
    int dpos = keyname.indexOf(".");

    if (dpos<0) {
      subkey = keyname;
      trailkey = "";
      return false;
    }
    else {
      subkey = keyname.substr(0, dpos);
      trailkey = keyname.substr(dpos+1);
      return true;
    }
  }
}

LDom2Node *StyleMgr::getStyleNodeImpl(const LString &aSetID,
                                      const LString &stylename,
                                      const LString &prop_names,
                                      qlib::uid_t ctxt,
                                      bool bCreate)
{
  StyleList *pSList = getCreateStyleList(ctxt);
  LDom2Node *pStyle=NULL, *pNode=NULL;
  MB_ASSERT(pSList!=NULL);

  // Search style set list from top to bottom
  BOOST_FOREACH (StyleSetPtr pStySet, *pSList) {
    const LString &setid = pStySet->getName();
    
    // Empty aSetID matches all style sets
    if (!aSetID.isEmpty() && !aSetID.equals(setid))
      continue;
    
    pStyle = pStySet->getData(StyleSet::makeStyleKey(stylename));
    if (pStyle==NULL) {
      if (!bCreate) {
        // The styleset pStySet does not contain style named "stylename".
        // --> search the next style sheet
        //MB_DPRINTLN("Style %s is not found in stylesheet %s",
        //stylename.c_str(), setid.c_str());
        continue;
      }
      else {
        // create a new empty style node named stylename
        pStyle = MB_NEW LDom2Node();
        pStyle->setTagName("style");
        pStySet->putData(StyleSet::makeStyleKey(stylename), pStyle);
        MB_DPRINTLN("New style %s is created in sheet %s",
                    stylename.c_str(), setid.c_str());
      }
    }

    // property name is not specified --> just returns the style
    if (prop_names.isEmpty())
      return pStyle;

    pNode = findStyleNodeByName(pStyle, prop_names, bCreate);
    if (pNode==NULL) {
      // the style pStyle does not contain style definition for "prop_names"
      // --> search next style set
      continue;
    }

    // style definition node for "stylename,prop_names" is found
    //MB_DPRINTLN("StyleNode for %s:%s is found in stylesheet %s",
    //stylename.c_str(), prop_names.c_str(), pStySet->getName().c_str());
    return pNode;
  }


  // fall-back to the global context search
  if (ctxt!=qlib::invalid_uid)
    return getStyleNodeImpl(aSetID, stylename, prop_names, qlib::invalid_uid, bCreate);

  // not found!!
  return NULL;
}

/// Find style's node from the style root node pSty
LDom2Node *StyleMgr::findStyleNodeByName(LDom2Node *pSty, const LString &keyname, bool bCreate)
{
  LString subkey;
  LString trailkey;

  splitKeyName(keyname, subkey, trailkey);
  
  // MB_DPRINTLN("find %s -> %s, %s", keyname.c_str(), subkey.c_str(), trailkey.c_str());

  LDom2Node *pChNode = pSty->findChild(subkey);
  if (pChNode==NULL) {
    // style node is not found.
    if (!bCreate) {
      //MB_DPRINTLN("subkey %s is not found.", subkey.c_str());
      return NULL;
    }
    else {
      pChNode = MB_NEW LDom2Node();
      pChNode->setTagName(subkey);
      pSty->appendChild(pChNode);
      MB_DPRINTLN("New Style Node created for %s", pChNode->getTagName().c_str());
    }
  }
  
  if (trailkey.isEmpty())
    // pChNode is style (leaf) node for keyname.
    return pChNode;

  // recursively search in the child nodes
  return findStyleNodeByName(pChNode, trailkey, bCreate);
}

//////////
// value

LString StyleMgr::getStyleValue(qlib::uid_t ctxt,
                                const LString &setid,
                                const LString &dotname)
{
  LString style_name;
  LString prop_names;
  if (!splitKeyName(dotname, style_name, prop_names)) {
    LString msg = LString::format("StyleMgr.getStyleValue> invalid key name: %s",dotname.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return LString();
  }

  LDom2Node *pNode = getStyleNodeImpl(setid, style_name, prop_names, ctxt, false);
  if (pNode==NULL)
    return LString();
  return pNode->getValue();
}
    
void StyleMgr::setStyleValue(qlib::uid_t ctxt,
                             const LString &setid,
                             const LString &dotname,
                             const LString &value)
{
  LString style_name;
  LString prop_names;
  if (!splitKeyName(dotname, style_name, prop_names)) {
    LString msg = LString::format("StyleMgr.setStyleValue> invalid key name: %s",dotname.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  LDom2Node *pNode = getStyleNodeImpl(setid, style_name, prop_names, ctxt, true);
  if (pNode==NULL) {
    MB_ASSERT(false);
    return;
  }
  pNode->setValue(value);

  // put the style-update event to the pending list
  m_pendEvts.insert(PendEventSet::value_type(ctxt, style_name));
}


//////////////////////////////////////////////////////////////////////////////
// Style manupilation methods for UI

qlib::uid_t StyleMgr::hasStyleSet(const LString &id, qlib::uid_t ctxt)
{
  StyleList *pSL = getCreateStyleList(ctxt);
  MB_ASSERT(pSL!=NULL);

  StyleSetPtr pSet = pSL->findSet(id);
  if (pSet.isnull())
    return qlib::invalid_uid;
  
  return pSet->getUID();
}

StyleSetPtr StyleMgr::createStyleSet(const LString &id, qlib::uid_t ctxt)
{
  if (hasStyleSet(id, ctxt)!=qlib::invalid_uid)
    return StyleSetPtr();
  
  StyleList *pSL = getCreateStyleList(ctxt);
  MB_ASSERT(pSL!=NULL);

  StyleSetPtr pSet = StyleSetPtr( MB_NEW StyleSet );
  pSet->setContextID(ctxt);
  pSet->setSource("");
  pSet->setName(id);

  // Register new style to the end of the style list
  pSL->push_back(pSet);

  ScenePtr pScene = SceneManager::getSceneS(ctxt);

  // Fire the SCE_STYLE_ADDED Event
  if (!pScene.isnull()) {
    MB_DPRINTLN("StyleMgr> Firing SCE_STYLE_ADDED event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_STYLE_ADDED);
    ev.setSource(ctxt);
    ev.setTarget(pSet->getUID());
    pScene->fireSceneEvent(ev);
  }

  // Record undo/redo info
  UndoUtil uu(ctxt);
  if (uu.isOK()) {
    StyleCreateEditInfo *pInfo = MB_NEW StyleCreateEditInfo();
    pInfo->setupCreate(ctxt, pSet, -1);
    uu.add(pInfo);
  }

  return pSet;
}

qlib::uid_t StyleMgr::createStyleSetScr(const LString &id, qlib::uid_t ctxt)
{
  StyleSetPtr pSet = createStyleSet(id, ctxt);
  if (pSet.isnull()) return qlib::invalid_uid;
  return pSet->getUID();
}

bool StyleMgr::registerStyleSet(StyleSetPtr pSet, int nbefore, qlib::uid_t ctxt)
{
  if (hasStyleSet(pSet->getName(), ctxt)!=qlib::invalid_uid)
    return false;
  
  StyleList *pSL = getCreateStyleList(ctxt);
  MB_ASSERT(pSL!=NULL);

  pSet->setContextID(ctxt);

  if (nbefore >= pSL->size() || nbefore<0)
    pSL->push_back(pSet);
  else {
    StyleList::iterator iter = pSL->begin();
    for (int i=0; i<nbefore; ++i)
      ++iter;
    pSL->insert(iter, pSet);
  }

  // Fire the SCE_STYLE_ADDED Event
  ScenePtr pScene = SceneManager::getSceneS(ctxt);
  if (!pScene.isnull()) {
    MB_DPRINTLN("StyleMgr.register> Firing SCE_STYLE_ADDED event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_STYLE_ADDED);
    ev.setSource(ctxt);
    ev.setTarget(pSet->getUID());
    pScene->fireSceneEvent(ev);
  }

  // setup event
  // put the style-update event to the pending list
  m_pendEvts.insert(PendEventSet::value_type(ctxt, ""));

  // Record undo/redo info
  UndoUtil uu(ctxt);
  if (uu.isOK()) {
    StyleCreateEditInfo *pInfo = MB_NEW StyleCreateEditInfo();
    pInfo->setupCreate(ctxt, pSet, nbefore);
    uu.add(pInfo);
  }

  return true;
}

bool StyleMgr::destroyStyleSet(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID)
{
  StyleList *pSL = getCreateStyleList(nScopeID);
  MB_ASSERT(pSL!=NULL);

  StyleList::iterator iter = pSL->begin();
  StyleList::iterator eiter = pSL->end();
  StyleSetPtr pSet = StyleSetPtr();
  int nbefore = 0;
  for (; iter!=eiter; ++iter, ++nbefore) {
    if (nStyleSetID==(*iter)->getUID()) {
      pSet = *iter;
      break;
    }
  }
  if (iter==eiter)
    return false;

  // Fire the SCE_STYLE_REMOVING Event, before removing the style
  ScenePtr pScene = SceneManager::getSceneS(nScopeID);
  if (!pScene.isnull()) {
    MB_DPRINTLN("StyleMgr> Firing SCE_STYLE_REMOVING event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_STYLE_REMOVING);
    ev.setSource(nScopeID);
    ev.setTarget(pSet->getUID());
    pScene->fireSceneEvent(ev);
  }

  pSL->erase(iter);
  
  // setup event
  // put the style-update event to the pending list
  m_pendEvts.insert(PendEventSet::value_type(nScopeID, ""));

  // Record undo/redo info
  UndoUtil uu(nScopeID);
  if (uu.isOK()) {
    StyleCreateEditInfo *pInfo = MB_NEW StyleCreateEditInfo();
    pInfo->setupDestroy(nScopeID, pSet, nbefore);
    uu.add(pInfo);
  }

  // delete pSet;

  return true;
}

bool StyleMgr::saveStyleSetToFile(qlib::uid_t nScopeID, qlib::uid_t nStyleSetID, const LString &path)
{
  StyleList *pSL = getCreateStyleList(nScopeID);
  MB_ASSERT(pSL!=NULL);

  StyleSetPtr pStyleSet = StyleSetPtr();
  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    if (pSet->getUID()==nStyleSetID) {
      pStyleSet = pSet;
      break;
    }
  }

  if (pStyleSet.isnull()) {
    LOG_DPRINT("SaveStyle> styleset (%d) not found\n", int(nStyleSetID));
    return false;
  }

  qlib::FileOutStream fos;
  try {
    fos.open(path);
  }
  catch (qlib::LException &e) {
    LOG_DPRINT("SaveStyle> cannot write file %s\n",path.c_str());
    LOG_DPRINT("SaveStyle>   (reason: %s)\n", e.getMsg().c_str());
    return false;
  }
    
  try {
    qlib::LDom2OutStream oos(fos);
    qlib::LDom2Tree tree("styles");
    
    qlib::LDom2Node *pNode = tree.top();
    pStyleSet->writeToDataNode(pNode);

    oos.write(&tree);
    //oos.close();
    fos.close();

    //tree.detach();
    //delete pIdNode;
  }
  catch (qlib::LException &e) {
    LOG_DPRINT("SaveStyle> cannot write file %s\n",path.c_str());
    LOG_DPRINT("SaveStyle>   (reason: %s)\n", e.getMsg().c_str());
    return false;
  }

  LString before = pStyleSet->getSource();

  if (before.equals(path))
    return true; // no change --> do nothing

  // convert to file-linked style
  pStyleSet->setSource(path);
  
  // Record undo/redo info
  UndoUtil uu(nScopeID);
  if (uu.isOK()) {
    StyleSrcEditInfo *pInfo = MB_NEW StyleSrcEditInfo();
    pInfo->setup(pStyleSet, before, path);
    uu.add(pInfo);
  }

  // Reset modified flag
  //  (because the content of this StyleSet is now synchronized with those in the file.)
  pStyleSet->setModified(false);

  return true;
}

qlib::uid_t StyleMgr::loadStyleSetFromFile(qlib::uid_t nScopeID, const LString &path, bool bReadOnly)
{
  StyleFile sfile;
  qlib::uid_t uid = sfile.loadFile(path, nScopeID);

  StyleSetPtr pSet = qlib::ensureNotNull( getStyleSetById2(uid) );
  pSet->setReadOnly(bReadOnly);

  // put the style-update event to the pending list
  m_pendEvts.insert(PendEventSet::value_type(nScopeID, ""));

  return uid;
}

StyleSetPtr StyleMgr::getStyleSetById2(qlib::uid_t nStyleSetID) const
{
  StyleSet *pRaw = qlib::ObjectManager::sGetObj<StyleSet>(nStyleSetID);

  /// create sp from raw ptr
  StyleSetPtr pSet = StyleSetPtr(pRaw);

  return pSet;
}

LString StyleMgr::getStyleSetSource(qlib::uid_t nStyleSetID) const
{
  StyleSetPtr pSet = getStyleSetById2(nStyleSetID);

  if (pSet.isnull()) {
    LString msg = LString::format("getStyleSetSource> invalid styleset ID: %d", int(nStyleSetID));
    MB_THROW(qlib::RuntimeException, msg);
    return LString();
  }

  return pSet->getSource();
}


////////////////////////////////////////////////////////////////
// event impl

void StyleMgr::firePendingEvents()
{
  BOOST_FOREACH (const PendEventSet::value_type &elem, m_pendEvts) {
    fireEventImpl(elem.first, elem.second);
  }

  clearPendingEvents();
}

void StyleMgr::fireEventImpl(qlib::uid_t uid, const LString &setname)
{
  if (setname.isEmpty() || setname.equals(">color")) {
    // color definition is (possibly) changed --> invalidate all named color cache data
    gfx::NamedColor::getResolver()->invalidateCache();
  }
  
  if (m_pLsnrs->isEmpty())
    return;
  
  int i, nsize = m_pLsnrs->getSize();
  std::vector<StyleEventListener *> cblist(nsize);
    
  if (m_pLsnrs->isLocked()) {
    MB_ASSERT(false);
    return;
  }

  {
    // make copy of listener list
    qlib::AutoEventCastLock lock(m_pLsnrs);
    StyleEventCaster::const_iterator iter = m_pLsnrs->begin();
    StyleEventCaster::const_iterator iend = m_pLsnrs->end();
    for (i=0 ; iter!=iend; iter++, i++)
      cblist[i] = iter->second;
  }

  StyleEvent ev;
  
  for (i=0; i<nsize; ++i) {
    StyleEventListener *pLsnr = cblist[i];
    qlib::uid_t nCtxtID = pLsnr->getStyleCtxtID();

    if (uid!=0 && uid!=nCtxtID)
      continue;

    // ">xxx" means non-style related event (color, sel, etc.)
    //   --> always fires styleChanged event!!
    if (!setname.isEmpty() && !setname.startsWith(">")) {
      StyleSheet *pSheet = pLsnr->getStyleSheet();
      if (!pSheet->contains(setname))
        continue;
    }

    pLsnr->styleChanged(ev);
  }

}

void StyleMgr::clearPendingEvents()
{
  m_pendEvts.clear();
}

bool StyleMgr::isModified(qlib::uid_t nSceneID) const
{
  StyleMgr *pthis = const_cast<StyleMgr *>(this);
  StyleList *pSList = pthis->getCreateStyleList(nSceneID);

  BOOST_FOREACH (StyleSetPtr pSet, *pSList) {
    if (pSet->isModified())
      return true;
  }

  return false;
}

void StyleMgr::createStyleFromObj(qlib::uid_t scene_uid, qlib::uid_t set_uid,
                                  const LString &name,
                                  const qlib::LScrSp<qlib::LScrObjBase> &pSObj)
{
  StyleSetPtr pSet = getStyleSetById2(set_uid);

  if (pSet.isnull()) {
    // TO DO: throw exception
    LOG_DPRINTLN("StyleMgr::createStyleFromObj> cannot create style set <%d>", set_uid);
    return;
  }

  LDom2Node *pNode = extractStyleNodeFromObj(scene_uid, pSObj.get(), 0, true);
  pNode->setTagName("style");

  // remove the type and name attributes,
  //  which should not be present in the style nodes
  bool res;
  res = pNode->removeChild("type");
  res = pNode->removeChild("name");

  pNode->appendStrAttr("type", "renderer");

  if (pSet->getStyleNode(name))
    pSet->removeStyleNode(name);
  
  pSet->putStyleNode(name, pNode);

  // fire event(s) to update the scene
  qlib::uid_t ctxt = pSet->getContextID();
  m_pendEvts.insert(PendEventSet::value_type(ctxt, name));
  firePendingEvents();
}

LDom2Node *StyleMgr::extractStyleNodeFromObj(qlib::uid_t ctxt,
                                             qlib::LScrObjBase *pSObj,
                                             int nLevel,
                                             bool bResolveStyle)
{
  LDom2Node *pNode = MB_NEW LDom2Node();
  
  std::set<LString> names;
  pSObj->getPropNames(names);

  BOOST_FOREACH (const LString &nm, names) {

    qlib::PropSpec spec;
    if (!pSObj->getPropSpecImpl(nm, &spec))
      continue;

    // Ignore prop with the nopersist attribute
    if (spec.bNoPersist)
      continue;

    // Ignore read-only array object
    // (In future, this impl should be modified to save array ??)
    if (spec.bReadOnly &&
        spec.type_name.equals("array")) {
      continue;
    }
    
    qlib::LVariant value;
    if (!pSObj->getProperty(nm, value))
      continue;
    if (value.isNull())
      continue;

    // handle object type property
    if (!value.isStrConv()) {
      if (spec.bReadOnly) {
        // nested object property
        qlib::LScrObjBase *pChObj = value.getObjectPtrT<qlib::LScrObjBase>();
        LDom2Node *pChNode = extractStyleNodeFromObj(ctxt, pChObj, nLevel+1, bResolveStyle);
        pChNode->setTagName(nm);
        pNode->appendChild(pChNode);
      }
      else {
        // polymorphic type property
        MB_DPRINTLN("Extract prop <%s>=(polymorphic obj)", nm.c_str());
        LDom2Node *pChNode = pNode->appendChild(nm);
        pChNode->setupByVariant(value);
      }
      continue;
    }

    // ignore readonly (non-obj) props
    if (spec.bReadOnly)
      continue;
    
    // ignore (non-obj) props without default values
    if (!spec.bHasDefault)
      continue;

    // check default flag
    if (pSObj->isPropDefault(nm)) {
      if (!bResolveStyle)
        continue;
      if (!StyleSheet::resolve3(nm, pSObj, value))
        continue;
      if (value.isNull())
        continue;
      MB_DPRINT("Style: ");
    }

    if (value.isStrConv()) {
      LString sval = value.toString();
      MB_DPRINTLN("Extract prop <%s>=%s", nm.c_str(), sval.c_str());
      LDom2Node *pChNode = pNode->appendChild(nm);
      pChNode->setupByVariant(value);
      continue;
    }
    else {
      LOG_DPRINTLN("ERROR!! non-strconv prop <%s> is ignored", nm.c_str());
    }

  } // for (; iter!=names.end(); ++iter) {

  return pNode;
}

