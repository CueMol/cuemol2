// -*-Mode: C++;-*-
//
// STL (Stereolithography) scene output class
//

#include <common.h>

#include "StlSceneExporter.hpp"

#include "StlDisplayContext.hpp"
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

StlSceneExporter::StlSceneExporter()
     : SceneExporter()
{
}

StlSceneExporter::~StlSceneExporter()
{
}

void StlSceneExporter::write()
{
  StlDisplayContext *pstldc = MB_NEW StlDisplayContext();

  // Main stream
  qlib::OutStream *pOutStl = createOutStream();

  ScenePtr pScene = getClient();

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  pstldc->init(pOutStl);
  
  pstldc->setZoom(pCam->getZoom());
  pstldc->setSlabDepth(pCam->getSlabDepth());
  pstldc->setViewDist(pCam->getCamDist());

  pstldc->loadIdent();
  pstldc->rotate(pCam->m_rotQuat);
  pstldc->translate(-(pCam->m_center));
  
  pScene->display(pstldc);

  delete pstldc;

  // cleanup the created streams
  pOutStl->close();
  delete pOutStl;
}

/// name of the writer
const char *StlSceneExporter::getName() const
{
  return "stl";
}

/// get file-type description
const char *StlSceneExporter::getTypeDescr() const
{
  return "StereoLithography (*.stl)";
}

/// get file extension
const char *StlSceneExporter::getFileExt() const
{
  return "*.stl";
}

