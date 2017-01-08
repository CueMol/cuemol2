// -*-Mode: C++;-*-
//
//  OpenGL dependent molecular viewer implementation
//
//  $Id: OglView.cpp,v 1.41 2011/03/13 12:02:45 rishitani Exp $

#include <common.h>

#ifdef HAVE_GL_GLEW_H
#  include <GL/glew.h>
#endif

#ifdef HAVE_GL_GL_H
#  include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#  include <OpenGL/gl.h>
#else
#  error no gl.h
#endif

#ifdef HAVE_GL_GLU_H
#  include <GL/glu.h>
#elif defined(HAVE_OPENGL_GLU_H)
#  include <OpenGL/glu.h>
#else
#  error no glu.h
#endif

#include "OglView.hpp"

#include <qlib/Utils.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ViewInputConfig.hpp>

#ifdef HAVE_OGL_FBO
#include "OglFBOView.hpp"
#endif

#include "OglDisplayContext.hpp"
#include "OglViewCap.hpp"

#include <gfx/HittestContext.hpp>

using gfx::DisplayContext;
using namespace sysdep;
using qsys::Renderer;
using qsys::Object;
using qsys::Camera;
using qsys::SceneManager;

OglView::OglView()
{
  m_bInitOK = false;
  m_bUseGlShader = false;
  m_pqua = gluNewQuadric();
}

OglView::~OglView()
{
  // delete [] m_pHitBuf;
  if (m_pqua!=NULL)
    gluDeleteQuadric(m_pqua);
}

LString OglView::toString() const
{
  return LString::format("OpenGL View(%p)", this);
}

void OglView::setup()
{
  if (!safeSetCurrent()) return;

  glEnable(GL_DEPTH_TEST);
  glEnable(GL_CULL_FACE);

  glClearDepth(1.0f);

  glEnable(GL_NORMALIZE);
  glShadeModel(GL_SMOOTH);
  //glShadeModel(GL_FLAT);

  glEnable(GL_LINE_SMOOTH);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glEnable(GL_BLEND);

  //glDisable(GL_LINE_SMOOTH);
  //glDisable(GL_BLEND);

  GLfloat fogColor[4] = {0, 0, 0, 1.0};

  glEnable(GL_FOG);
  glFogi(GL_FOG_MODE, GL_LINEAR);
  glFogfv(GL_FOG_COLOR, fogColor);

  setUpProjMat(-1, -1);
  setUpLightColor();

  // clear();
  MB_DPRINTLN("OglView::setup() OK.");

#ifdef HAVE_GLEW
  GLenum err = glewInit();
  if (GLEW_OK != err) {
    LOG_DPRINTLN("OglView> glewInit failed!!");
  }
  else {
    MB_DPRINTLN("OglView> glewInit OK.");
  }
#endif

  // set view capability flag object
  {
    OglViewCap *pVC = new OglViewCap();
    if (!m_bUseGlShader) {
      pVC->disableShader();
      LOG_DPRINTLN("OglView> shaders disabled");
    }
    setViewCap(pVC);
  }

  OglDisplayContext *pdc = static_cast<OglDisplayContext *>( getDisplayContext() );
  try {
    pdc->init();
  }
  catch (qlib::LException &e) {
    LOG_DPRINTLN("Exception: %s", e.getMsg().c_str());
    LOG_DPRINTLN("OglDispCtxt init() failed!!");
    setViewCap( NULL );
  }
  catch (...) {
    LOG_DPRINTLN("OglDispCtxt init() failed!!");
    setViewCap( NULL );
  }

  if (useSclFac())
    pdc->setPixSclFac(getSclFacX());
}

//#define CHK_GLERROR(MSG)						\
//{ GLenum errc; errc = glGetError(); MB_DPRINTLN("%s GLError: %s", MSG, gluErrorString(errc)); }

#define CHK_GLERROR(MSG) {}

