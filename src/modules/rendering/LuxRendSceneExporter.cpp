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
  m_nHaltSPP = 10000;
  m_sOutputBase = "";
  m_bBgTransp = true;
}

LuxRendSceneExporter::~LuxRendSceneExporter()
{
}

void LuxRendSceneExporter::write()
{
  LuxRendDisplayContext *pdc = MB_NEW LuxRendDisplayContext();

  LString strpath = getPath();
  if (!strpath.isEmpty() && m_sOutputBase.isEmpty()) {
    fs::path path(strpath.c_str());
    m_sOutputBase = path.stem().string();
  }

  // Main stream
  qlib::OutStream *pOut = createOutStream();

  ScenePtr pScene = getClient();

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  pdc->init(pOut, this);
  
  const double zoom = pCam->getZoom();

  pdc->setZoom(zoom);
  pdc->setSlabDepth(pCam->getSlabDepth());
  pdc->setViewDist(pCam->getCamDist());

  pdc->setClipZ(true);
  pdc->setBgColor(pScene->getBgColor());
  pdc->setPerspective(pCam->isPerspec());

  pdc->loadIdent();
  pdc->rotate(pCam->m_rotQuat);
  pdc->translate(-(pCam->m_center));
  
  // calc line width factor
  int height = getHeight();
  if (height<=0 && pScene->getViewCount()>0) {
    ViewPtr pView = pScene->beginView()->second;
    double hpix = pView->getHeight();
    pdc->setLineScale(zoom/hpix);
    pdc->setPixSclFac(2.0);
  }
  else {
    MB_DPRINTLN("LUX> hint image height=%d", height);
    const double fac = zoom/( double(height)*1.5 );
    MB_DPRINTLN("LUX> line scale factor=%f", fac);
    pdc->setLineScale(fac);
    pdc->setPixSclFac(2.0);
  }

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

