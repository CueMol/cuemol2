// -*-Mode: C++;-*-
//
// POV-Ray scene output class
//
// $Id: PovSceneExporter.cpp,v 1.8 2011/04/11 11:37:29 rishitani Exp $

#include <common.h>

#include "PovSceneExporter.hpp"
#include "PovDisplayContext.hpp"

#include <qlib/LClassUtils.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LStream.hpp>

#include <qsys/qsys.hpp>

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>
namespace fs = boost::filesystem;

using namespace render;
using qsys::ScenePtr;
using qsys::CameraPtr;
using qsys::ViewPtr;

PovSceneExporter::PovSceneExporter()
     : m_bPerspective(true), m_bMakeRelIncPath(true)
{
  m_bUseClipZ = false;
  m_bPostBlend = false;

  m_bEnableEdgeLines = true;

  //default: no crease limit
  m_dCreaseLimit = -1.0; //qlib::toRadian(85.0);

  m_dEdgeRise = 0.5;

  m_bWritePix = false;
}

PovSceneExporter::~PovSceneExporter()
{
}

void PovSceneExporter::write()
{
  PovDisplayContext *ppovdc = MB_NEW PovDisplayContext();

  LString str_povpath = getPath();
  LString str_incpath = getPath("inc");

  // Check and mangle the path names
  if (m_bMakeRelIncPath) {
    if (!str_povpath.isEmpty() && !str_incpath.isEmpty()) {
      // Check and modify the main pov file path
      fs::path povpath(str_povpath.c_str());
      if (!povpath.is_absolute()) {
#if (BOOST_FILESYSTEM_VERSION==2)
        povpath = fs::complete(povpath);
        setPath(povpath.file_string());
#else
        povpath = fs::absolute(povpath);
        setPath(povpath.string());
#endif
      }
      fs::path base_path = povpath.parent_path();
      // Check and modify the inc file path
      fs::path incpath(str_incpath.c_str());
      if (!incpath.is_absolute()) {
        ppovdc->setIncFileName(str_incpath);
#if (BOOST_FILESYSTEM_VERSION==2)
        incpath = fs::complete(incpath, base_path);
        setPath("inc", incpath.file_string());
#else
        incpath = fs::absolute(incpath, base_path);
        setPath("inc", incpath.string());
#endif
      }
      else {
        // make the inc-file path relative
#if (BOOST_FILESYSTEM_VERSION==2)
        LString relpath = qlib::makeRelativePath(str_incpath, base_path.directory_string());
#else
        LString relpath = qlib::makeRelativePath(str_incpath, base_path.string());
#endif
        ppovdc->setIncFileName(relpath);
      }
    }
  }
  else {
    ppovdc->setIncFileName(str_incpath);
  }

  // Main stream
  qlib::OutStream *pOutPov = createOutStream();
  // Sub stream (inc file)
  qlib::OutStream *pOutInc = createOutStream("inc");

  ScenePtr pScene = getClient();

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  // ppovdc->setTargetView(pView);
  ppovdc->init(pOutPov, pOutInc);
  //ppovdc->startPovRender();

  ppovdc->setClipZ(m_bUseClipZ);
  ppovdc->setPostBlend(m_bPostBlend);
  ppovdc->setPerspective(m_bPerspective);
  ppovdc->setBgColor(pScene->getBgColor());

  ppovdc->enableEdgeLines(m_bEnableEdgeLines);
  ppovdc->setCreaseLimit(m_dCreaseLimit);
  ppovdc->setEdgeRise(m_dEdgeRise);
  ppovdc->setWritePix(m_bWritePix);

  const double zoom = pCam->getZoom();
  ppovdc->setZoom(zoom);
  ppovdc->setSlabDepth(pCam->getSlabDepth());
  ppovdc->setViewDist(pCam->getCamDist());

  ppovdc->loadIdent();
  ppovdc->rotate(pCam->m_rotQuat);
  ppovdc->translate(-(pCam->m_center));

  // calc line width factor
  int height = getHeight();
  if (height<=0 && pScene->getViewCount()>0) {
    ViewPtr pView = pScene->beginView()->second;
    double hpix = pView->getHeight();
    ppovdc->setLineScale(zoom/hpix);
    ppovdc->setPixSclFac(2.0);
  }
  else {
    MB_DPRINTLN("POV> hint image height=%d", height);
    const double fac = zoom/( double(height)*1.5 );
    MB_DPRINTLN("POV> line scale factor=%f", fac);
    ppovdc->setLineScale(fac);
    ppovdc->setPixSclFac(2.0);
  }

  pScene->display(ppovdc);

  m_strBlendTab = ppovdc->getPostBlendTableJSON();
  if (m_bWritePix)
    m_strImgFileNames = ppovdc->getImgFileNames();

  //ppovdc->endPovRender();
  delete ppovdc;

  // cleanup the created streams
  pOutPov->close();
  pOutInc->close();
  delete pOutPov;
  delete pOutInc;
}

/** name of the writer */
const char *PovSceneExporter::getName() const
{
  return "pov";
}

/** get file-type description */
const char *PovSceneExporter::getTypeDescr() const
{
  return "POV-Ray SDL (*.pov)";
}

/** get file extension */
const char *PovSceneExporter::getFileExt() const
{
  return "*.pov";
}