// setup the projection matrix
void OglView::setUpProjMat(int cx, int cy)
{
  GLenum errc;

  DisplayContext *pdc = getDisplayContext();
  pdc->setCurrent();

  if (cx<0 || cy<0) {
    cx = getWidth();
    cy = getHeight();
  }
  
  double zoom = (double) getZoom(), dist = (double) getViewDist();
  double slabdepth = (double) getSlabDepth();
  if (slabdepth<=0.1)
    slabdepth = 0.1;
  
  double slabnear = dist-slabdepth/2.0;
  double slabfar  = dist+slabdepth;
  // truncate near slab by camera distance
  if (slabnear<0.1)
    slabnear = 0.1;

  double fognear = dist;
  double fogfar  = dist+slabdepth/2.0;
  if (fognear<1.0)
    fognear = 1.0;
  
  glFogf(GL_FOG_START, (GLfloat)fognear);
  glFogf(GL_FOG_END, (GLfloat)fogfar);

  setFogColorImpl();

  //MB_DPRINTLN("Zoom=%f", zoom);
  double vw = zoom/2.0f;
  double fasp = (double)cx/(double)cy;
  
  MB_DPRINTLN("OglView.setUpProjMat> CX=%d, CY=%d, Vw=%f, Fasp=%f", cx, cy, vw, fasp);

  int bcx = convToBackingX(cx);
  int bcy = convToBackingY(cy);
  
  MB_DPRINTLN("OglView.setUpProjMat> BCX=%d, BCY=%d", bcx, bcy);

  if (getStereoMode()==Camera::CSM_PARA ||
      getStereoMode()==Camera::CSM_CROSS) {
    fasp /= 2.0f;
    glViewport(0, 0, bcx/2, bcy);
  }
  else {
    glViewport(0, 0, bcx, bcy);
  }

  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();

  if (!isPerspec()) {
    glOrtho(-vw*fasp, vw*fasp,
            -vw, vw, slabnear, slabfar);
  }
  else {
    double vang = qlib::toDegree<double>(::atan(vw/dist))*2.0;
    //MB_DPRINTLN("fov %f", vang);
    gluPerspective(vang, fasp, slabnear, slabfar);
  }
  
  resetProjChgFlag();
  glMatrixMode(GL_MODELVIEW);
}

void OglView::setFogColorImpl()
{
  GLfloat tmpv[4] = {0.0f, 0.0f, 0.0f, 0.0f};
  qsys::ScenePtr pScene = getScene();
  gfx::ColorPtr pBgCol = pScene->getBgColor();
  tmpv[0] = (GLfloat) pBgCol->fr();
  tmpv[1] = (GLfloat) pBgCol->fg();
  tmpv[2] = (GLfloat) pBgCol->fb();
  glFogfv(GL_FOG_COLOR, tmpv);
  CHK_GLERROR("4");
}

void OglView::setUpModelMat(int nid)
{
  DisplayContext *pdc = getDisplayContext();

  glLoadIdentity();
  glTranslated(0,0,-getViewDist());

  double sd = getStereoDist();

  switch (nid) {
  case MM_NORMAL:
    break;

  case MM_STEREO_RIGHT:
    glRotated(-sd,0,1,0);
    break;
    
  case MM_STEREO_LEFT:
    glRotated(sd,0,1,0);
    break;
    
  default:
    break;
  }

  pdc->rotate(getRotQuat());

  const qlib::Vector4D c = getViewCenter();
  glTranslated(-c.x(), -c.y(), -c.z());
}

void OglView::setUpLightColor()
{
  //if (pdc==NULL) pdc = getDisplayContext();
  //pdc->setCurrent();

  GLfloat tmpv[4] = {0.0, 0.0, 0.0, 1.0};

/*
  tmpv[0] = 0.2f; //m_ltAmbi.fr();
  tmpv[1] = 0.2f; //m_ltAmbi.fg();
  tmpv[2] = 0.2f; //m_ltAmbi.fb();
  glLightfv(GL_LIGHT1, GL_AMBIENT, tmpv);

  tmpv[0] = 0.8f; //m_ltDiff.fr();
  tmpv[1] = 0.8f; //m_ltDiff.fg();
  tmpv[2] = 0.8f; //m_ltDiff.fb();
  glLightfv(GL_LIGHT1, GL_DIFFUSE, tmpv);

  tmpv[0] = 0.4f; //m_ltSpec.fr();
  tmpv[1] = 0.4f; //m_ltSpec.fg();
  tmpv[2] = 0.4f; //m_ltSpec.fb();
  glLightfv(GL_LIGHT1, GL_SPECULAR, tmpv);

  tmpv[0] = 1.0f;
  tmpv[1] = 1.0f;
  tmpv[2] = 1.5f;
  tmpv[3] = 0.0f;
  glLightfv(GL_LIGHT1, GL_POSITION, tmpv);
  tmpv[3] = 1.0;
*/
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
  glColorMaterial(GL_FRONT_AND_BACK, GL_AMBIENT_AND_DIFFUSE);
  glEnable(GL_COLOR_MATERIAL);
}

