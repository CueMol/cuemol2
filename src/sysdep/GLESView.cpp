// -*-Mode: C++;-*-
//
//  OpenGLES view common implementation
//

#include <common.h>

#include "GLESView.hpp"
#include <gfx/DisplayContext.hpp>

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ViewInputConfig.hpp>

#ifdef USE_GLES2
#include <OpenGLES/ES2/gl.h>
#include <OpenGLES/ES2/glext.h>
#else
#include <OpenGLES/ES1/gl.h>
#include <OpenGLES/ES1/glext.h>
#endif

using namespace sysdep;
using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::LQuat;
using gfx::DisplayContext;

GLESView::GLESView()
{
  setTransMMS(true);
  setRotMMS(true);
}

GLESView::GLESView(const GLESView &r)
{
}

GLESView::~GLESView()
{
}

/////////////////////////////

void GLESView::swapBuffers()
{
}

LString GLESView::hitTest(int x, int y)
{
  DisplayContext *pdc = getDisplayContext();
  pdc->setCurrent();

  double dHitPrec = qsys::ViewInputConfig::getInstance()->getHitPrec();

  /////////////

  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("HitTest: invalid scene %d !!", getSceneID());
    return LString();
  }

  glClearColor(1.0f, 0.0f, 0.0f, 0.0f);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  pdc->setLighting(false);
  setUpModelMat(MM_NORMAL);

#ifdef USE_GLES2
  // TO DO: GLES2 impl
#else
  glDisable(GL_FOG);
  glDisable(GL_LINE_SMOOTH);
#endif
  glDisable(GL_BLEND);

  // Draw main 3D objects
  pScene->processHit(pdc);

  glFinish();
#ifdef USE_GLES2
  // TO DO: GLES2 impl
#else
  glEnable(GL_FOG);
  glEnable(GL_LINE_SMOOTH);
#endif
  glEnable(GL_BLEND);
  
  unsigned char pbuf[1024], pix;
  for (int i=0; i<sizeof pbuf; ++i) {
    pbuf[i] = 0;
  }
  glPixelStorei(GL_PACK_ALIGNMENT ,1);
  //glReadBuffer( GL_BACK );
  
  int cx = getWidth();
  int cy = getHeight();
  MB_DPRINTLN("x=%d, y=%d, cy=%d", x, y, cy);

  glReadPixels(x, cy-y, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, pbuf);
  qlib::uid_t rid = pbuf[0];
  int nid =
    ((pbuf[1] & 0xFF) << 0) |
    ((pbuf[2] & 0xFF) << 8) |
    ((pbuf[3] & 0xFF) << 16);

  MB_DPRINTLN("rid=%d, nid=%d", rid, nid);
  if (rid==255)
    return LString();

  GLESHitData hitdata;
  hitdata.m_nRendID = rid;
  hitdata.m_nNID = nid;

  /*
  const int w = 1;
  glReadPixels(x, cy-y, w, w, GL_RGBA, GL_UNSIGNED_BYTE, pbuf);
    
  for (int i=w-1; i>=0; --i) {
    for (int j=0; j<w; ++j) {
      pix = pbuf[(i*w+j)*4+0];
      MB_DPRINT("%02X", int(pix));
      pix = pbuf[(i*w+j)*4+1];
      MB_DPRINT("%02X", int(pix));
      pix = pbuf[(i*w+j)*4+2];
      MB_DPRINT("%02X ", int(pix));
    }
    MB_DPRINT("\n");
  }
  */

  qsys::RendererPtr pRend = qsys::SceneManager::getRendererS(rid);
  if (pRend.isnull()) {
    LOG_DPRINTLN("FATAL ERROR: Unknown renderer id %d", rid);
    return LString();
  }
  //return pRend->interpHit(hitdata);

  qsys::ObjectPtr pObj = pRend->getClientObj();
  if (pObj.isnull()) {
    LOG_DPRINTLN("FATAL ERROR: enderer id %d client obj is null", rid);
    return LString();
  }

  {
    LString rval;
    rval += "{";

    rval += pRend->interpHit(hitdata);

    rval += LString::format("\"scene_id\": %d,\n", pScene->getUID());
    rval += LString::format("\"rend_id\": %d,\n", pRend->getUID());
    rval += LString::format("\"rendtype\": \"%s\",\n", pRend->getTypeName());
    rval += LString::format("\"rend_name\": \"%s\",\n", pRend->getName().c_str());
    rval += LString::format("\"obj_id\": %d,\n", pObj->getUID());
    rval += LString::format("\"obj_name\": \"%s\"\n", pObj->getName().c_str());
    rval += "}";

    return rval;
  }
}

//

GLESHitData::~GLESHitData()
{
}

int GLESHitData::getDataSize(qlib::uid_t rend_id) const
{
  if (rend_id==m_nRendID)
    return 1;
  else
    return 0;
}

int GLESHitData::getDataAt(qlib::uid_t rend_id, int ii, int subii) const
{
  if (rend_id==m_nRendID)
    return m_nNID;
  else
    return 0;
}

////////////////////////////////////////////
// Touch events

void GLESView::panStart(int numtch, float x, float y)
{
  qsys::InDevEvent ev;
  setupTouchEvent(ev, numtch, x, y);
  m_meh.buttonDown(ev);
  fireInDevEvent(ev);
}

void GLESView::panMove(int numtch, float x, float y)
{
  // MB_DPRINTLN("MOVE quat: %s", m_curcam.m_rotQuat.m_data.toString().c_str());

  qsys::InDevEvent ev;
  setupTouchEvent(ev, numtch, x, y);
  if (!m_meh.move(ev))
    return;
  //MB_DPRINTLN(" nev=%d", ev.getType());
  //MB_DPRINTLN(" modif=%X", ev.getModifier());
  fireInDevEvent(ev);

  //MB_DPRINTLN("--> quat: %s", m_curcam.m_rotQuat.m_data.toString().c_str());
  //MB_DPRINTLN("--> MOVE OK");
}

void GLESView::panEnd(int numtch, float x, float y, float vx, float vy)
{
  qsys::InDevEvent ev;
  setupTouchEvent(ev, numtch, x, y);
  ev.setVeloX(vx);
  ev.setVeloY(vy);
  m_meh.buttonUp(ev);
  fireInDevEvent(ev);
}

void GLESView::setupTouchEvent(qsys::InDevEvent &ev, int numtch, float x, float y)
{
  ev.setX(x);
  ev.setY(y);
  ev.setRootX(x);
  ev.setRootY(y);
  
  int modif = 0;
  if (numtch==1)
    modif |= qsys::InDevEvent::INDEV_LBTN;
  else if (numtch==2)
    modif |= qsys::InDevEvent::INDEV_RBTN;
  else if (numtch==3) {
    modif |= qsys::InDevEvent::INDEV_LBTN;
    modif |= qsys::InDevEvent::INDEV_SHIFT;
  }

  ev.setModifier(modif);
}

