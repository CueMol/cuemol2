// -*-Mode: C++;-*-
//
// Scene exporter
//
// $Id: SceneExporter.cpp,v 1.5 2011/01/03 16:47:05 rishitani Exp $

#include <common.h>

#include "SceneExporter.hpp"

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

namespace fs = boost::filesystem;
using namespace qsys;

SceneExporter::~SceneExporter()
{
}

int SceneExporter::getCatID() const
{
  return IOH_CAT_RENDTOFILE;
}

/// attach to and lock the target object
void SceneExporter::attach(ScenePtr pScene)
{
  // TO DO: lock scene
  m_pClient = pScene;

  super_t::startTimerMes();
}
    
/// detach from the target object
ScenePtr SceneExporter::detach()
{
  super_t::endTimerMes();

  // TO DO: unlock scene
  ScenePtr p = m_pClient;
  m_pClient = ScenePtr();
  return p;
}

LString SceneExporter::makeRelSubPath(const LString &sub_name)
{
  const LString &str_mainpath = getPath();
  const LString &str_subpath_orig = getPath(sub_name);

  if (str_mainpath.isEmpty()) {
    MB_THROW(qlib::RuntimeException, "makeRelSubPath: main path is empty");
    return LString();
  }
  if (str_subpath_orig.isEmpty()) {
    MB_THROW(qlib::RuntimeException, "makeRelSubPath: sub path is empty");
    return LString();
  }

  LString rval;

  // Check and modify the mainpath to absolute form
  fs::path mainpath(str_mainpath.c_str());
  if (!mainpath.is_complete()) {
#if (BOOST_FILESYSTEM_VERSION==2)
    // Make mainpath to be absolute using initial_path() (= PWD at the time when program starts)
    mainpath = fs::complete(mainpath);
    setPath(mainpath.file_string());
#else
    // Make mainpath to be absolute using current_path() (= PWD)
    mainpath = fs::absolute(mainpath);
    setPath(mainpath.string());
#endif
  }
  fs::path base_path = mainpath.parent_path();

  // Check and modify the inc file path
  fs::path subpath(str_subpath_orig.c_str());
  if (!subpath.is_complete()) {
    // subpath is relative path (to the base_path) ==> return it
    rval = str_subpath_orig;
#if (BOOST_FILESYSTEM_VERSION==2)
    subpath = fs::complete(subpath, base_path);
    // rewrite subpath with abs subpath
    setPath(sub_name, subpath.file_string());
#else
    subpath = fs::absolute(subpath, base_path);
    // rewrite subpath with abs subpath
    setPath(sub_name, subpath.string());
#endif

  }
  else {
    // subpath is absolute path
    // make the inc-file path relative ==> return it
#if (BOOST_FILESYSTEM_VERSION==2)
    rval = qlib::makeRelativePath(str_subpath_orig, base_path.directory_string());
#else
    rval = qlib::makeRelativePath(str_subpath_orig, base_path.string());
#endif
  }

  return rval;
}

CameraPtr SceneExporter::getCamera() const
{
  if (m_pCamera.isnull()) {
    return m_pClient->getCamera(m_cameraName);
  }

  return m_pCamera;
}