void OglView::drawScene()
{
  if (!m_bInitOK) return;
  if (!safeSetCurrent()) return;

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

  switch (getStereoMode()) {
  default:
  case Camera::CSM_NONE:
    setUpModelMat(MM_NORMAL);
    glDrawBuffer(GL_BACK);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    // Draw main 3D objects
    pScene->display(pdc);
    break;

    ////////////////////////////////////////////////
    // Quad-buffer stereo
  case Camera::CSM_HW_QBUF:

    // for right eye
    setUpModelMat(MM_STEREO_RIGHT);
    if (isSwapStereoEyes())
      glDrawBuffer(GL_BACK_LEFT);
    else
      glDrawBuffer(GL_BACK_RIGHT);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    // Draw main 3D objects
    pScene->display(pdc);

    // for left eye
      setUpModelMat(MM_STEREO_LEFT);
    if (isSwapStereoEyes())
      glDrawBuffer(GL_BACK_RIGHT);
    else
      glDrawBuffer(GL_BACK_LEFT);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    // Draw main 3D objects
    pScene->display(pdc);

    break;
  }
  
  ////////////////////////////////////////////////

  if (getCenterMark()==Camera::CCM_AXIS||
      getCenterMark()==Camera::CCM_CUBE) {
    const qlib::Vector4D c = getViewCenter();
    glTranslated(c.x(), c.y(), c.z());

    const double dsize = 1.0;
    ::glLineWidth(1.0);
    ::glDisable(GL_LIGHTING);
    ::glDisable(GL_LINE_SMOOTH);
    ::glColor3d(1.0-pBgCol->fr(), 1.0-pBgCol->fg(), 1.0-pBgCol->fb());

    if (getCenterMark()==Camera::CCM_AXIS) {
      ::glBegin(GL_LINES);
      ::glVertex3d(dsize,0,0);
      ::glVertex3d(0,0,0);
      ::glVertex3d(0,dsize,0);
      ::glVertex3d(0,0,0);
      ::glVertex3d(0,0,dsize);
      ::glVertex3d(0,0,0);
      ::glEnd();
    }
    else if (getCenterMark()==Camera::CCM_CUBE) {
      // XXX
    }
    
    ::glEnable(GL_LINE_SMOOTH);

  }
  
  // Display UI drawing objects
  View::showDrawObj(pdc);

  // Draw 2D objects
  {
    int w = getWidth();
    int h = getHeight();
    
    float slabdepth = (float)getSlabDepth();
    if (slabdepth<=0.1f)
      slabdepth = 0.1f;
    float dist = (float)getViewDist();
    float slabnear = dist-slabdepth/2.0f;
    
    glMatrixMode(GL_PROJECTION);
    glPushMatrix();
    glLoadIdentity();
    glOrtho(0,w, h,0, dist+1.0, -dist-1.0); //-slabnear+1.0, -slabnear-1.0);
    glMatrixMode(GL_MODELVIEW);
    
    glDrawBuffer(GL_BACK);
    glDisable(GL_CULL_FACE);
    pdc->pushMatrix();
    pdc->loadIdent();
    ::glTranslated(0,0, -dist); //slabnear);
    
    ::glDisable(GL_LIGHTING);
    ::glDisable(GL_LINE_SMOOTH);

    if (getCenterMark()==Camera::CCM_CROSS) {
      const double dsize = 10.0;
      pdc->pushMatrix();
      ::glTranslated(w/2.0, h/2.0, 0); //slabnear);
      ::glLineWidth( convToBackingX( 1 ) );
      ::glBegin(GL_LINES);
      ::glColor3d(1.0-pBgCol->fr(), 1.0-pBgCol->fg(), 1.0-pBgCol->fb());
      ::glVertex3d(dsize,0,0);
      ::glVertex3d(-dsize,0,0);
      ::glVertex3d(0,dsize,0);
      ::glVertex3d(0,-dsize,0);
      ::glEnd();
      pdc->popMatrix();
    }

    // Display 2D-UI drawing objects
    View::showDrawObj2D(pdc);

    ::glEnable(GL_LINE_SMOOTH);
    ::glEnable(GL_CULL_FACE);
    pdc->popMatrix();
    glMatrixMode(GL_PROJECTION);
    glPopMatrix();
    glMatrixMode(GL_MODELVIEW);
  }  

  /// Complete the rendering operations
  glFinish();

  swapBuffers();

  // pdc->unsetCurrent();
  // m_bBusy = FALSE;

  return;
}

