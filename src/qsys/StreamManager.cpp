//
// Stream manager singleton class
//
// $Id: StreamManager.cpp,v 1.17 2010/12/15 00:19:08 rishitani Exp $
//

#include <common.h>

#include "StreamManager.hpp"
#include "ObjReader.hpp"
#include "ObjWriter.hpp"
#include <qlib/ClassRegistry.hpp>

#include <qlib/FileStream.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/LVarArray.hpp>

#ifdef HAVE_BOOST_THREAD
#define BOOST_LIB_DIAGNOSTIC 1
//#define BOOST_DYN_LINK 1
#define BOOST_ALL_DYN_LINK 1
#include <boost/thread.hpp>
#include <boost/thread/condition.hpp>
#include <boost/bind.hpp>
//#include "PipeStream.hpp"
#include <qlib/PipeStream.hpp>
#include "IOThread.hpp"
#endif

#include <qlib/LDOM2Stream.hpp>
#include <qlib/StringStream.hpp>

#include "SceneManager.hpp"
#include "RendererFactory.hpp"
#include "style/AutoStyleCtxt.hpp"
#include "SceneXMLReader.hpp"
#include "SceneXMLWriter.hpp"

using namespace qsys;

SINGLETON_BASE_IMPL(qsys::StreamManager);

///////////////

StreamManager::StreamManager()
{
  MB_DPRINTLN("StreamManager(%p) created", this);
}

StreamManager::~StreamManager()
{
  MB_DPRINTLN("StreamManager(%p) destructed", this);
}

//int StreamManager::loadObjectAsync(const LString &ftype)
int StreamManager::loadObjectAsync(qlib::LScrSp<ObjReader> pReader)
{
#ifdef HAVE_BOOST_THREAD
  MB_DPRINTLN("StreamManager.loadAsyncObject(%s) called", pReader->getName());

  IOThread *pThr = MB_NEW IOThread;
  pThr->m_pRdr = pReader;
  int tid = m_iotab.put(pThr);
  pThr->kick();

  return tid;
#else
  return -1;
#endif
}

void StreamManager::supplyDataAsync(int id, qlib::LScrSp<qlib::LByteArray> pbuf, int nlen)
{
  MB_DPRINTLN("StreamManager.supplyDataAsync(%d, size=%d) called",id, nlen);
  IOThread *pThr = m_iotab.get(id);
  if (pThr==NULL) return;
  pThr->supplyData((const char *)pbuf->data(), nlen);
}

ObjectPtr StreamManager::waitLoadAsync(int id)
{
  IOThread *pThr = m_iotab.get(id);
  if (pThr==NULL) return ObjectPtr();
  
  pThr->notifyEos();
  pThr->waitTermination();

  ObjectPtr pret = pThr->m_pObj;
  m_iotab.remove(id);
  delete pThr;

  if (!pret.isnull())
    pret->setSource("");

  return pret;
}

///////////////

