// -*-Mode: C++;-*-
//
// Scene (qsc XML file) reader
//
// $Id: SceneXMLReader.cpp,v 1.14 2011/04/10 10:48:09 rishitani Exp $

#include <common.h>

#include "SceneXMLReader.hpp"
#include "StreamManager.hpp"
#include "SceneEvent.hpp"
#include "ObjReader.hpp"
#include "style/AutoStyleCtxt.hpp"
#include "RendererFactory.hpp"

#include <qlib/LDOM2Stream.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/LByteArray.hpp>

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>
namespace fs = boost::filesystem;

using namespace qsys;
using qlib::LDom2Node;
using qlib::LDataSrcContainer;

SceneXMLReader::SceneXMLReader()
{
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
}
    
/// detach from the target object
ScenePtr SceneXMLReader::detach()
{
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
  qlib::LDom2InStream ois(fis);

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

void SceneXMLReader::procDataChunks(qlib::LDom2InStream &ois, LDom2Node *pNode)
{
  for (;;) {
    try {
      LString chunkid = ois.getNextDataChunkID();
      if (chunkid.isEmpty())
        return;
      MB_DPRINTLN("SceneXMLReader> load datachunk: %s", chunkid.c_str());

      //LDataSrcContainer *pCnt = findChunkObj(chunkid);
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

void SceneXMLReader::procDataSrcLoad(qlib::LDom2InStream &ois, LDom2Node *pNode)
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

qlib::LScrSp<qlib::LScrObjBase> SceneXMLReader::fromByteArray(const qlib::LScrSp<qlib::LByteArray> &pbuf)
{
  qlib::uid_t nSceneID = m_pClient->getUID();

  // Enter the context
  AutoStyleCtxt style_ctxt(nSceneID);

  MB_DPRINTLN("fromXML\n%s<<<", pbuf->data());
  MB_DPRINTLN("Length: %d", pbuf->size());

  //
  // Setup streams
  //
  qlib::StrInStream fis(pbuf);
  qlib::LDom2InStream ois(fis);

  qlib::LDom2Tree tree;
  ois.read(tree);
  qlib::LDom2Node *pNode = tree.top();
  //pNode->dump();

  qlib::LScrSp<qlib::LScrObjBase> pSObj;
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

    // clearChunkMap();
    procDataSrcLoad(ois, pNode);
    procDataChunks(ois, pNode);
    // clearChunkMap();

  }
  else if (tag.equals("camera")) {
    // pbuf contains Camera
    CameraPtr pCam(MB_NEW Camera);
    pCam->readFrom2(pNode);
    pSObj = pCam;
  }
  else {
    MB_DPRINTLN("readRendFromXML> ERROR, Invalid QSC XML");
    return pSObj;
  }


  return pSObj;
}