//////////////////////////////////////////////////////////////////////////////
// Hittest Impl

#ifndef USE_GL_SELECTION
using gfx::HittestContext;

LString OglView::hitTest(int ax, int ay)
{
  int x = convToBackingX(ax);
  int y = convToBackingY(ay);

  HittestContext *phc = MB_NEW HittestContext();

  double dHitPrec = convToBackingX( qsys::ViewInputConfig::getInstance()->getHitPrec() );

  // Perform hittest (single hit)
  if ( !hitTestImpl(phc, Vector4D(x, y, dHitPrec, dHitPrec), false, 1.0) )
    return LString();

  /*
  int nrend = m_hitdata.getRendSize();
  if (nrend==0) // no hit
    return LString();
    
  MB_DPRINTLN("OglView.hitTest> hit nrend=%d", nrend);
  qlib::uid_t rend_id;
  // qlib::Array<qlib::uid_t> rend_ids(nrend);
  m_hitdata.getRendArray(&rend_id, 1);
  // m_hitdata.getRendArray(rend_ids.data(), nrend);

  qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
  if (pRend.isnull()) {
    LOG_DPRINTLN("FATAL ERROR: Unknown renderer id %d", rend_id);
    return LString();
  }

  qlib::uid_t sceneid = pRend->getSceneID();
  qlib::uid_t objid = pRend->getClientObjID();

  qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
  if (pObj.isnull()) {
    LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
    return LString();
  }

  MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);
  */

  LString rval;
  /*{
    rval += "{";
    rval += pRend->interpHit(m_hitdata);
    rval += LString::format("\"scene_id\": %d,\n", sceneid);
    rval += LString::format("\"rend_id\": %d,\n", rend_id);
    rval += LString::format("\"rendtype\": \"%s\",\n", pRend->getTypeName());
    rval += LString::format("\"rend_name\": \"%s\",\n", pRend->getName().c_str());
    rval += LString::format("\"obj_id\": %d,\n", objid);
    rval += LString::format("\"obj_name\": \"%s\"\n", pObj->getName().c_str());
    rval += "}";
    }*/
  return rval;
}

LString OglView::hitTestRect(int ax, int ay, int aw, int ah, bool bNearest)
{
  return LString();
}

