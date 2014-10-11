// -*-Mode: C++;-*-
//
//  OpenGL ES1.1 dependent molecular viewer implementation
//

#include <common.h>

#include "GLES1View.hpp"
#include "GLES1DisplayContext.hpp"
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ViewInputConfig.hpp>

#include <OpenGLES/ES1/gl.h>
#include <OpenGLES/ES1/glext.h>

using namespace sysdep;
using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::LQuat;
using gfx::DisplayContext;

GLES1View::GLES1View()
  : m_pCtxt(NULL)
{
  setTransMMS(true);
  setRotMMS(true);
}

GLES1View::GLES1View(const GLES1View &r)
{
}

GLES1View::~GLES1View()
{
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
}

//////////////////////////////////////

void GLES1View::setup()
{
  GLES1DisplayContext *pCtxt = new GLES1DisplayContext(this);
  m_pCtxt = pCtxt;

  ::glEnable(GL_DEPTH_TEST);
  ::glEnable(GL_CULL_FACE);

  // ::glEnable(GL_NORMALIZE);
  ::glShadeModel(GL_SMOOTH);
  //glShadeModel(GL_FLAT);

  ::glEnable(GL_LINE_SMOOTH);
  ::glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  ::glEnable(GL_BLEND);

  ::glEnable(GL_FOG);
  ::glFogf(GL_FOG_MODE, GL_LINEAR);
  //::glFogfv(GL_FOG_COLOR, fogColor);

  // setUpProjMat(-1, -1);
  setUpModelMat(0);
  setUpLightColor();

#ifdef MB_DEBUG
  {
    std::string extensions = (const char*) glGetString(GL_EXTENSIONS);
    char* extensionStart = &extensions[0];
    char** extension = &extensionStart;
    MB_DPRINTLN("Supported OpenGL ES Extensions:");
    while (*extension)
      MB_DPRINTLN("\t %s", strsep(extension, " "));
    MB_DPRINTLN("");
  }
#endif
}

void GLES1View::unloading()
{
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
  m_pCtxt = NULL;
}

//////////////////////////////////////
// setup GL rendering

void GLES1View::setFogColorImpl()
{
  GLfloat tmpv[4] = {0.0f, 0.0f, 0.0f, 0.0f};
  qsys::ScenePtr pScene = getScene();
  gfx::ColorPtr pBgCol = pScene->getBgColor();
  tmpv[0] = (GLfloat) pBgCol->fr();
  tmpv[1] = (GLfloat) pBgCol->fg();
  tmpv[2] = (GLfloat) pBgCol->fb();
  glFogfv(GL_FOG_COLOR, tmpv);
}


/// Setup the projection matrix
void GLES1View::setUpProjMat(int cx, int cy)
{
  if (cx<0 || cy<0) {
    cx = getWidth();
    cy = getHeight();
  }
  
  float zoom = getZoom(), dist = getViewDist();
  float slabdepth = getSlabDepth();
  if (slabdepth<=0.1)
    slabdepth = 0.1;
  
  float slabnear = dist-slabdepth/2.0;
  float slabfar  = dist+slabdepth;
  // truncate near slab by camera distance
  if (slabnear<0.1)
    slabnear = 0.1;

  float fognear = dist;
  float fogfar  = dist+slabdepth/2.0;
  if (fognear<1.0)
    fognear = 1.0;
  
  glFogf(GL_FOG_START, (GLfloat)fognear);
  glFogf(GL_FOG_END, (GLfloat)fogfar);

  setFogColorImpl();

  float vw = zoom/2.0f;
  float fasp = (float)cx/(float)cy;
  
  // printf("CX=%d, CY=%d, Vw=%f, Fasp=%f\n", cx, cy, vw, fasp);

  // this is not required in ES2??
  glViewport(0, 0, cx, cy);

  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();

  glOrthof(-vw*fasp, vw*fasp,
	   -vw, vw, slabnear, slabfar);

  /*
  if (!isPerspec()) {
    glOrtho(-vw*fasp, vw*fasp,
            -vw, vw, slabnear, slabfar);
  }
  else {
    float vang = qlib::toDegree<float>(::atan(vw/dist))*2.0;
    //MB_DPRINTLN("fov %f", vang);
    gluPerspective(vang, fasp, slabnear, slabfar);
  }
  */

  resetProjChgFlag();
  glMatrixMode(GL_MODELVIEW);
}

void GLES1View::setUpModelMat(int nid)
{
  GLES1DisplayContext *pdc = (GLES1DisplayContext *) getDisplayContext();

  glLoadIdentity();
  glTranslatef(0.0f, 0.0f, -float(getViewDist()) );

  //pdc->rotate(getRotQuat());
  pdc->multMatrix(getRotQuat().toRotMatrix());

  const qlib::Vector4D c = getViewCenter();
  glTranslatef(-float(c.x()), -float(c.y()), -float(c.z()));

  //printf("vc=%f,%f,%f\n", m_viewCenter.x(), m_viewCenter.y(), m_viewCenter.z());
}

