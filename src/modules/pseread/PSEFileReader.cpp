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

  qsys::SysConfig *pconf = qsys::SysConfig::getInstance();
  LString filename = pconf->convPathName("%%CONFDIR%%/data/python/pse_reader.py");

  pybr::PythonBridge *pb = pybr::PythonBridge::getInstance();
  LString arguments = LString::format("{\"filename\": \"%s\"}", getPath().c_str()); 
  pb->runFile3(filename, m_pClient->getUID(), 0, arguments);

  //////////
  // fire the scene-loaded event
  {
    qsys::SceneEvent ev;
    ev.setTarget(m_pClient->getUID());
    ev.setType(qsys::SceneEvent::SCE_SCENE_ONLOADED);
    m_pClient->fireSceneEvent(ev);
  }
}