bool OglView::hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm,
			  bool fGetAll, double far_factor)
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("hitTest: invalid scene %d !!", getSceneID());
    return false;
  }

  HittestContext *phc = static_cast<HittestContext *>(pdc);

  // setUpHitProjMat(pdc, parm, far_factor);
  double slabdepth = getSlabDepth();
  if (slabdepth<=0.1)
    slabdepth = 0.1;
      
  const double zoom = getZoom();
  const double dist = getViewDist();
      
  const double slabnear = dist-slabdepth/2.0f;
  const double slabfar  = dist+slabdepth*far_factor;
  const double vw = zoom/2.0;
  const double cx = convToBackingX( getWidth() );
  const double cy = convToBackingY( getHeight() );
  const double fasp = cx/cy;
  
  const double left = -vw*fasp;
  const double right = vw*fasp;
  const double bottom = -vw;
  const double top = vw;
  const double nearVal = slabnear;
  const double farVal = slabfar;
  
  // GLint viewport[4] = {0, 0, GLint(cx), GLint(cy)};
  // gluPickMatrix((GLfloat)parm.x(), (GLfloat)(cy - parm.y()),parm.z(), parm.w(), viewport);
  const double pickx = parm.x();
  const double picky = cy - parm.y();
  const double deltax = parm.z();
  const double deltay = parm.w();
  Matrix4D pickmat;
  pickmat.aij(1,1) = cx / deltax;
  pickmat.aij(2,2) = cy / deltay;
  pickmat.aij(3,3) = 1.0;;
  pickmat.aij(1,4) = (cx - 2.0*pickx) / deltax;
  pickmat.aij(2,4) = (cy - 2.0*picky) / deltay;
  pickmat.aij(3,4) = 1.0;
      
  //glOrtho(-vw*fasp, vw*fasp,
  //-vw, vw, slabnear, slabfar);
  Matrix4D orthmat;
  orthmat.aij(1,1) = 2.0/(right-left);
  orthmat.aij(2,2) = 2.0/(top-bottom);
  orthmat.aij(3,3) = -2.0/(farVal-nearVal);
  orthmat.aij(1,4) = - (right+left)/(right-left);
  orthmat.aij(2,4) = - (top+bottom)/(top-bottom);
  orthmat.aij(3,4) = - (farVal+nearVal)/(farVal-nearVal);
  orthmat.aij(4,4) = 1.0;
  
  //phc->m_projMat = orthmat.mul(pickmat);
  phc->m_projMat = pickmat.mul(orthmat);

  // 0 == no stereo
  // setUpModelMat(MM_NORMAL);
  phc->loadIdent();
  phc->translate(Vector4D(0,0,-getViewDist()));
  phc->rotate(getRotQuat());
  const qlib::Vector4D c = getViewCenter();
  phc->translate(-c);

  pScene->processHit(phc);

  //phc->dump();

  return true;
}
#endif

#ifdef USE_GL_SELECTION
//////////////////////////////////////////////////////////////////////////////
// Hittest Using OpenGL Selection buffer

// Setup the projection matrix for hit-testing
void OglView::setUpHitProjMat(gfx::DisplayContext *pdc, const Vector4D &parm, double far_factor)
{
  double slabdepth = (double) getSlabDepth();
  if (slabdepth<=0.1f)
    slabdepth = 0.1f;
  
  double zoom = (double) getZoom(), dist = (double) getViewDist();

  // double fHitPrec = 10.0; //(double) getHitPrec();
  double slabnear = dist-slabdepth/2.0f;
  double slabfar  = dist+slabdepth*far_factor;
  double vw = zoom/2.0f;
  // double cx = getWidth();
  // double cy = getHeight();
  double cx = convToBackingX( getWidth() );
  double cy = convToBackingY( getHeight() );
  double fasp = cx/cy;
  
  /*
  if (getStereoMode()==STEREO_PARA ||
      getStereoMode()==STEREO_CROSS) {
    fasp /= 2.0f;
    //glViewport(0, 0, cx/2, cy);
  }
  else {
    //glViewport(0, 0, cx, cy);
  }
  */

  // initialize proj matrix with ident mat
  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();
  
  // setup pick matrix
  // GLint viewport[4] = {0, 0, getWidth(), getHeight()};
  GLint viewport[4] = {0, 0, GLint(cx), GLint(cy)};

  // glGetIntegerv(GL_VIEWPORT, viewport);
  gluPickMatrix((GLfloat)parm.x(), (GLfloat)(cy - parm.y()),
                parm.z(), parm.w(), viewport);

  // set projection matrix
  if (!isPerspec()) {
    glOrtho(-vw*fasp, vw*fasp,
            -vw, vw, slabnear, slabfar);
  }
  else {
    //double vang = qlib::toDegree(::atan(vw/dist));
    double vang = qlib::toDegree<double>(::atan(vw/dist))*2.0;
    gluPerspective(vang, fasp, slabnear, slabfar);
  }

  glMatrixMode(GL_MODELVIEW);
}

bool OglView::hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll, double far_factor)
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("hitTest: invalid scene %d !!", getSceneID());
    return false;
  }

  ///////////////////////////////////
  // DEBUG
