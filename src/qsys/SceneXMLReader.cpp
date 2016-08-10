// -*-Mode: C++;-*-
//
// Scene (qsc XML file) reader
//
// $Id: SceneXMLReader.cpp,v 1.14 2011/04/10 10:48:09 rishitani Exp $

#include <common.h>

/// Use new chank-stream parser class (qlib::ObjStream3)
#define USE_OBJSTR3 1

#include "SceneXMLReader.hpp"
#include "StreamManager.hpp"
#include "SceneEvent.hpp"
#include "ObjReader.hpp"
#include "RendererFactory.hpp"
#include "style/AutoStyleCtxt.hpp"
#include "style/StyleFile.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/LByteArray.hpp>

#include <qlib/LUnicode.hpp>

#ifdef USE_OBJSTR3
#include <qlib/LObjStream3.hpp>
#else
#include <qlib/LDOM2Stream.hpp>
#endif

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>
namespace fs = boost::filesystem;

using namespace qsys;
using qlib::LDom2Node;
using qlib::LDataSrcContainer;

SceneXMLReader::SceneXMLReader()
{
  // default buffer size (1M bytes)
  m_nBufSz = 1024*1024;
}

SceneXMLReader::~SceneXMLReader()
{
}

int SceneXMLReader::getCatID() const
{
  return IOH_CAT_SCEREADER;
}

/// attach to and lock the target object
void SceneXMLReader::attach(ScenePtr pScene)
{
  // TO DO: lock scene
  m_pClient = pScene;
  super_t::startTimerMes();
}
    
/// detach from the target object
ScenePtr SceneXMLReader::detach()
{
  super_t::endTimerMes();

  // TO DO: unlock scene
  ScenePtr p = m_pClient;
  m_pClient = ScenePtr();
  return p;
}

/// Get name of the writer
const char *SceneXMLReader::getName() const
{
  //return "qsc_xmlreader";
  return "qsc_xml";
}

/// Get file-type description
const char *SceneXMLReader::getTypeDescr() const
{
  return "CueMol Scene (*.qsc;*.qsl)";
}

/// Get file extension
const char *SceneXMLReader::getFileExt() const
{
  return "*.qsc; *.qsl";
}

//////////////////////////////////////////////////

void SceneXMLReader::read()
{
  // If getPath() points to a relative path,
  // convert it to the absolute path name using the fs::current_path() (i.e. pwd)
  fs::path curpath = fs::current_path();
#if (BOOST_FILESYSTEM_VERSION==2)
  LString localfile = qlib::makeAbsolutePath(getPath(), curpath.file_string());
#else
  LString localfile = qlib::makeAbsolutePath(getPath(), curpath.string());
#endif


  // Enter the loading scene's context
  AutoStyleCtxt style_ctxt(m_pClient->getUID());
  
  // show start msg
  LOG_DPRINTLN("SceneXML> Start loading: %s ...", localfile.c_str());

  //
  // Setup streams
  //
  qlib::FileInStream fis;
  fis.open(localfile);

#ifdef USE_OBJSTR3
  qlib::LObjInStream3 ois(fis);
  ois.setBufSize(m_nBufSz);
  ois.start();
  LOG_DPRINTLN("SceneXML> Using %d-kb buffered objstream", m_nBufSz/1024);
#else
  qlib::LDom2InStream ois(fis);
#endif

  //
  // Construct data structure
  //   from the XML part in the target scene file.
  //
  qlib::LDom2Tree tree;
  ois.read(tree);
  LDom2Node *pNode = tree.top();

  m_pClient->setSource(localfile);
  m_pClient->setSourceType(getName());

  // perform deserialization to the client scene (m_pClient)
  tree.deserialize(&m_pClient);

  // load data source / collect chunk-load requests
  procDataSrcLoad(ois, pNode);

  // perform chunk loading
  procDataChunks(ois, pNode);

  ois.close();
  m_pClient->setUpdateFlag();
  m_errmsg = pNode->getErrorMsgs();

  LOG_DPRINTLN("SceneXML> File loaded: %s.", localfile.c_str());

  //////////
  // fire the scene-loaded event
  {
    SceneEvent ev;
    ev.setTarget(m_pClient->getUID());
    ev.setType(SceneEvent::SCE_SCENE_ONLOADED);
    m_pClient->fireSceneEvent(ev);
  }
}