void StreamManager::regIOHImpl(const LString &abiname)
{
  LString nickname,descr,fext;
  int ntype;

  qlib::ClassRegistry *pCR = qlib::ClassRegistry::getInstance();
  qlib::LClass *pCls = pCR->getClassObjByAbiName(abiname);
  
  // Create a dummy instance to retrieve type information
  {
    InOutHandler *pIOH = dynamic_cast<InOutHandler *>(pCls->createObj());
    if (pIOH==NULL) {
      LString msg = LString::format("Class %s is not ObjReader", abiname.c_str());
      MB_THROW(qlib::InvalidCastException, msg);
      return;
    }

    nickname = pIOH->getName();
    descr = pIOH->getTypeDescr();
    fext = pIOH->getFileExt();
    ntype = pIOH->getCatID();

    delete pIOH;
  }

  ReaderInfo ri;
  ri.nickname = nickname;
  ri.descr = descr;
  ri.fext = fext;
  ri.pClass = pCls;
  ri.nCatID = ntype;

  if (!m_rdrinfotab.set(abiname, ri)) {
    LString msg = LString::format("Reader/Writer <%s> already exists", abiname.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
}

bool StreamManager::unregistReader(const LString &abiname, bool bWriter /*= false*/)
{
  // TO DO: implementation
  return false;
}

bool StreamManager::isReaderRegistered(const LString &abiname)
{
  return m_rdrinfotab.containsKey(abiname);
}

InOutHandler *StreamManager::createHandlerPtr(const LString &nickname, int nCatID) const
{
  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    const LString &nknm = entry.second.nickname;
    if (!nickname.equals(nknm))
      continue;
    if (nCatID!=entry.second.nCatID)
      continue;
    qlib::LClass *pCls = entry.second.pClass;
    MB_ASSERT(pCls!=NULL);
    
    InOutHandler *pObj = dynamic_cast<InOutHandler *>(pCls->createObj());
    if (pObj==NULL) {
      // This should not happen!!
      LOG_DPRINTLN("Reader %s is not ObjReader", nknm.c_str());
      continue;
    }

    pObj->resetAllProps();
    return pObj;
  }

  // not found!!
  return NULL;
}

ObjReader *StreamManager::createReaderPtr(const LString &nickname) const
{
  return dynamic_cast<ObjReader *>(createHandlerPtr(nickname, InOutHandler::IOH_CAT_OBJREADER));
}


LString StreamManager::getReaderInfoJSON() const
{
  return getIOHInfoJSONImpl(InOutHandler::IOH_CAT_OBJREADER);
}

LString StreamManager::getWriterInfoJSON() const
{
  return getIOHInfoJSONImpl(InOutHandler::IOH_CAT_OBJWRITER);
}

LString StreamManager::getIOHInfoJSONImpl(int aCatID) const
{
  int i;
  qlib::LStringList tmps;
  LString rval;
  data_t::const_iterator iter;

  rval += "({ ";

  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    //iter = m_rdrinfotab.begin();
    //for (i=0; iter!=m_rdrinfotab.end(); ++iter) {
    //if (iter->second.bWriter!=bWriter)
    //continue;
    if (entry.second.nCatID!=aCatID)
      continue;
    LString descr = entry.second.descr;
    tmps.push_back("\"" + descr + "\"");
  }  

  int nent = tmps.size();
  rval += LString::format("size: %d", nent);
  if (nent<=0) {
    rval += " })\n";
    return rval;
  }

  rval += ",\n";

  rval += "descrs:[ ";
  rval += LString::join(",\n", tmps);
  rval += "],\n";
  tmps.erase(tmps.begin(), tmps.end());
  
  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    //iter = m_rdrinfotab.begin();
    //for (i=0; iter!=m_rdrinfotab.end(); ++iter) {
    if (entry.second.nCatID!=aCatID)
      continue;
    //if (entry.second.bWriter!=bWriter)
    //continue;
    LString fext = entry.second.fext;
    tmps.push_back("\"" + fext + "\"");
  }  

  rval += "fexts:[ ";
  rval += LString::join(",\n", tmps);
  rval += "],\n";
  tmps.erase(tmps.begin(), tmps.end());

  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    //iter = m_rdrinfotab.begin();
    //for (i=0; iter!=m_rdrinfotab.end(); ++iter) {
    //if (iter->second.bWriter!=bWriter)
    //continue;
    if (entry.second.nCatID!=aCatID)
      continue;
    LString s = entry.second.nickname;
    tmps.push_back("\"" + s + "\"");
  }  

  rval += "nicknames:[ ";
  rval += LString::join(",\n", tmps);
  rval += "] })\n";

  return rval;
}

LString StreamManager::getInfoJSON2() const
{
  std::list<LString> tmps;
  LString rval;
  data_t::const_iterator iter;

  rval += "[";

  bool bFirst = true;
  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {

    if (!bFirst)
      rval += ",";
    bFirst = false;

    rval += "{";

    rval += LString("\"descr\": \"") + entry.second.descr + "\",";
    rval += LString("\"fext\": \"") + entry.second.fext + "\",";
    rval += LString("\"name\": \"") + entry.second.nickname + "\",";
    rval += LString::format("\"category\": %d", entry.second.nCatID);

    rval += "}";
  }  

  rval += "]";

  return rval;
}

/*
LString StreamManager::getInitRendererNames(const LString &rdrnm) const
{
  // Create the requested reader obj
  ObjReader *pRdr = createReaderPtr(rdrnm);
  if (pRdr==NULL) {
    LOG_DPRINTLN("StreamManager> Reader %s not found", rdrnm.c_str());
    return LString();
  }

  ObjectPtr pObj = pRdr->createDefaultObj();
  if (pObj.isnull()) {
    LOG_DPRINTLN("StreamManager> No default obj found for Reader %s", rdrnm.c_str());
    return LString();
  }

  LString rval;
  rval = pObj->searchCompatibleRendererNames();
  delete pRdr;

  return rval;
}
*/