#if 0
  {
    gfx::ColorPtr pBgCol = pScene->getBgColor();
    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
    
    glDrawBuffer(GL_BACK);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    setUpModelMat(0);
    
    pdc->setLighting(false);
    glDisable(GL_FOG);
    glDisable(GL_LINE_SMOOTH);
    glDisable(GL_BLEND);
    //pdc->pushName(0);
    pScene->processHit(pdc);
    glFinish();
    glEnable(GL_FOG);
    glEnable(GL_LINE_SMOOTH);
    glEnable(GL_BLEND);

    unsigned char pbuf[1024], pix;
    for (int i=0; i<sizeof pbuf; ++i) {
      pbuf[i] = 0;
    }
    glPixelStorei(GL_PACK_ALIGNMENT ,1);
    glReadBuffer( GL_BACK );

    int cx = getWidth();
    int cy = getHeight();
    MB_DPRINTLN("x=%d, y=%d, cy=%d", x, y, cy);
    glReadPixels(x, cy-y, 10, 10, GL_RGB, GL_UNSIGNED_BYTE, pbuf);

    for (int i=9; i>=0; --i) {
      for (int j=0; j<10; ++j) {
        pix = pbuf[(i*10+j)*3+0];
        MB_DPRINT("%02X", int(pix));
        pix = pbuf[(i*10+j)*3+1];
        MB_DPRINT("%02X", int(pix));
        pix = pbuf[(i*10+j)*3+2];
        MB_DPRINT("%02X ", int(pix));
      }
      MB_DPRINT("\n");
    }
    swapBuffers();
  }
#endif

  ///////////////////////////////////
  //  setup GL's selection buffer
  
  //glSelectBuffer(GlHitData::HITBUF_SIZE, m_hitdata.m_pHitBuf);
  m_hitdata.setSelectBuffer();
  m_hitdata.clear();
  glRenderMode(GL_SELECT);

  glInitNames();
  glPushName(-1);

  setUpHitProjMat(pdc, parm, far_factor);
  // 0 == no stereo
  setUpModelMat(MM_NORMAL);

  //pdc->pushName(0);
  pScene->processHit(pdc);
  glFlush();

  GLint hit = glRenderMode(GL_RENDER);
  if (hit<0) {
    MB_DPRINTLN("Hittest> selection buffer overflow");
  }
  setUpProjMat(-1, -1);
  // gfx::Hittest *pRes = NULL;

  if (fGetAll) {
    if (!m_hitdata.createAllFromGlBuf(hit))
      return false;
  }
  else {
    if (!m_hitdata.createFromGlBuf(hit))
      return false;
  }

  return true;
}

LString OglView::hitTest(int ax, int ay)
{
  int x = convToBackingX(ax);
  int y = convToBackingY(ay);

  DisplayContext *pdc = getDisplayContext();
  pdc->setCurrent();

  double dHitPrec = convToBackingX( qsys::ViewInputConfig::getInstance()->getHitPrec() );

  // Perform hittest (single hit)
  if ( !hitTestImpl(pdc, Vector4D(x, y, dHitPrec, dHitPrec), false, 1.0) )
    return LString();

  int nrend = m_hitdata.getRendSize();
  if (nrend==0) // no hit
    return LString();
    
  MB_DPRINTLN("OglView.hitTest> hit nrend=%d", nrend);
  qlib::uid_t rend_id;
  // qlib::Array<qlib::uid_t> rend_ids(nrend);
  m_hitdata.getRendArray(&rend_id, 1);
  // m_hitdata.getRendArray(rend_ids.data(), nrend);

  qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
  if (pRend.isnull()) {
    LOG_DPRINTLN("FATAL ERROR: Unknown renderer id %d", rend_id);
    return LString();
  }

  qlib::uid_t sceneid = pRend->getSceneID();
  qlib::uid_t objid = pRend->getClientObjID();

  qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
  if (pObj.isnull()) {
    LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
    return LString();
  }

  MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);

  {
    LString rval;
    rval += "{";

    rval += pRend->interpHit(m_hitdata);

    rval += LString::format("\"scene_id\": %d,\n", sceneid);
    rval += LString::format("\"rend_id\": %d,\n", rend_id);
    rval += LString::format("\"rendtype\": \"%s\",\n", pRend->getTypeName());
    rval += LString::format("\"rend_name\": \"%s\",\n", pRend->getName().c_str());
    rval += LString::format("\"obj_id\": %d,\n", objid);
    rval += LString::format("\"obj_name\": \"%s\"\n", pObj->getName().c_str());
    rval += "}";

    return rval;
  }
}