#ifdef USE_OBJSTR3
void SceneXMLReader::procDataChunks(qlib::LDom2InStream &ois, LDom2Node *pNode) {}
void SceneXMLReader::procDataChunks(qlib::LObjInStream3 &ois, LDom2Node *pNode)
#else
void SceneXMLReader::procDataChunks(qlib::LObjInStream3 &ois, LDom2Node *pNode) {}
void SceneXMLReader::procDataChunks(qlib::LDom2InStream &ois, LDom2Node *pNode)
#endif
{
  for (;;) {
    try {
      LString chunkid = ois.getNextDataChunkID();
      if (chunkid.isEmpty())
        return;
      MB_DPRINTLN("SceneXMLReader> load datachunk: %s", chunkid.c_str());

      LDataSrcContainer *pCnt = ois.findChunkObj(chunkid);
      if (pCnt==NULL) {
        LOG_DPRINTLN("SceneXMLReader> data container for chunk %s not found.", chunkid.c_str());
        return;
      }

      qlib::InStream *pin = ois.getNextChunkStream();
      pCnt->readFromStream(*pin);
      ois.closeChunkStream(pin);
      
    }
    catch (qlib::LException &e) {
      pNode->appendErrMsg("SceneXML> Load object error (ignored).");
      pNode->appendErrMsg("SceneXML> Reason: %s", e.getMsg().c_str());
    }
    catch (...) {
      pNode->appendErrMsg("SceneXML> Load object error (ignored).");
      pNode->appendErrMsg("SceneXML> Reason: unknown");
    }
  }
}

#ifdef USE_OBJSTR3
void SceneXMLReader::procDataSrcLoad(qlib::LDom2InStream &ois, LDom2Node *pNode) {}
void SceneXMLReader::procDataSrcLoad(qlib::LObjInStream3 &ois, LDom2Node *pNode)
#else
void SceneXMLReader::procDataSrcLoad(qlib::LObjInStream3 &ois, LDom2Node *pNode) {}
void SceneXMLReader::procDataSrcLoad(qlib::LDom2InStream &ois, LDom2Node *pNode)
#endif
{
  //////////
  // Recursively check the data src load requests

  LDom2Node::NodeList::const_iterator iter = pNode->childBegin();
  LDom2Node::NodeList::const_iterator eiter = pNode->childEnd();
  for (; iter!=eiter; ++iter) {
    LDom2Node *pChNode = *iter;
    if (pChNode!=NULL)
      procDataSrcLoad(ois, pChNode);
  }

  //////////
  // Do data source loading

  LDataSrcContainer *pCnt = pNode->getDataSrcContainer();
  if (pCnt==NULL)
    return;
  
  LString src = pNode->getDataSrc();
  LString altsrc = pNode->getDataAltSrc();
  LString srctype = pNode->getDataSrcType();

  if (src.isEmpty())
    return;

  if (srctype.isEmpty()) {
    // ERROR!! (TO DO: handling)
    LOG_DPRINTLN("SceneXML> src %s: srctype is not defined. (ignored)", src.c_str());
    return;
  }

  if (src.startsWith("datachunk:") && src.length()==15) {
    // Data source is in datachunk
    // --> Prepare for reading from data chunk of the stream
    MB_DPRINTLN("Data chunk found %s, %s ",
                src.c_str(), srctype.c_str());
    // addChunkMap(src, pCnt, srctype);
    ois.addChunkMap(src, pCnt);
    return;
  }
  
  //robj->readFromPath(src, altsrc, m_pClient);
  bool bAlt = false;
  LString basedir = m_pClient->getBasePath();
  MB_DPRINTLN("basedir>");
  basedir.dump();
  LString scenesrc = m_pClient->getSource();
  MB_DPRINTLN("scenesrc>");
  scenesrc.dump();

/*
  try {
    int xx;
    qlib::UTF8toUCS16(basedir, &xx);
  }
  catch (...) {
    basedir.dump();
    MB_DPRINTLN("XXX invalid basedir");
  }*/

  LString abs_path = pCnt->readFromSrcAltSrc(src, altsrc, basedir, bAlt);

  // ATTN 14/06/29:
  // Update src/altsrc properties based on where the data source has been loaded.
  // (In the qsc file, there are two alternative sources. However, only one src is actually loaded.)
  // This is required to keep consistency between the "src prop" and "actual data src".
  if (bAlt) {
    // loaded from altsrc; altsrc --> src
    if (!qlib::isAbsolutePath(altsrc))
      altsrc = qlib::makeAbsolutePath(altsrc, basedir);
    pCnt->updateSrcPath(altsrc);
  }
  else {
    // loaded from src; keep src
    if (!qlib::isAbsolutePath(src))
      src = qlib::makeAbsolutePath(src, basedir);
    pCnt->updateSrcPath(src);
  }

}

