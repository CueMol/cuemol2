// -*-Mode: C++;-*-
//
// LuxRender scene output class
//

#include <common.h>

#include "LuxRendSceneExporter.hpp"

#include "LuxRendDisplayContext.hpp"
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

LuxRendSceneExporter::LuxRendSceneExporter()
     : SceneExporter()
{
  m_nHaltSPP = 50000;
  m_sOutputBase = "";
}

LuxRendSceneExporter::~LuxRendSceneExporter()
{
}

void LuxRendSceneExporter::write()
{
  LuxRendDisplayContext *pdc = MB_NEW LuxRendDisplayContext();

  // Main stream
  qlib::OutStream *pOut = createOutStream();

  ScenePtr pScene = getClient();

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  pdc->init(pOut, this);
  
  pdc->setZoom(pCam->getZoom());
  pdc->setSlabDepth(pCam->getSlabDepth());
  pdc->setViewDist(pCam->getCamDist());

  pdc->loadIdent();
  pdc->rotate(pCam->m_rotQuat);
  pdc->translate(-(pCam->m_center));
  
  pScene->display(pdc);

  delete pdc;

  // cleanup the created streams
  pOut->close();
  delete pOut;
}

/// name of the writer
const char *LuxRendSceneExporter::getName() const
{
  return "luxrend";
}

/// get file-type description
const char *LuxRendSceneExporter::getTypeDescr() const
{
  return "LuxRender Scene (*.lxs)";
}

/// get file extension
const char *LuxRendSceneExporter::getFileExt() const
{
  return "*.lxs";
}

