// -*-Mode: C++;-*-
//
// Object: base class of data object
//
// $Id: Object.cpp,v 1.42 2011/03/31 14:19:15 rishitani Exp $
//

#include <common.h>

#include "Object.hpp"
#include <qlib/LDOM2Stream.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/ClassRegistry.hpp>

#include "SceneManager.hpp"
#include "SceneEvent.hpp"
#include "ScrEventManager.hpp"
#include "ObjLoadEditInfo.hpp"
#include "ObjExtData.hpp"
#include "RendererFactory.hpp"
#include "UndoManager.hpp"
#include "PropEditInfo.hpp"
#include "StreamManager.hpp"
#include "ObjReader.hpp"
#include "RendGroup.hpp"

#include "style/AutoStyleCtxt.hpp"
#include "style/StyleMgr.hpp"

using namespace qsys;

Object::Object()
{
  m_pReaderOpts = NULL;

  m_uid = qlib::ObjectManager::sRegObj(this);
  m_bVisible = true;
  m_bLocked = false;
  m_bModified = false;

  m_nSceneID = qlib::invalid_uid;
  m_bUICollapsed = false;
  m_nUIOrder = m_uid;

  m_pEvtCaster = MB_NEW ObjectEventCaster;
  addPropListener(this);

  MB_DPRINTLN("Object (%p/%d) created\n", this, m_uid);

}

Object::~Object()
{
  MB_DPRINTLN("Object(%p/%d/%s) destructed\n", this, m_uid, m_name.c_str());
  delete m_pEvtCaster;
  qlib::ObjectManager::sUnregObj(m_uid);

  if (m_pReaderOpts!=NULL)
    delete m_pReaderOpts;
}

//////////

void Object::unloading()
{
}

LString Object::toString() const
{
  return LString::format("Object(name=%s, UID=%d)",m_name.c_str(), getUID());
}

void Object::dump() const
{
  ScenePtr rscn = getScene();

  MB_DPRINT("Object: %s", toString().c_str());
  MB_DPRINT(": {");

  RendIter iter = beginRend();
  for (; iter!=endRend(); ++iter) {
    RendererPtr rrend = iter->second;
    if (!rrend.isnull()) {
      MB_DPRINT("rend %p/%d (nref=%d): ", rrend.get(), rrend->getUID(), rrend.use_count());
      //rrend->dump();
    }
    else {
      MB_DPRINTLN("(invalid rend %d)", iter->first);
    }
  }
  
  MB_DPRINTLN("}");
}

ScenePtr Object::getScene() const
{
  return SceneManager::getSceneS(m_nSceneID);
}

////////////////////////////////////////////////

RendererPtr Object::createRenderer(const LString &type_name)
{
  RendererFactory *pRF = RendererFactory::getInstance();
  RendererPtr pRend = pRF->create(type_name);

  registerRendererImpl(pRend);

  //MB_DPRINTLN("createRenderer clientObjID=%d OK", (int)pRend->getClientObjID());
  return pRend;
}