LString StreamManager::findCompatibleWriterNamesForObj(qlib::uid_t objid)
{
  ObjectPtr pObj = SceneManager::getInstance()->getObject(objid);

  const int kCatID = InOutHandler::IOH_CAT_OBJWRITER;
  qlib::LStringList ls;

  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    const LString &nknm = entry.second.nickname;
    if (kCatID!=entry.second.nCatID)
      continue;
    qlib::LClass *pCls = entry.second.pClass;
    MB_ASSERT(pCls!=NULL);
    
    ObjWriter *pObjWr = dynamic_cast<ObjWriter *>(pCls->createObj());
    if (pObjWr==NULL) {
      // This should not happen!!
      LOG_DPRINTLN("Fatal Error: Handler %s is not ObjWriter", nknm.c_str());
      continue;
    }

    if (pObjWr->canHandle(pObj)) {
      ls.push_back(nknm);
    }
    delete pObjWr;
  }

  if (ls.size()==0)
    return LString();

  return LString::join(",", ls);
}


/////////////////////////////////////////////////////////////////////////


qlib::LByteArrayPtr StreamManager::toXML(const qlib::LScrObjBasePtr &pSObj)
{
  SceneXMLWriter writer;
  qlib::LScrSp<qlib::LByteArray> rval = writer.toByteArray(pSObj);
  return rval;
}

qlib::LByteArrayPtr StreamManager::toXML2(const qlib::LScrObjBasePtr &pSObj,
                                          const LString &type_ovwr)
{
  SceneXMLWriter writer;
  qlib::LScrSp<qlib::LByteArray> rval = writer.toByteArray(pSObj, type_ovwr);
  return rval;
}

qlib::LByteArrayPtr StreamManager::rendGrpToXML(const qlib::LVarArray &objs, const LString &grpname)
{
  const int nlen = objs.size();
  
//  if (nlen==0)
//    return qlib::LByteArrayPtr();

  {
    // try renderer array
    std::list<RendererPtr> list;
    for (int i=0; i<nlen; ++i) {
      if (!objs[i].isObject())
        return qlib::LByteArrayPtr();
      
      LScriptable *pObj = objs[i].getObjectPtr();
      if (pObj==NULL)
        return qlib::LByteArrayPtr();
      if (!pObj->isSmartPtr())
        return qlib::LByteArrayPtr();

      qlib::LSupScrSp *pBaseSP = static_cast<qlib::LSupScrSp *>(pObj);
      RendererPtr pRend = RendererPtr(*pBaseSP);
      if (pRend.isnull())
        return qlib::LByteArrayPtr();

      list.push_back(pRend);
    }

    SceneXMLWriter writer;
    qlib::LByteArrayPtr rval = writer.rendArrayToByteArray(list, grpname);
    return rval;
  }
  
  
  // return qlib::LByteArrayPtr();
}

////////////////////////////////

qlib::LScrObjBasePtr StreamManager::fromXML(const qlib::LByteArrayPtr &pbuf,
                                            qlib::uid_t nSceneID)
{
  SceneXMLReader reader;
  ScenePtr pScene = SceneManager::getSceneS(nSceneID);
  reader.attach(pScene);
  qlib::LScrSp<qlib::LScrObjBase> rval = reader.fromByteArray(pbuf);
  reader.detach();
  return rval;
}

qlib::LVarArray StreamManager::rendArrayFromXML(const qlib::LByteArrayPtr &pbuf,
                                                qlib::uid_t nSceneID)
{
  SceneXMLReader reader;
  ScenePtr pScene = SceneManager::getSceneS(nSceneID);
  reader.attach(pScene);

  std::list<RendererPtr> rends;
  LString grpname;
  reader.rendArrayFromByteArray(pbuf, rends, grpname);

  reader.detach();

  int nrends = rends.size();
  qlib::LVarArray rval(nrends+1);
  
  // the first element contains the group name (empty if array is not a group)
  rval[0].setStringValue(grpname);

  int i=1;
  BOOST_FOREACH (RendererPtr pRend, rends) {
    LScriptable *p = pRend.copy();
    rval[i].setObjectPtr(p);
    ++i;
  }

  return rval;
}