qlib::LScrObjBasePtr SceneXMLReader::fromByteArray(const qlib::LByteArrayPtr &pbuf)
{
  qlib::uid_t nSceneID = m_pClient->getUID();

  // Enter the context
  AutoStyleCtxt style_ctxt(nSceneID);

  MB_DPRINTLN("fromXML\n%s<<<", pbuf->data());
  MB_DPRINTLN("Length: %d", pbuf->size());

  // Setup streams
  qlib::StrInStream fis(pbuf);

#ifdef USE_OBJSTR3
  qlib::LObjInStream3 ois(fis);
  ois.setBufSize(m_nBufSz);
  ois.start();
#else
  qlib::LDom2InStream ois(fis);
#endif

  // Construct nodes from stream
  qlib::LDom2Tree tree;
  ois.read(tree);
  qlib::LDom2Node *pNode = tree.top();
  //pNode->dump();

  qlib::LScrObjBasePtr pSObj;
  LString tag = pNode->getTagName();
  LString type_name = pNode->getTypeName();
  if (tag.equals("renderer") && !type_name.isEmpty()) {
    // pbuf contains Renderer
    RendererFactory *pRF = RendererFactory::getInstance();
    RendererPtr pRend = pRF->create(type_name);
    pRend->resetAllProps();
    pRend->readFrom2(pNode);
    pSObj = pRend;
  }
  else if (tag.equals("object") && !type_name.isEmpty()) {
    ObjectPtr pObj = pNode->createObjByTypeNameT<Object>();
    pObj->readFrom2(pNode);

    LString src = pObj->getSource();
    LString altsrc = pObj->getAltSource();
    LString srctype = pObj->getSourceType();
    pNode->requestDataLoad(src, altsrc, srctype, pObj.get());

    pSObj = pObj;

    procDataSrcLoad(ois, pNode);
    procDataChunks(ois, pNode);
  }
  else if (tag.equals("camera")) {
    // pbuf contains Camera
    CameraPtr pCam(MB_NEW Camera);
    pCam->readFrom2(pNode);
    pSObj = pCam;
  }
  else if (tag.equals("styles")) {
    // pbuf contains StyleSet
    StyleFile sfile;
    StyleSetPtr pStySet = sfile.loadNodes(pNode);
    pSObj = pStySet;
  }
  else {
    MB_DPRINTLN("readRendFromXML> ERROR, Invalid QSC XML: <%s>", tag.c_str());
    // return pSObj;
  }

  ois.close();

  return pSObj;
}

void SceneXMLReader::rendArrayFromByteArray(const qlib::LByteArrayPtr &pbuf,
                                            std::list<RendererPtr> &rends,
                                            LString &grpName)
{
  qlib::uid_t nSceneID = m_pClient->getUID();

  // Enter the context
  AutoStyleCtxt style_ctxt(nSceneID);

  MB_DPRINTLN("fromXML\n%s<<<", pbuf->data());
  MB_DPRINTLN("Length: %d", pbuf->size());
  
  // Setup streams
  qlib::StrInStream fis(pbuf);

#ifdef USE_OBJSTR3
  qlib::LObjInStream3 ois(fis);
  ois.setBufSize(m_nBufSz);
  ois.start();
#else
  qlib::LDom2InStream ois(fis);
#endif

  // Construct nodes from stream
  qlib::LDom2Tree tree;
  ois.read(tree);
  qlib::LDom2Node *pNode = tree.top();
  //pNode->dump();
  ois.close();

  LString tagname = pNode->getTagName();
  if (!tagname.equals("renderers")) {
    MB_THROW(qlib::RuntimeException, "readRendFromXML error, Invalid QSC XML");
  }
    
  RendererFactory *pRF = RendererFactory::getInstance();
  
  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    LString type_name = pChNode->getTypeName();

    if (!tag.equals("renderer") || type_name.isEmpty())
      continue;

    RendererPtr prend = pRF->create(type_name);

    // Renderer's properties should be built before registration to the scene,
    //   to prevent event propargation.
    prend->readFrom2(pChNode);

    rends.push_back(prend);
  }

  grpName = pNode->getStrAttr("group");

  return;
}