void Object::attachRenderer(const RendererPtr &pRend)
{
  if (pRend->getClientObjID()!=qlib::invalid_uid) {
    // Error !! object is already attached to another object!!
    LOG_DPRINTLN("ERROR !! Renderer already attached");
    LString msg = LString::format("Renderer already attached %s", pRend->getName().c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  //MB_DPRINTLN("attachRenderer clientObjID=%d", (int)pRend->getClientObjID());
  registerRendererImpl(pRend);

  // update stylesheet settings
  pRend->reapplyStyle();
  
}

RendererPtr Object::getRenderer(qlib::uid_t uid) const
{
  rendtab_t::const_iterator i = m_rendtab.find(uid);
  if (i==m_rendtab.end())
    return RendererPtr();

  return i->second;
}

RendererPtr Object::getRendByName(const LString &name)
{
  rendtab_t::const_iterator i = m_rendtab.begin();
  rendtab_t::const_iterator e = m_rendtab.end();
  for (; i!=e; ++i) {
    if ( name.equals(i->second->getName()) )
      return i->second;
  }

  return RendererPtr();
}

RendererPtr Object::getRendByName(const LString &name, const LString &type)
{
  rendtab_t::const_iterator i = m_rendtab.begin();
  rendtab_t::const_iterator e = m_rendtab.end();
  for (; i!=e; ++i) {
    if ( name.equals(i->second->getName()) &&
         type.equals(i->second->getTypeName()))
      return i->second;
  }
  
  return RendererPtr();
}

RendererPtr Object::getRendererByType(const LString &type_name)
{
  rendtab_t::const_iterator i = m_rendtab.begin();
  rendtab_t::const_iterator e = m_rendtab.end();
  for (; i!=e; ++i) {
    if ( type_name.equals(i->second->getTypeName()) )
      return i->second;
  }

  return RendererPtr();
}

RendererPtr Object::getRendererByIndex(int ind)
{
  rendtab_t::const_iterator i = m_rendtab.begin();
  while (ind>0) {
    ++i;
    --ind;
  }
  if (i!=m_rendtab.end())
    return i->second;

  return RendererPtr();
}

bool Object::destroyRenderer(qlib::uid_t uid)
{
  // get renderer ptr/check consistency
  rendtab_t::iterator i = m_rendtab.find(uid);
  if (i==m_rendtab.end())
    return false;

  RendererPtr pRend = i->second;
  ScenePtr pScene = getScene();

  if (pScene.isnull() || pRend.isnull()) {
    LOG_DPRINTLN("Object::destroyRenderer> fatal error pScene or pRend is NULL!");
    return false;
  }

  // detach renderer from the view-related resources (DL, VBO, etc)
  pRend->unloading();

  // Detach the parent scene from the renderer event source
  pRend->removeListener(pScene.get());

  // Fire the SCE_REND_REMOVING Event, before removing the renderer
  {
    MB_DPRINTLN("Object> Firing SCE_REND_REMOVING event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_REND_REMOVING);
    ev.setSource(getSceneID());
    ev.setTarget(pRend->getUID());
    pScene->fireSceneEvent(ev);
  }

  // remove the rend from the scene's cache list
  pScene->removeRendCache(pRend);

  // 2012/9/30
  // Detach the rend from obj HERE is very important!!
  // (This call remove the rend from object's event listener list.
  //  Otherwise, deleted ptr will remain in the listener list, and thus cause crash!!)
  qlib::uid_t objid = pRend->detachObj();
  // MB_ASSERT(objid==this->m_uid);
  
  // 2012/9/30
  // Setting scene ID to null will cause removing pRend from the scene's listener list
  // (Without this, deleted ptr will remain in scene's listener list, after clearing the UNDO data!!)
  pRend->setSceneID(qlib::invalid_uid);

  // Remove from the renderer table
  m_rendtab.erase(i);

  // Record undo/redo info
  UndoManager *pUM = pScene->getUndoMgr();
  if (pUM->isOK()) {
    ObjLoadEditInfo *pPEI = MB_NEW ObjLoadEditInfo;
    pPEI->setupRendDestroy(getUID(), pRend);
    pUM->addEditInfo(pPEI);
  }

  return true;
}

LString Object::searchCompatibleRendererNames()
{
  LString ret;
  RendererFactory *pRF = RendererFactory::getInstance();
  std::list<LString> ls;
  int n = pRF->searchCompatibleRenderers(ObjectPtr(this), ls);
  if (n==0)
    return LString();
  return LString::join(",", ls);
}

void Object::registerRendererImpl(RendererPtr rrend)
{
  bool res = m_rendtab.insert(rendtab_t::value_type(rrend->getUID(), rrend)).second;
  if (!res) {
    // Error !! cannot register renderer.
    LOG_DPRINTLN("ERROR !! cannot register renderer");
    const char *type_name = rrend->getTypeName();
    LString msg = LString::format("Cannot register renderer %s", type_name);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  rrend->setSceneID(getSceneID());
  rrend->attachObj(this->m_uid);

  ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    // scene is not available (not initialized??)
    // --> skip scene related tasks
    return;
  }
  
  // add the new rend to the scene's cache list
  pScene->addRendCache(rrend);
  
  // The scene observes events from the new renderer
  //rrend->addPropListener(pScene.get());
  rrend->addListener(pScene.get());

  // Fire the SCE_REND_ADDED Event
  {
    MB_DPRINTLN("Object> Firing SCE_REND_ADDED event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_REND_ADDED);
    ev.setSource(getSceneID());
    ev.setTarget(rrend->getUID());
    pScene->fireSceneEvent(ev);
  }
  
  // Record undo/redo info
  UndoManager *pUM = pScene->getUndoMgr();
  if (pUM->isOK()) {
    ObjLoadEditInfo *pPEI = MB_NEW ObjLoadEditInfo;
    pPEI->setupRendCreate(getUID(), rrend);
    pUM->addEditInfo(pPEI);
  }

  return;
}

LString Object::getRendUIDList() const
{
  LString rval;
  if (m_rendtab.empty())
    return rval;
  
  qlib::UIDList uids;
  getRendUIDs(uids);

  bool bFirst = true;
  BOOST_FOREACH (qlib::uid_t i, uids) {
    if (!bFirst)
      rval += ",";
    rval += LString::format("%d", i);
    bFirst = false;
  }

  return rval;
}

namespace {
  bool rendsort_less(const RendererPtr &pObj1, const RendererPtr &pObj2)
  {
    return (pObj1->getUIOrder()) < (pObj2->getUIOrder());
  }
}

int Object::getRendUIDs(qlib::UIDList &uids) const
{
  if (m_rendtab.empty())
    return 0;
  
  // sort by ui_order
  std::vector<RendererPtr> tmpvec;
  {
    BOOST_FOREACH (const rendtab_t::value_type &i, m_rendtab) {
      tmpvec.push_back(i.second);
    }
    std::sort(tmpvec.begin(), tmpvec.end(), rendsort_less);
  }

  int nret = 0;
  BOOST_FOREACH (const RendererPtr &i, tmpvec) {
    uids.push_back(i->getUID());
    ++nret;
  }
  return nret;
}

/*qlib::LVarArray Object::getRendArray() const
{
  qlib::LVarArray rval;
  if (m_rendtab.empty())
    return rval;
  
  rval.allocate(m_rendtab.size());

  rendtab_t::const_iterator i = m_rendtab.begin();
  rendtab_t::const_iterator end = m_rendtab.end();
  for (int j=0; i!=end; ++i, ++j) {
    RendererPtr pObj = i->second;
    rval.setObjectPtr(j, pObj.copy());
  }

  return rval;
}*/

LString getRendDataJSON(RendererPtr pRend)
{
  LString rval;
  rval += "\"name\":\""+(pRend->getName())+"\", ";
  rval += "\"type\":\""+LString(pRend->getTypeName())+"\", ";
  rval += LString::format("\"ui_order\": %d, ", pRend->getUIOrder());
  rval += LString("\"visible\": ") + LString::fromBool(pRend->isVisible()) + ", ";
  rval += LString("\"locked\": ") + LString::fromBool(pRend->isUILocked()) + ", ";

  RendGroupPtr pGrp(pRend, qlib::no_throw_tag());
  if (!pGrp.isnull()) {
    MB_DPRINTLN("RendGrp %s : ui_collapsed=%d", pGrp->getName().c_str(), pGrp->isUICollapsed());
    rval += LString("\"ui_collapsed\": ") +
      LString::fromBool(pGrp->isUICollapsed()) +
      ", ";
  }
  rval += LString::format("\"ID\": %d", pRend->getUID());
  return rval;
}

LString Object::getFlatRendListJSON() const
{
  LString rval = "[";

  qlib::UIDList rend_uids;
  getRendUIDs(rend_uids);
  bool bfirst=true;
  BOOST_FOREACH (qlib::uid_t rendid, rend_uids) {
    
    RendererPtr pRend = getRenderer(rendid);
    
    if (!RendGroupPtr(pRend, qlib::no_throw_tag()).isnull())
      continue; // Ignore groups
    
    if (!bfirst)
      rval += ",\n";
    
    rval += "{";
    rval += getRendDataJSON(pRend);
    rval += "}";

    bfirst = false;
  }

  rval += "]";

  // MB_DPRINTLN("Obj.getRendListJSON> built JSON=%s", rval.c_str());
  return rval;
}

LString Object::getGroupedRendListJSON() const
{
  LString rval = "[";

  qlib::UIDList rend_uids;
  getRendUIDs(rend_uids);
  bool bfirst=true;
  BOOST_FOREACH (qlib::uid_t rendid, rend_uids) {
    
    RendererPtr pRend = getRenderer(rendid);
    if (!pRend->getGroupName().isEmpty())
      continue; // --> skip rends in group
    RendGroupPtr pGrp(pRend, qlib::no_throw_tag());
    LString grpname;
    if (!pGrp.isnull()) {
      grpname = pGrp->getName();
    }
    
    if (!bfirst)
      rval += ",\n";
    
    rval += "{";
    rval += getRendDataJSON(pRend);
    if (!grpname.isEmpty()) 
      rval += ",\n\"childNodes\":"+(getFilteredRendListJSON(grpname))+"\n";
    rval += "}";

    bfirst = false;
  }

  rval += "]";

  return rval;
}

LString Object::getFilteredRendListJSON(const LString &grpfilt) const
{
  LString rval = "[";

  qlib::UIDList rend_uids;
  getRendUIDs(rend_uids);
  bool bfirst=true;
  BOOST_FOREACH (qlib::uid_t rendid, rend_uids) {
    
    RendererPtr pRend = getRenderer(rendid);
    LString grpname = pRend->getGroupName();
    if (!grpname.equals(grpfilt))
      continue;// --> skip rends not in grpfilt
    
    if (!bfirst)
      rval += ",\n";
    
    rval += "{";
    rval += getRendDataJSON(pRend);
    rval += "}";

    bfirst = false;
  }

  rval += "]";

  return rval;
}

RendererPtr Object::createPresetRenderer(const LString &preset_name,
                                         const LString &grp_name,
                                         const LString &name_prefix)
{
  // LString grp_name = name_prefix;

  StyleMgr *pSMgr = StyleMgr::getInstance();
  qlib::LDom2Node *pNode = pSMgr->getStyleNode(preset_name, m_nSceneID);
  if (pNode==NULL) {
    LString msg = LString::format("Unknown renderer preset %s", preset_name.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return RendererPtr();
  }

  LString type = pNode->getStrAttr("type");
  // if (!type.equals("renderer-preset")) {
  if (!type.endsWith("-rendpreset")) {
    LString msg = LString::format("%s is not a renderer preset (%s)", preset_name.c_str(), type.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return RendererPtr();
  }
  
  RendererFactory *pRF = RendererFactory::getInstance();

  RendererPtr pRendGrp = pRF->create("*group");
  pRendGrp->setName(grp_name);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    LString type_name = pChNode->getTypeName();

    if (!tag.equals("renderer"))
      continue;

    if (type_name.isEmpty())
      continue;

    RendererPtr pRend = pRF->create(type_name);

    // Renderer's properties should be built before registration to the scene,
    //   to prevent event propargation.
    pRend->readFrom2(pChNode);

    // setup props
    pRend->setPropStr("name", name_prefix+type_name);
    pRend->setPropStr("group", grp_name);

    // Register the built renderer
    attachRenderer(pRend);
    //registerRendererImpl(pRend);
  }

  //attachRenderer(pRendGrp);
  registerRendererImpl(pRendGrp);
  return pRendGrp;
}

////////////////////////////////
// Event handling

int Object::addListener(ObjectEventListener *pL)
{
  return m_pEvtCaster->add(pL);
}

bool Object::removeListener(ObjectEventListener *pL)
{
  return m_pEvtCaster->remove(pL);
}

void Object::fireObjectEvent(ObjectEvent &ev)
{
  m_pEvtCaster->replicaFire(ev);

  ScrEventManager *pSEM = ScrEventManager::getInstance();
  ev.setSource(m_nSceneID);
  pSEM->fireEvent(ev);
}

qlib::uid_t Object::getRootUID() const
{
  return getUID();
}

void Object::propChanged(qlib::LPropEvent &ev)
{
  // Record undo/redo info, if the txn is active
  if (!ev.isIntrDataChanged()) {
    UndoUtil uu(m_nSceneID);
    if (uu.isOK()) {
      PropEditInfo *pPEI = MB_NEW PropEditInfo;
      pPEI->setup(getUID(), ev);
      uu.add(pPEI);
    }
  }

  // propagate to object event
  {
    ObjectEvent obe;
    obe.setType(ObjectEvent::OBE_PROPCHG);
    obe.setTarget(getUID());
    obe.setDescr(ev.getName());
    obe.setPropEvent(&ev);
    fireObjectEvent(obe);
  }
  return;
}

////////////////////////////////
// (De)Serialization

void Object::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties of object
  super_t::writeTo2(pNode);

  // modify & write source info

  LString src_type = getSourceType();
  LString src_str = getSource();

  pNode->setStrAttr("srctype", src_type);

  if (!src_str.startsWith("datachunk:")) {
    // External data source:
    // Convert to relative path from basedir, if possible.

    // AltSrc should be always absolute path and readable (normalization)
    LString alt_src_str = getAltSource();
    convSrcPath(src_str, alt_src_str, pNode, true);

    // write reader options
    if (m_pReaderOpts!=NULL) {

      // Convert reader opt's pathnames (sub streams), if exists.
      qlib::LDom2Node *pSSNode = m_pReaderOpts->findChild("subsrc");
      if (pSSNode!=NULL) {
        for (pSSNode->firstChild(); pSSNode->hasMoreChild(); pSSNode->nextChild()) {
          qlib::LDom2Node *pCNode = pSSNode->getCurChild();
          LString key = pCNode->getTagName();
          LString src = pCNode->getStrAttr("src");
          LString altsrc = pCNode->getStrAttr("alt_src");
          // conv source path (without setting src/alt_src props)
          convSrcPath(src, altsrc, pCNode, false);
        }
      }

      pNode->appendChild( MB_NEW qlib::LDom2Node(*m_pReaderOpts) );
    }
  }
  else {
    //  ( embedded --> no path name conv, reader opts, and altpath aren't required. )
    pNode->setStrAttr("src", src_str);
    pNode->requestDataEmbed(this);
  }
  
  // Write renderer nodes
  qlib::UIDList rend_uids;
  getRendUIDs(rend_uids);
  BOOST_FOREACH (qlib::uid_t rendid, rend_uids) {
    RendererPtr pRend = getRenderer(rendid);
    MB_DPRINTLN("*** writeTo2 renderer %s", pRend->getTypeName());

    qlib::LDom2Node *pChNode = pNode->appendChild("renderer");

    // renderer type="nickname"
    pChNode->setTypeName( pRend->getTypeName() );

    // always in child element
    pChNode->setAttrFlag(false);

    pRend->writeTo2(pChNode);
  }

}

void Object::convSrcPath(const LString &aSrc,
                         const LString &aAltSrc,
                         qlib::LDom2Node *pNode,
                         bool bSetProp) const
{
  ScenePtr pScene = getScene();
  MB_ASSERT(!pScene.isnull());

  // get basedir of the scene
  LString basedir = pScene->getBasePath();

  std::pair<LString, LString> res = pScene->setPathsToNode(aSrc, aAltSrc, pNode);

  // Make writable object; this is required to update the src and alt_src properties.
  Object *pthis = const_cast<Object *>(this);

  if (bSetProp && !basedir.isEmpty())
    pthis->setSource(res.first);

  // Set the alternative path representation (in absolute form)
  if (!res.second.isEmpty() && !res.second.equals(res.first)) {
    if (bSetProp)
      pthis->setAltSource(res.second);
  }
}

void Object::readFrom2(qlib::LDom2Node *pNode)
{
  LString src = pNode->getStrAttr("src");
  if (!src.isEmpty()) {
    pNode->removeChild("src");
    setSource(src);
  }
  LString altsrc = pNode->getStrAttr("alt_src");
  if (!altsrc.isEmpty()) {
    pNode->removeChild("alt_src");
    setAltSource(altsrc);
  }

  LString srctype = pNode->getStrAttr("srctype");
  if (!srctype.isEmpty()) {
    pNode->removeChild("srctype");
    setSourceType(srctype);
  }

  // reader options
  qlib::LDom2Node *pRopts = pNode->findChild("ropts");
  if (pRopts!=NULL) {
    qlib::LDom2Node *pRoptsCopy = MB_NEW qlib::LDom2Node(*pRopts);
    setReaderOpts(pRoptsCopy);
  }

  super_t::readFrom2(pNode);

  RendererFactory *pRF = RendererFactory::getInstance();

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    LString type_name = pChNode->getTypeName();

    if (tag.equals("renderer") && !type_name.isEmpty()) {
      // TO DO: catch exception and report error here.

      //RendererPtr rrend = createRenderer(type_name);
      RendererPtr rrend = pRF->create(type_name);

      // Renderer's properties should be built before registration to the scene,
      //   to prevent event propargation.
      rrend->readFrom2(pChNode);
      if (!pChNode->isChildrenConsumed()) {
	// TO DO: report error (unknown element)
        //LOG_DPRINTLN("Object::readFrom2> Warning: some nodes (of rend) are not consumed");
        //pChNode->dump();
      }

      // Register the built renderer
      registerRendererImpl(rrend);

    }
    else {
      continue;
    }

    pChNode->setConsumed(true);
  }

  // Request data source load (from external file or data chunk)
  // LString src = getSource();
  // LString altsrc = getAltSource();
  // LString srctype = getSourceType();
  if (src.isEmpty()) {
    // no source (--> ignore)
    return;
  }
  if (srctype.isEmpty()) {
    // ERROR!! (TO DO: handling)
    // XXX: has source but no type info
    LOG_DPRINTLN("Scene> readFrom() src %s: srctype is not defined. (ignored)", src.c_str());
    return;
  }

  // Request data source loading (after finishing LDOM2Node processing)
  pNode->requestDataLoad(src, altsrc, srctype, this);
}

//////////

void Object::setReaderOpts(qlib::LDom2Node *ptree)
{
  if (m_pReaderOpts!=NULL) {
    MB_DPRINTLN("Object> Warning: previous reader options is deleted");
    delete m_pReaderOpts;
  }

  m_pReaderOpts = ptree;
}

////////////////////////////////////////////////////////////
//
// Object Extension Data implementation
//

ObjExtData::ObjExtData()
{
}

ObjExtData::ObjExtData(const ObjExtData &arg)
{
}

ObjExtData::~ObjExtData()
{
}

void ObjExtData::writeQdfData(DataTab &out)
{
}

void ObjExtData::readQdfData(const DataTab &in)
{
}

//////////

LString Object::getExtDataNames() const
{
  LString rval;
  bool bstart = true;
  BOOST_FOREACH (const ExtDataTab::value_type &elem,m_extdat) {
    if (!bstart)
      rval += ",";
    rval += elem.first;
    bstart = false;
  }
  return rval;
}

ObjExtDataPtr Object::getExtData(const LString &name) const
{
  ObjExtDataPtr p = m_extdat.get(name);
  return p;
}

ObjExtDataPtr Object::getCreateExtData(const LString &name)
{
  if (m_extdat.containsKey(name))
    return getExtData(name);
  
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  qlib::LClass *pcls = pMgr->getClassObj(name);
  if (pcls==NULL)
    return ObjExtDataPtr();
  ObjExtData *pObj = dynamic_cast<ObjExtData *>(pcls->createObj());
  if (pObj==NULL)
    return ObjExtDataPtr();
  ObjExtDataPtr pExt(pObj);

  setExtData(pExt);
  return pExt;
}

void Object::removeExtData(const LString &name)
{
  m_extdat.remove(name);
}

void Object::setExtData(ObjExtDataPtr p)
{
  LString name = p->getClassName();
  m_extdat.forceSet(name, p);
}

//////////

void Object::forceEmbed()
{
  if (!getSource().startsWith("datachunk:")) {
    // Non-datachunk source (i.e. external source)
    // --> change to the internal datachunk source
    setSource("datachunk:");
    setAltSource("");
  }
  
  // setSourceType(getDataChunkReaderName());
  // source type cannot be determined here!!
  setSourceType("");

  if (m_pReaderOpts!=NULL) delete m_pReaderOpts;
  m_pReaderOpts = NULL;
}

void Object::setDataChunkName(const LString &name, LDom2Node *pNode, int nQdfVer)
{
  LString src_type = getDataChunkReaderName(nQdfVer);

  // set props
  setSource(name);
  setSourceType(src_type);

  // update node values
  pNode->setStrAttr("srctype", src_type);
  pNode->setStrAttr("src", name);
}

void Object::readerAttached()
{
}

void Object::readerDetached()
{
}

////////////////////////////////////////////////

void Object::readFromStream(qlib::InStream &ins)
{
  const LString &ftype = getSourceType();
  StreamManager *pSM = StreamManager::getInstance();
  
  // Create the requested reader obj
  ObjReader *pRdr = pSM->createReaderPtr(ftype);
  if (pRdr==NULL) {
    LString msg = LString::format("ObjReader for type \"%s\" is not found", ftype.c_str());
    LOG_DPRINTLN("SceneXMLRead> %s", msg.c_str());
    MB_THROW(qlib::IOException, msg);
    return;
  }
    
  qlib::LDom2Node *pROpts = getReaderOpts();
  if (pROpts!=NULL) {
    pRdr->readFrom2(pROpts);
  }

  bool res;
  try {
    ObjectPtr pthis(this);
    pRdr->attach(pthis);
    pRdr->read2(ins);
    pRdr->detach();
  }
  catch (...) {
    delete pRdr;
    throw;
  }

  // END
  delete pRdr;
}

void Object::updateSrcPath(const LString &srcpath)
{
  setSource(srcpath);
  setAltSource("");
}

void Object::setXformMatrix(const qlib::Matrix4D &m)
{
  m_xformMat = m;
}

