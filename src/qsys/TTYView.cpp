// -*-Mode: C++;-*-
//
// TTY dummy View implementation
//

#include <common.h>

#include "TTYView.hpp"
#include "Scene.hpp"

using namespace qsys;

TTYDisplayContext::~TTYDisplayContext() {}

bool TTYDisplayContext::setCurrent() { return true; }
bool TTYDisplayContext::isCurrent() const { return true; }
bool TTYDisplayContext::isFile() const { return true; }

void TTYDisplayContext::vertex(const qlib::Vector4D &) {}
void TTYDisplayContext::normal(const qlib::Vector4D &) {}
void TTYDisplayContext::color(const gfx::ColorPtr &c) {}

void TTYDisplayContext::pushMatrix() {}
void TTYDisplayContext::popMatrix() {}
void TTYDisplayContext::multMatrix(const qlib::Matrix4D &mat) {}
void TTYDisplayContext::loadMatrix(const qlib::Matrix4D &mat) {}

void TTYDisplayContext::setPolygonMode(int id) {}
void TTYDisplayContext::startPoints() {}
void TTYDisplayContext::startPolygon() {}
void TTYDisplayContext::startLines() {}
void TTYDisplayContext::startLineStrip() {}
void TTYDisplayContext::startTriangles() {}
void TTYDisplayContext::startTriangleStrip() {}
void TTYDisplayContext::startTriangleFan() {}
void TTYDisplayContext::startQuadStrip() {}
void TTYDisplayContext::startQuads() {}
void TTYDisplayContext::end() {}
  
//////////
  

TTYView::~TTYView() {}
  
LString TTYView::toString() const { return LString("TTYView"); }

/// Setup the projection matrix for stereo (View interface)
void TTYView::setUpModelMat(int nid) {}

/// Setup projection matrix (View interface)
void TTYView::setUpProjMat(int w, int h) {}
    
/// Draw current scene
void TTYView::drawScene()
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
    return;
  }
      
  gfx::DisplayContext *pdc = getDisplayContext();
  pdc->setCurrent();
  pScene->display(pdc);
}
    
gfx::DisplayContext *TTYView::getDisplayContext() { return m_pCtxt; }
