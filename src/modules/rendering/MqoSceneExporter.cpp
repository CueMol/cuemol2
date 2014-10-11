// -*-Mode: C++;-*-
//
// Metaseq scene output class
//

#include <common.h>

#include "MqoSceneExporter.hpp"

#include "MqoDisplayContext.hpp"
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

MqoSceneExporter::MqoSceneExporter()
     : SceneExporter()
{
  m_nGradSteps = 16;
}

MqoSceneExporter::~MqoSceneExporter()
{
}

void MqoSceneExporter::write()
{
  MqoDisplayContext *pmqodc = MB_NEW MqoDisplayContext();

  ScenePtr pScene = getClient();

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  // Main stream
  qlib::OutStream *pOutMqo = createOutStream();

  pmqodc->init(pOutMqo);
  
  pmqodc->setGradSteps(m_nGradSteps);
  pmqodc->setClipZ(m_bUseClipZ);
  pmqodc->setPerspective(m_bPerspective);
  pmqodc->setBgColor(pScene->getBgColor());

  pmqodc->setZoom(pCam->getZoom());
  pmqodc->setSlabDepth(pCam->getSlabDepth());
  pmqodc->setViewDist(pCam->getCamDist());

  pmqodc->loadIdent();
  pmqodc->rotate(pCam->m_rotQuat);
  pmqodc->translate(-(pCam->m_center));
  
  pScene->display(pmqodc);

  delete pmqodc;

  // cleanup the created streams
  pOutMqo->close();
  delete pOutMqo;
}

/** name of the writer */
const char *MqoSceneExporter::getName() const
{
  return "mqo";
}

/** get file-type description */
const char *MqoSceneExporter::getTypeDescr() const
{
  return "Metasequoia object file (*.mqo)";
}

/** get file extension */
const char *MqoSceneExporter::getFileExt() const
{
  return "*.mqo";
}

