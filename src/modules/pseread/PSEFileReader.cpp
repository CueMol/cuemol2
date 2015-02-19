// -*-Mode: C++;-*-
//
//  PyMOL Session File Reader
//
// $Id: SceneXMLReader.cpp,v 1.14 2011/04/10 10:48:09 rishitani Exp $

#include <common.h>

#include "PSEFileReader.hpp"
#include <qsys/StreamManager.hpp>
#include <qsys/SceneEvent.hpp>
#include <qsys/SysConfig.hpp>
#include <pybr/PythonBridge.hpp>

// #include <qsys/ObjReader.hpp>
// #include <qsys/style/AutoStyleCtxt.hpp>
// #include <qsys/RendererFactory.hpp>

// #include <qlib/LDOM2Stream.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/StringStream.hpp>
// #include <qlib/LByteArray.hpp>

// #include <boost/filesystem/operations.hpp>
// #include <boost/filesystem/path.hpp>
// namespace fs = boost::filesystem;

#include "PickleInStream.hpp"

using namespace pseread;
using qlib::LDom2Node;
using qlib::LDataSrcContainer;

PSEFileReader::PSEFileReader()
{
}

PSEFileReader::~PSEFileReader()
{
}

int PSEFileReader::getCatID() const
{
  return IOH_CAT_SCEREADER;
}

/// attach to and lock the target object
void PSEFileReader::attach(ScenePtr pScene)
{
  // TO DO: lock scene
  m_pClient = pScene;
}
    
/// detach from the target object
ScenePtr PSEFileReader::detach()
{
  // TO DO: unlock scene
  ScenePtr p = m_pClient;
  m_pClient = ScenePtr();
  return p;
}

/// Get name of the reader
const char *PSEFileReader::getName() const
{
  return "psefile";
}

/// Get file-type description
const char *PSEFileReader::getTypeDescr() const
{
  return "PyMOL Session (*.pse)";
}

/// Get file extension
const char *PSEFileReader::getFileExt() const
{
  return "*.pse";
}

//////////////////////////////////////////////////

void PSEFileReader::read()
{
  //  LOG_DPRINTLN("PSEFileReader> File loaded: %s.", getPath().c_str());

/*
  qsys::SysConfig *pconf = qsys::SysConfig::getInstance();
  LString filename = pconf->convPathName("%%CONFDIR%%/data/python/pse_reader.py");

  pybr::PythonBridge *pb = pybr::PythonBridge::getInstance();
  LString arguments = LString::format("{\"filename\": \"%s\"}", getPath().c_str()); 
  pb->runFile3(filename, m_pClient->getUID(), 0, arguments);
*/
  
  LString localfile = getPath();
  
  qlib::FileInStream fis;
  fis.open(localfile);
  PickleInStream ois(fis);

  LVariant *pTop = ois.getMap();

  if (!pTop->isDict()) {
    delete pTop;
    return;
  }

  LVarDict *pDict = pTop->getDictPtr();

  int ver = pDict->getInt("version");
  LOG_DPRINTLN("PyMOL version %d", ver);

  LVarList *pNames = pDict->getList("names");
  procNames(pNames);
  
  delete pTop;
  
  //////////
  // fire the scene-loaded event
  {
    qsys::SceneEvent ev;
    ev.setTarget(m_pClient->getUID());
    ev.setType(qsys::SceneEvent::SCE_SCENE_ONLOADED);
    m_pClient->fireSceneEvent(ev);
  }
}

void PSEFileReader::procNames(LVarList *pNames)
{
  LVarList::const_iterator iter = pNames->begin();
  LVarList::const_iterator eiter = pNames->end();

  for (; iter!=eiter; ++iter) {
    LVariant *pElem = *iter;
    if (!pElem->isList()) {
      // ERROR!!
      LOG_DPRINTLN("Invalid elem in names");
      continue;
    }
    LVarList *pList = pElem->getListPtr();

    LString name = pList->getString(0);
    int type = pList->getInt(1);
    int visible = pList->getInt(2);
    LVarList *pRepOn = pList->getList(3);
    int extra_int = pList->getInt(4);
    LVarList *pData = pList->getList(5);
    
    MB_DPRINTLN("Name %s type=%d", name.c_str(), type);
  }
}