void GLES1View::setUpLightColor()
{
  GLfloat tmpv[4] = {0.0, 0.0, 0.0, 1.0};

  //

  tmpv[0] = 0.2f; //m_ltAmbi.fr();
  tmpv[1] = 0.2f; //m_ltAmbi.fg();
  tmpv[2] = 0.2f; //m_ltAmbi.fb();
  glLightfv(GL_LIGHT0, GL_AMBIENT, tmpv);

  tmpv[0] = 0.8f; //m_ltDiff.fr();
  tmpv[1] = 0.8f; //m_ltDiff.fg();
  tmpv[2] = 0.8f; //m_ltDiff.fb();
  glLightfv(GL_LIGHT0, GL_DIFFUSE, tmpv);

  tmpv[0] = 0.4f; //m_ltSpec.fr();
  tmpv[1] = 0.4f; //m_ltSpec.fg();
  tmpv[2] = 0.4f; //m_ltSpec.fb();
  glLightfv(GL_LIGHT0, GL_SPECULAR, tmpv);

  tmpv[0] = 1.0f;
  tmpv[1] = 1.0f;
  tmpv[2] = 1.5f;
  //tmpv[0] = 0.1f; //-1.0;
  //tmpv[1] = 0.2f; //-1.0;
  //tmpv[2] = 1.0f; //-1.5;
  tmpv[3] = 0.0f;
  glLightfv(GL_LIGHT0, GL_POSITION, tmpv);
  tmpv[3] = 1.0;

  //

  glEnable(GL_LIGHT0);

  // setup easy material

  glMaterialf(GL_FRONT_AND_BACK, GL_SHININESS, 32.0f);
  //glColorMaterial(GL_FRONT_AND_BACK, GL_AMBIENT_AND_DIFFUSE);
  glEnable(GL_COLOR_MATERIAL);
}


void GLES1View::drawScene()
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
    return;
  }

  DisplayContext *pdc = getDisplayContext();
  pdc->setCurrent();

  gfx::ColorPtr pBgCol = pScene->getBgColor();
  glClearColor(float(pBgCol->fr()), float(pBgCol->fg()), float(pBgCol->fb()), 1.0f);
  setFogColorImpl();
  
  pdc->setLighting(false);

  ////////////////////////////////////////////////

  if (isProjChange())
    setUpProjMat(-1, -1);

  setUpModelMat(MM_NORMAL);

  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

  // Draw main 3D objects
  pScene->display(pdc);

#if 0
  ////////////////////////////////////////////////
  // debug test: draw a colorcube

  const float l = 10.0f;
  // Replace the implementation of this method to do your own custom drawing.
  static const GLfloat squareVertices[] = {
    -l, -l, 0,
    l, -l, 0,
    -l,  l, 0,
    l,  l, 0,
  };
  
  static const GLubyte squareColors[] = {
    255, 255,   0, 255,
    0,   255, 255, 255,
    0,     0,   0,   0,
    255,   0, 255, 255,
    };
  
#if 0
  static float transY = 0.0f;
  
  // gfx::ColorPtr pBgCol = pScene->getBgColor();
  // glClearColor(float(pBgCol->fr()), float(pBgCol->fg()), float(pBgCol->fb()), 1.0f);
  glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
  setFogColorImpl();
    
  m_pCtxt->setLighting(false);

  setUpProjMat(-1, -1);
  setUpModelMat(0);
  //glClear(GL_COLOR_BUFFER_BIT);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
#endif
    
  ::glDisable(GL_CULL_FACE);
  glVertexPointer(3, GL_FLOAT, 0, squareVertices);
  glEnableClientState(GL_VERTEX_ARRAY);
  glColorPointer(4, GL_UNSIGNED_BYTE, 0, squareColors);
  glEnableClientState(GL_COLOR_ARRAY);
    
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  ::glEnable(GL_CULL_FACE);
#endif
}

gfx::DisplayContext *GLES1View::getDisplayContext()
{
  return m_pCtxt;
}

/*
Equivalent for glOrtho
Is this for GLES2 impl??
void GLES1View::makeOrthoProj(float left, float right, float bottom, float top)
{
  float dx = right - left;
  float dy = top - bottom;
  float dz = 0;
 
  float tx = (dx != 0) ? -(right + left) / dx : 0;
  float ty = (dy != 0) ? -(top + bottom) / dy : 0;
  float tz = 0;
 
 
  // reinit with unit matrix
  m_projMat = qlib::Matrix4D();
 
  m_projMat.aij(1,1) = 2.0 / dx;
  m_projMat.aij(2,2) = 2.0 / dy;
  m_projMat.aij(3,3) = -2.0 / dz;


  m_projMat.aij(1,4) = tx;
  m_projMat.aij(2,4) = ty;
  m_projMat.aij(3,4) = tz;
      
}
*/