LString OglView::hitTestRect(int ax, int ay, int aw, int ah, bool bNearest)
{
  int x = convToBackingX(ax);
  int y = convToBackingY(ay);
  int w = convToBackingX(aw);
  int h = convToBackingY(ah);

  DisplayContext *pdc = getDisplayContext();
  pdc->setCurrent();

  double cnx = double(x) + double(w)/2.0;
  double cny = double(y) + double(h)/2.0;

  // Perform hittest (multiple hit)
  if ( !hitTestImpl(pdc, Vector4D(cnx, cny, w, h), true, 0.5) )
    return LString();

  int nrend = m_hitdata.getRendSize();
  if (nrend==0) // no hit
    return LString();
    
  qlib::Array<qlib::uid_t> rend_ids;
  if (bNearest) {
    nrend = 1;
    rend_ids.resize(1);
    rend_ids[0] = m_hitdata.getNearestRendID();
  }
  else {
    rend_ids.resize(nrend);
    m_hitdata.getRendArray(rend_ids.data(), nrend);
  }

  ////////////////////////

  LString rval;
  rval += "[";

  for (int ii=0; ii<nrend; ++ii) {
    qlib::uid_t rend_id = rend_ids[ii];

    if (ii>0)
      rval += ",";
    rval += "{";
    rval += LString::format("\"rend_id\": %d,\n", rend_id);

    qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
    if (pRend.isnull()) {
      LOG_DPRINTLN("OglView.hitTestRect> FATAL ERROR: Unknown renderer id %d", rend_id);
      return LString();
    }

    qlib::uid_t sceneid = pRend->getSceneID();
    qlib::uid_t objid = pRend->getClientObjID();

    qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
    if (pObj.isnull()) {
      LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
      return LString();
    }
    
    rval += pRend->interpHit(m_hitdata);
    rval += LString::format("\"obj_id\": %d", objid);
    rval += "}";
    //MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);
  }
  rval += "]";

  return rval;
}
#endif

//////////
// Framebuffer operations

qsys::View *OglView::createOffScreenView(int w, int h, int aa_depth)
{
  if (!View::hasVBO())
    return NULL;
  
#ifdef HAVE_OGL_FBO
  OglFBOView *pView = MB_NEW OglFBOView();
  if (!pView->attach(this, w, h)) {
    delete pView;
    return NULL;
  }

  return pView;
#else
  return NULL;
#endif
}

void OglView::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp)
{
  MB_ASSERT(ncomp==3||ncomp==4);
  //int reqsize = 4 * ((3 * width + 3) / 4);
  int reqsize = ncomp*width*height;
  GLenum format= (ncomp==4)?GL_RGBA:GL_RGB;

  if (nbufsize>=reqsize) {
    glGetError();
    glReadPixels(x, y, width, height,
                 format, GL_UNSIGNED_BYTE, pbuf);
    int res = glGetError();
    if (res!=GL_NO_ERROR) {
      LOG_DPRINTLN("Ogl> readPixel failed: %s", gluErrorString(res));
    }
  }
  else {
    LOG_DPRINTLN("Ogl> readPixel: nbufsize is smaller than required size!!");
  }
}

/// clean-up the drawing display with the current bg color
void OglView::clear()
{
  if (!safeSetCurrent()) return;

  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("OglView::clear() invalid scene %d !!", getSceneID());
    return;
  }

  gfx::ColorPtr pBgCol = pScene->getBgColor();
  glClearColor(pBgCol->fr(), pBgCol->fg(), pBgCol->fb(), 1.0f);

  ::glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  glFlush();

  // pdc->unsetCurrent();
}

/*
void OglView::readObj(qlib::ObjInStream &dis)
{
  View::readObj(dis);
  setUpProjMat(getDisplayContext(), -1, -1);
}
*/

