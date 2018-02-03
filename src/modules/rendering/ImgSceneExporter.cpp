// -*-Mode: C++;-*-
//
// Image scene output class
//
// $Id: ImgSceneExporter.cpp,v 1.2 2011/03/13 12:02:45 rishitani Exp $

#include <common.h>

#include "ImgSceneExporter.hpp"


#include <qlib/FileStream.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>

using namespace render;
using gfx::DisplayContext;
using qsys::View;
using qsys::ViewPtr;
using qsys::Scene;
using qsys::ScenePtr;
using qsys::CameraPtr;

ImgSceneExporter::ImgSceneExporter()
     : m_nWidth(500), m_nHeight(500), m_nIter(0), m_nAAOpt(0)
{
}

ImgSceneExporter::~ImgSceneExporter()
{
}

void ImgSceneExporter::write()
{
  ScenePtr pScene = getClient();

  int height = getHeight();
  int width = getWidth();
  int aa_opt = getAAOpt();

  // get the initial view
  Scene::ViewIter vi = pScene->beginView();
  if (vi==pScene->endView()) {
    // ERROR: No view is defined
    MB_THROW(qlib::RuntimeException, "No view is attached to the scene.");
    return;
  }
  ViewPtr pView = vi->second;

  View *pImgView = pView->createOffScreenView(width, height, aa_opt);
  if (pImgView==NULL) {
    MB_THROW(qlib::RuntimeException, "Current view does not suuport off-screen rendering.");
    return;
  }
  pImgView->setSceneID(pScene->getUID());

  // Setup view params
  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());
  pImgView->setCamera(pCam);

  // Draw the scene
  pImgView->drawScene();

  // int nBandSize = 4 * ((3 * width + 3) / 4);

  char *pbuf = NULL;
  LString filename = getPath();

  int ncomp = (m_bUseAlpha)?4:3;
  
  try {
    int nBufSize = prepare(filename);
    pbuf = MB_NEW char[nBufSize];
    // qlib::FileOutStream fos;
    // fos.open(filename);

    int posx, posy;
    int width, height;
    while (request(posx, posy, width, height)) {
      pImgView->readPixels(posx, posy, width, height,
                          pbuf, nBufSize, ncomp);
      writeData(pbuf, nBufSize);
    }
  }
  catch (...) {
    completed();
    if (pbuf!=NULL)
      delete [] pbuf;
    delete pImgView;
    // restore view settings
    DisplayContext *pdc = pView->getDisplayContext();
    pView->setUpProjMat(-1, -1);
    throw;
  }

  completed();
  delete [] pbuf;
  delete pImgView;

  // restore view settings
  DisplayContext *pdc = pView->getDisplayContext();
  pView->setUpProjMat(-1, -1);


/*
  LString str_povpath = getPath();
  LString str_incpath = getPath("inc");
  
  // Main stream
  qlib::OutStream *pOutPov = createOutStream();

  ScenePtr pScene = getClient();

  CameraPtr pCam = pScene->getCamera(m_cameraName);
  qlib::ensureNotNull(pCam.get());

  // ppovdc->setTargetView(pView);
  ppovdc->init(pOutPov, pOutInc);
  //ppovdc->startPovRender();
  
  ppovdc->setTexBlend(m_bTexBlend);
  ppovdc->setPerspective(m_bPerspective);
  ppovdc->setViewDist(200.0);
  ppovdc->setBgColor(pScene->getBgColor());

  ppovdc->setZoom(pCam->m_fZoom);
  ppovdc->setSlabDepth(pCam->m_fSlabDepth);

  ppovdc->loadIdent();
  ppovdc->rotate(pCam->m_rotQuat);
  ppovdc->translate(-(pCam->m_center));
  
  pScene->display(ppovdc);

  //ppovdc->endPovRender();
  delete ppovdc;

  // cleanup the created streams
  pOutPov->close();
  pOutInc->close();
  delete pOutPov;
  delete pOutInc;
*/
}

/** name of the writer */
const char *ImgSceneExporter::getName() const
{
  return "raw";
}

/** get file-type description */
const char *ImgSceneExporter::getTypeDescr() const
{
  return "Raw RGB image (*.raw)";
}

/** get file extension */
const char *ImgSceneExporter::getFileExt() const
{
  return "*.raw";
}

///////////////////////////////////////////////

int ImgSceneExporter::prepare(const char *filename)
{
  m_pfos = MB_NEW qlib::FileOutStream;
  m_pfos->open(filename);
  m_nIter = 0;

  if (m_bUseAlpha)
    return 4 * getWidth();

  return 4 * ((3 * getWidth() + 3) / 4);
}

bool ImgSceneExporter::request(int &posx, int &posy, int &width, int &height)
{
  if (m_nIter>=getHeight())
    return false;
  
  posx = 0;
  posy = getHeight()-1 - m_nIter;
  width = getWidth();
  height = 1;
  ++m_nIter;

  return true;
}

void ImgSceneExporter::writeData(const char *pbuf, int nsize)
{
  m_pfos->write(pbuf, 0, nsize);
}

void ImgSceneExporter::completed()
{
  if (m_pfos==NULL) return;
  m_pfos->close();
  delete m_pfos;
  m_pfos = NULL;
}


qlib::OutStream *ImgSceneExporter::getOutStream() const
{
  return m_pfos;
}

