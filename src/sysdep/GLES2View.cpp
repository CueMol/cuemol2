// -*-Mode: C++;-*-
//
//  OpenGL ES2 dependent molecular viewer implementation
//

#include <common.h>

#include "GLES2View.hpp"
#include "GLES2DisplayContext.hpp"
#include "OglProgramObject.hpp"
#include "OglError.hpp"

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ViewInputConfig.hpp>

#ifdef USE_GLES2

#include <OpenGLES/ES2/gl.h>
#include <OpenGLES/ES2/glext.h>

using namespace sysdep;
using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::LQuat;
using gfx::DisplayContext;

GLES2View::GLES2View()
  : m_pCtxt(NULL)
{
  setTransMMS(true);
  setRotMMS(true);
}

GLES2View::GLES2View(const GLES2View &r)
{
}

GLES2View::~GLES2View()
{
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
}

//////////////////////////////////////

void GLES2View::setup()
{
  GLES2DisplayContext *pCtxt = new GLES2DisplayContext(this);
  pCtxt->init();
  m_pCtxt = pCtxt;

  ::glEnable(GL_DEPTH_TEST);
  // ::glEnable(GL_CULL_FACE);

  ::glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  ::glEnable(GL_BLEND);

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

void GLES2View::unloading()
{
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
  m_pCtxt = NULL;
}

//////////////////////////////////////
// setup GL rendering

void GLES2View::setFogColorImpl()
{
  // TO DO: fog color impl
}

/// Setup the projection matrix
void GLES2View::setUpProjMat(int cx, int cy)
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
  
  // TO DO: fog impl
  // glFogf(GL_FOG_START, (GLfloat)fognear);
  // glFogf(GL_FOG_END, (GLfloat)fogfar);

  setFogColorImpl();

  float vw = zoom/2.0f;
  float fasp = (float)cx/(float)cy;
  
  // MB_DPRINTLN("CX=%d, CY=%d, Vw=%f, Fasp=%f", cx, cy, vw, fasp);

  glViewport(0, 0, cx, cy);

  slabnear = -100.0;
  slabfar = 100.0;
  GLES2DisplayContext *pdc = static_cast<GLES2DisplayContext *>( getDisplayContext() );
  pdc->loadOrthoProj(-vw*fasp, vw*fasp,
		     -vw, vw, slabnear, slabfar);

  // pdc->loadOrthoProj(-1.0f, 1.0f, -1.5f, 1.5f, -1.0f, 1.0f);

  resetProjChgFlag();
  // glMatrixMode(GL_MODELVIEW);
}

void GLES2View::setUpModelMat(int nid)
{
  gfx::DisplayContext *pdc = getDisplayContext();

  pdc->loadIdent();
  // pdc->translate(Vector4D(0, 0, getViewDist()));
  // glLoadIdentity();
  // glTranslatef(0.0f, 0.0f, -float(getViewDist()) );

  pdc->multMatrix(getRotQuat().toRotMatrix());

  // pdc->translate(getViewCenter());
  // glTranslatef(-float(c.x()), -float(c.y()), -float(c.z()));

  //printf("vc=%f,%f,%f\n", m_viewCenter.x(), m_viewCenter.y(), m_viewCenter.z());
}

void GLES2View::setUpLightColor()
{
  // TO DO: lighting impl.
}

#include "matrix.c"

void GLES2View::drawScene()
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
    return;
  }

  GLES2DisplayContext *pdc = static_cast<GLES2DisplayContext *>( getDisplayContext() );
  pdc->setCurrent();
  OglProgramObject *pDefPO = pdc->getProgramObject("default");
  if (pDefPO==NULL) {
    MB_DPRINTLN("GLES2> Cannot get default program object");
    return;
  }
  pDefPO->enable();

  int cx = getWidth();
  int cy = getHeight();
  glViewport(0, 0, cx, cy);

  gfx::ColorPtr pBgCol = pScene->getBgColor();
  glClearColor(float(pBgCol->fr()), float(pBgCol->fg()), float(pBgCol->fb()), 1.0f);
  setFogColorImpl();
  
  pdc->setLighting(false);

  setUpModelMat(MM_NORMAL);

  // if (isProjChange())
  setUpProjMat(-1, -1);

  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

#if 1
  // Draw main 3D objects
  pScene->display(pdc);
#endif

#if 1
  ////////////////////////////////////////////////
  // debug test: draw a colorcube

  // glClearColor(0.5f, 0.4f, 0.5f, 1.0f);
  // glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

  /*
  static float rotz=0.0f;
  // handle viewing matrices                                                                                   
  GLfloat proj[16], modelview[16], modelviewProj[16];
  // setup projection matrix (orthographic)                                                                    
  mat4f_LoadOrtho(-1.0f, 1.0f, -1.5f, 1.5f, -1.0f, 1.0f, proj);
  // setup modelview matrix (rotate around z)                                                                  
  mat4f_LoadZRotation(rotz, modelview);
  // projection matrix * modelview matrix                                                                      
  mat4f_MultiplyMat4f(proj, modelview, modelviewProj);
  rotz += 3.0f * M_PI / 180.0f;
  // update uniform values                                                                                     
  //glUniformMatrix4fv(uniforms[UNIFORM_MODELVIEW_PROJECTION_MATRIX], 1, GL_FALSE, modelviewProj);
  CLR_GLERROR();
  pDefPO->setMatrix4fv("mvp_matrix", 1, GL_FALSE, modelviewProj);
  for (int i=0; i<16; ++i) {
    MB_DPRINT("%d=%f, ", i, modelviewProj[i]);
  }
  MB_DPRINTLN("");
  CHK_GLERROR("DrawSc setMvpMat");
  */

  GLfloat squareVertices[] = {
    -0.5f, -0.5f, 0.0f,
    0.5f,  -0.5f, 0.0f,
    -0.5f,  0.5f, 0.0f,
    0.5f,   0.5f, 0.0f,
  };
  GLubyte squareColors[] = {
    255, 255,   0, 255,
    0,   255, 255, 255,
    0,     0,   0, 255,
    255,   0, 255, 255,
  };
  // update attribute values                                                                                   
  glVertexAttribPointer(pdc->GLES2_ATTR_VERT, 3, GL_FLOAT, 0, 0, squareVertices);
  CHK_GLERROR("DrawSc VertAttr");
  glEnableVertexAttribArray(pdc->GLES2_ATTR_VERT);
  CHK_GLERROR("DrawSc VertAttr2");
  glVertexAttribPointer(pdc->GLES2_ATTR_COLOR, 4, GL_UNSIGNED_BYTE, 1, 0, squareColors);
  CHK_GLERROR("DrawSc ColorAttr");
  glEnableVertexAttribArray(pdc->GLES2_ATTR_COLOR);
  CHK_GLERROR("DrawSc ColorAttr2");

  pDefPO->validate();

  // draw                                                                                                      
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  CHK_GLERROR("DrawSc DrawArray");
#endif

}

gfx::DisplayContext *GLES2View::getDisplayContext()
{
  return m_pCtxt;
}

#endif

