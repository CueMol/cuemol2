// -*-Mode: C++;-*-
//
// OpenGL ES2 display context implementation
//

#include <common.h>

#ifdef USE_GLES2

#include <OpenGLES/ES2/gl.h>
#include <OpenGLES/ES2/glext.h>

#include "GLES2DisplayContext.hpp"
#include "GLES2View.hpp"
#include "OglProgramObject.hpp"
#include "OglError.hpp"

#include <gfx/DrawElem.hpp>
#include <gfx/PixelBuffer.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

using namespace sysdep;
using gfx::DisplayContext;
using gfx::DrawElem;
using gfx::DrawElemV;
using gfx::DrawElemVC;
using gfx::DrawElemVNC;
using gfx::DrawElemVNCI;
using gfx::DrawElemPix;

GLES2DisplayContext::GLES2DisplayContext(GLES2View *pView)
{
  m_nDetail = 5;
  m_pTargetView = pView;

  m_pDefPO = NULL;
  GLES2_ATTR_VERT = 0;
  GLES2_ATTR_NORM = 0;
  GLES2_ATTR_COLOR = 0;

  pushMatrix();
}

GLES2DisplayContext::~GLES2DisplayContext()
{
  BOOST_FOREACH (ProgTab::value_type &elem, m_progs) {
    delete elem.second;
  }
}

bool GLES2DisplayContext::isFile() const
{
  return false;
}

/// Initialization
void GLES2DisplayContext::init()
{
  setCurrent();

  m_pDefPO = createProgramObject("default");
  if (m_pDefPO==NULL) {
    // m_bUseShaderAlpha = false;
    return;
  }

  m_pDefPO->loadShader("vert",
                       "%%CONFDIR%%/es2_default_vert.glsl",
                       GL_VERTEX_SHADER);
  m_pDefPO->loadShader("frag",
                       "%%CONFDIR%%/es2_default_frag.glsl",
                       GL_FRAGMENT_SHADER);

  GLES2_ATTR_VERT = 0;
  //GLES2_ATTR_NORM = 1;
  GLES2_ATTR_COLOR = 1;

  CLR_GLERROR();
  m_pDefPO->bindAttribLocation(GLES2_ATTR_VERT, "a_vertex");
  CHK_GLERROR("bindAttrLoc vert");
  //m_pDefPO->bindAttribLocation(GLES2_ATTR_NORM, "a_normal");
  m_pDefPO->bindAttribLocation(GLES2_ATTR_COLOR, "a_color");
  CHK_GLERROR("bindAttrLoc color");

  m_pDefPO->link();

  m_pDefPO->enable();
  //m_pDefPO->setUniform("enable_lighting", 0);
  //m_pDefPO->setUniformF("frag_alpha", 1.0);

  int ntmp = m_pDefPO->getAttribLocation("a_vertex");
  MB_DPRINTLN("a_vertex: %d", ntmp);
  //GLES2_ATTR_VERT = m_pDefPO->getAttribLocation("a_vertex");
  //GLES2_ATTR_NORM = m_pDefPO->getAttribLocation("a_normal");
  //GLES2_ATTR_COLOR = m_pDefPO->getAttribLocation("a_color");

  m_pDefPO->disable();

}

qsys::View *GLES2DisplayContext::getTargetView() const
{
  return m_pTargetView;
}

//////////////////////////////////////////////////////////////
// Model-View-Proj matrix operations (not supported in GLES2)

void GLES2DisplayContext::setMvpMatUniform()
{
  if (m_pDefPO==NULL)
    return;

  Matrix4D mvp = m_projMat * m_matstack.front();
  m_pDefPO->enable();
  m_pDefPO->setMatrix("mvp_matrix", mvp);
}

void GLES2DisplayContext::loadOrthoProj(float left, float right,
					float bottom, float top,
					float near, float far)
{
  MB_DPRINTLN("LR=%f,%f", left, right);
  MB_DPRINTLN("BT=%f,%f", bottom, top);
  MB_DPRINTLN("NF=%f,%f", near, far);

  float r_l = right - left;
  float t_b = top - bottom;
  float f_n = far - near;
  float tx = - (right + left) / (right - left);
  float ty = - (top + bottom) / (top - bottom);
  float tz = - (far + near) / (far - near);

  m_projMat.aij(1,1) = 2.0f / r_l;
  m_projMat.aij(2,1) = 0.0f;
  m_projMat.aij(3,1) = 0.0f;
  m_projMat.aij(4,1) = 0.0f;

  m_projMat.aij(1,2) = 0.0f;
  m_projMat.aij(2,2) = 2.0f / t_b;
  m_projMat.aij(3,2) = 0.0f;
  m_projMat.aij(4,2) = 0.0f;

  m_projMat.aij(1,3) = 0.0f;
  m_projMat.aij(2,3) = 0.0f;
  m_projMat.aij(3,3) = -2.0f / f_n;
  m_projMat.aij(4,3) = 0.0f;

  m_projMat.aij(1,4) = tx;
  m_projMat.aij(2,4) = ty;
  m_projMat.aij(3,4) = tz;
  m_projMat.aij(4,4) = 1.0f;

  setMvpMatUniform();
}

void GLES2DisplayContext::pushMatrix()
{
  if (m_matstack.size()<=0) {
    Matrix4D m;
    m_matstack.push_front(m);
    setMvpMatUniform();
    return;
  }
  const Matrix4D &top = m_matstack.front();
  m_matstack.push_front(top);
  setMvpMatUniform();
}

void GLES2DisplayContext::multMatrix(const Matrix4D &mat)
{
  Matrix4D top = m_matstack.front();
  top.matprod(mat);
  m_matstack.front() = top;
  setMvpMatUniform();

  // check unitarity
  //checkUnitary();
}

void GLES2DisplayContext::loadMatrix(const Matrix4D &mat)
{
  m_matstack.front() = mat;
  setMvpMatUniform();
}

void GLES2DisplayContext::popMatrix()
{
  if (m_matstack.size()<=1) {
    LString msg("POVWriter> FATAL ERROR: cannot popMatrix()!!");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  m_matstack.pop_front();
  setMvpMatUniform();
}

////////////////////////////////////////////////////////////////////
// GLES2 supported operations

void GLES2DisplayContext::setLineWidth(double lw)
{
  glLineWidth((float)lw);
}

void GLES2DisplayContext::setPointSize(double size)
{
  // GLES2 doesn't have glPointSize (moved to gl_PointSize shader variable)
  // ::glPointSize(size);
}

void GLES2DisplayContext::enableDepthTest(bool f)
{
  if (f)
    ::glDepthMask(GL_TRUE);
  else
    ::glDepthMask(GL_FALSE);
}

void GLES2DisplayContext::setLighting(bool f)
{
  // TO DO: impl using shader
}

void GLES2DisplayContext::setCullFace(bool f/*=true*/)
{
  if (f)
    ::glEnable(GL_CULL_FACE);
  else
    ::glDisable(GL_CULL_FACE);
}

////////////////////////////////////////////////////////////////////
// non-supported operations

void GLES2DisplayContext::setLineStipple(unsigned short pattern)
{
  // line stipple is not supported in GLES!!
}

////////////
// Selection: selection is not supported in GLES

void GLES2DisplayContext::startHit(qlib::uid_t rend_uid)
{
  MB_DPRINTLN("StartHit %d", rend_uid);
}

void GLES2DisplayContext::endHit()
{
  MB_DPRINTLN("EndHit");
}

void GLES2DisplayContext::drawPointHit(int nid, const Vector4D &pos)
{
}

//////////////////////////////////////////////////////////////////
// Display list impl

DisplayContext *GLES2DisplayContext::createDisplayList()
{
  return NULL;
}

bool GLES2DisplayContext::canCreateDL() const
{
  return false;
}

void GLES2DisplayContext::callDisplayList(DisplayContext *pdl)
{
}

bool GLES2DisplayContext::isCompatibleDL(DisplayContext *pdl) const
{
  return false;
}

bool GLES2DisplayContext::isDisplayList() const
{
  return false;
}

bool GLES2DisplayContext::recordStart()
{
  return false;
}

void GLES2DisplayContext::recordEnd()
{
}

//////////////////////////////////////////////////////////////////

bool GLES2DisplayContext::setCurrent()
{
  return true;
}

bool GLES2DisplayContext::isCurrent() const
{
  return true;
}

/////////////////////////////////////////////////

namespace {
  GLenum convDrawMode(int nMode) {
    GLenum mode;
    switch (nMode) {
    case DrawElem::DRAW_POINTS:
      mode = GL_POINTS;
      break;
    case DrawElem::DRAW_LINE_STRIP:
      mode = GL_LINE_STRIP;
      break;
    case DrawElem::DRAW_LINE_LOOP:
      mode = GL_LINE_LOOP;
      break;
    case DrawElem::DRAW_LINES:
      mode = GL_LINES;
      break;
    case DrawElem::DRAW_TRIANGLE_STRIP:
      mode = GL_TRIANGLE_STRIP;
      break;
    case DrawElem::DRAW_TRIANGLE_FAN:
      mode = GL_TRIANGLE_FAN;
      break;
    case DrawElem::DRAW_TRIANGLES:
      mode = GL_TRIANGLES;
      break;
    default: {
      LString msg = LString::format("GLES2 DrawElem: invalid draw mode %d", nMode);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::RuntimeException, msg);
    }
    }
    return mode;
  }
}

namespace {
  class GLES2VBORep : public gfx::VBORep
  {
  public:
    qlib::uid_t m_nViewID;
    GLuint m_nBufID;
    
    virtual ~GLES2VBORep()
    {
      qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
      if (rvw.isnull()) {
        MB_DPRINTLN("GLES2> unknown parent view (%d), VBO %d cannot be deleted", m_nViewID, m_nBufID);
        return;
      }

      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      
      glDeleteBuffers(1, &m_nBufID);
      MB_DPRINTLN("GLES2> VBO %d deleted", m_nBufID);
    }
  };
}

void GLES2DisplayContext::drawElem(const DrawElem &de)
{
  const int ntype = de.getType();
  const int nelems = de.getSize();
  //MB_DPRINTLN("DrawElem> nelem=%d", nelems);

  if (ntype==DrawElem::VA_PIXEL) {
    drawElemPix(static_cast<const DrawElemPix &>(de));
    return;
  }

  int ninds = 0;
  GLuint nvbo = 0;
  GLuint nvbo_ind = 0;
  if (de.getVBO()==NULL) {
    // Make VBO
    glGenBuffers(1, &nvbo);
    GLES2VBORep *pRep = MB_NEW GLES2VBORep();
    pRep->m_nBufID = nvbo;
    pRep->m_nViewID = m_pTargetView->getUID();
    de.setVBO(pRep);

    MB_DPRINTLN("GLES2> VBO created %d for view %d", nvbo, pRep->m_nViewID);

    // Init VBO & copy data
    glBindBuffer(GL_ARRAY_BUFFER, nvbo);

    // const_cast<DrawElem &>(de).applyAlpha(calpha);

    if (ntype==DrawElem::VA_VC) {
      const qbyte *pdata = (const qbyte *) static_cast<const DrawElemVC&>(de).getData();
      glBufferData(GL_ARRAY_BUFFER, sizeof(DrawElemVC::Elem)*nelems, pdata, GL_STATIC_DRAW);
    }
    else if (ntype==DrawElem::VA_V) {
      const qbyte *pdata = (const qbyte *) static_cast<const DrawElemV&>(de).getData();
      glBufferData(GL_ARRAY_BUFFER, sizeof(DrawElemV::Elem)*nelems, pdata, GL_STATIC_DRAW);
    }
    else if (ntype==DrawElem::VA_VNC) {
      const qbyte *pdata = (const qbyte *) static_cast<const DrawElemVNC&>(de).getData();
      glBufferData(GL_ARRAY_BUFFER, sizeof(DrawElemVNC::Elem)*nelems, pdata, GL_STATIC_DRAW);
    }
    else if (ntype==DrawElem::VA_VNCI) {
      const DrawElemVNCI &devnci = static_cast<const DrawElemVNCI&>(de);
      const qbyte *pdata = (const qbyte *) devnci.getData();
      glBufferData(GL_ARRAY_BUFFER, sizeof(DrawElemVNCI::Elem)*nelems, pdata, GL_STATIC_DRAW);

      glGenBuffers(1, &nvbo_ind);
      GLES2VBORep *pRep = MB_NEW GLES2VBORep();
      pRep->m_nBufID = nvbo_ind;
      pRep->m_nViewID = m_pTargetView->getUID();
      devnci.setIndexVBO(pRep);
      ninds = devnci.getIndexSize();
      MB_DPRINTLN("GLES2> ninds=%d index VBO created %d for view %d", ninds, nvbo_ind, pRep->m_nViewID);

      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, nvbo_ind);
      glBufferData(GL_ELEMENT_ARRAY_BUFFER,
                   sizeof(DrawElemVNCI::index_t)*ninds,
                   devnci.getIndexData(),
                   GL_STATIC_DRAW);
    }

    //glBindBuffer(GL_ARRAY_BUFFER, 0);
  }
  else {
    // reuse buffer
    GLES2VBORep *pRep = (GLES2VBORep *) de.getVBO();
    nvbo = pRep->m_nBufID;
    glBindBuffer(GL_ARRAY_BUFFER, nvbo);
    //MB_DPRINTLN("DrawElem> use vbo=%d", nvbo);

    if (ntype==DrawElem::VA_VNCI) {
      const DrawElemVNCI &devnci = static_cast<const DrawElemVNCI&>(de);
      GLES2VBORep *pRep = (GLES2VBORep *) devnci.getIndexVBO();
      nvbo_ind = pRep->m_nBufID;
      ninds = devnci.getIndexSize();
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, nvbo_ind);
      //MB_DPRINTLN("DrawElem> use ind vbo=%d", nvbo_ind);
    }
  }
  //MB_ASSERT(nvbo!=0);

  GLenum mode = convDrawMode(de.getDrawMode());

  glLineWidth(de.getLineWidth());
  quint32 cc = de.getDefColor();
  glVertexAttrib4f(GLES2_ATTR_COLOR, 
		   gfx::getRCode(cc)/255.0,
		   gfx::getGCode(cc)/255.0,
		   gfx::getBCode(cc)/255.0,
		   gfx::getACode(cc)/255.0);

  /*glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
	     gfx::getACode(cc));*/

  if (ntype==DrawElem::VA_VC) {
    // glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVC::Elem), 0);
    // glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVC::Elem),
    // (const GLvoid *) (3*sizeof(qfloat32)) );

    glVertexAttribPointer(GLES2_ATTR_VERT, 3, GL_FLOAT, GL_FALSE, sizeof(DrawElemVC::Elem), 0);
    glEnableVertexAttribArray(GLES2_ATTR_VERT);

    // color should be normalized (0:255-->1:1.0)
    glVertexAttribPointer(GLES2_ATTR_COLOR, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(DrawElemVC::Elem),
			  (const GLvoid *) (3*sizeof(qfloat32)) );
    glEnableVertexAttribArray(GLES2_ATTR_COLOR);
  }
  else if (ntype==DrawElem::VA_V) {
    //glEnableClientState(GL_VERTEX_ARRAY);
    //glVertexPointer(3, GL_FLOAT, sizeof(DrawElemV::Elem), 0);

    glVertexAttribPointer(GLES2_ATTR_VERT, 3, GL_FLOAT, GL_FALSE, sizeof(DrawElemV::Elem), 0);
    glEnableVertexAttribArray(GLES2_ATTR_VERT);
  }
  else if (ntype==DrawElem::VA_VNC || ntype==DrawElem::VA_VNCI ) {
    //glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVNC::Elem), 0);
    glVertexAttribPointer(GLES2_ATTR_VERT, 3, GL_FLOAT, GL_FALSE, sizeof(DrawElemVNC::Elem), 0);
    glEnableVertexAttribArray(GLES2_ATTR_VERT);

    // glNormalPointer(GL_FLOAT, sizeof(DrawElemVNC::Elem),
    // (const GLvoid *) (3*sizeof(qfloat32)));
    glVertexAttribPointer(GLES2_ATTR_NORM, 3, GL_FLOAT, GL_FALSE, sizeof(DrawElemVNC::Elem),
			  (const GLvoid *) (3*sizeof(qfloat32)));
    glEnableVertexAttribArray(GLES2_ATTR_NORM);

    // glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVNC::Elem),
    // (const GLvoid *) (6*sizeof(qfloat32)));
    glVertexAttribPointer(GLES2_ATTR_COLOR, 4, GL_UNSIGNED_BYTE, GL_TRUE,
			  sizeof(DrawElemVNC::Elem),
			  (const GLvoid *) (6*sizeof(qfloat32)));
    glEnableVertexAttribArray(GLES2_ATTR_COLOR);
  }

  
  if (ntype==DrawElem::VA_VNCI) {
    // element index array
    setLighting(true);
    glDrawElements(mode, ninds, GL_UNSIGNED_SHORT, 0);
    setLighting(false);
  }
  else {
    glDrawArrays(mode, 0, nelems);
  }

  //glDisableClientState(GL_VERTEX_ARRAY);
  //glDisableClientState(GL_NORMAL_ARRAY);
  //glDisableClientState(GL_COLOR_ARRAY);

  glBindBuffer(GL_ARRAY_BUFFER, 0);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);

}

namespace {
  class GLES2TexRep : public gfx::VBORep
  {
  public:
    qlib::uid_t m_nViewID;
    GLuint m_nBufID;
    
    virtual ~GLES2TexRep()
    {
      qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
      if (rvw.isnull()) {
        MB_DPRINTLN("GLES2> unknown parent view (%d), Texture %d cannot be deleted", m_nViewID, m_nBufID);
        return;
      }

      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      
      glDeleteTextures(1, &m_nBufID);
      MB_DPRINTLN("GLES2> Texture %d deleted", m_nBufID);
    }
  };
}


void GLES2DisplayContext::drawElemPix(const gfx::DrawElemPix &de)
{
#if 0
  GLES2View *pView = m_pTargetView;

  gfx::PixelBuffer *ppix = de.m_pPixBuf;
  const Vector4D &v = de.m_pos;

  int i, j;
  const int ow = ppix->getWidth();
  const int oh = ppix->getHeight();
  const int nsize = ow*oh;

  const GLfloat squareVertices[] = {
    0.0f, 0.0f, 0.0f,
    ow, 0.0f, 0.0f,
    0.0f, oh, 0.0f,
    ow, oh, 0.0f,
  };
  const GLfloat squareCoords[] = {
    0.0f, 0.0f,
    1.0f, 0.0f,
    0.0f, 1.0f,
    1.0f, 1.0f,
  };

  GLuint texid = 0;
  if (de.getVBO()==NULL) {
    // create texture
    glGenTextures(1, &texid);

    GLES2TexRep *pRep = MB_NEW GLES2TexRep();
    pRep->m_nBufID = texid;
    pRep->m_nViewID = pView->getUID();
    de.setVBO(pRep);

    MB_DPRINTLN("GLES2> Texture created %d for view %d", texid, pRep->m_nViewID);

    glBindTexture(GL_TEXTURE_2D, texid);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_ALPHA, ow, oh, 0, GL_ALPHA, GL_UNSIGNED_BYTE, ppix->data());
  
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST); 
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST); 
    //glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR); 
    //glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR); 
    glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE);
  }
  else {
    // reuse buffer
    GLES2TexRep *pRep = static_cast<GLES2TexRep *>( de.getVBO() );
    texid = pRep->m_nBufID;
    glBindTexture(GL_TEXTURE_2D, texid);
  }
  //

  quint32 cc = de.m_color;
  glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
	     gfx::getACode(cc));

  glVertexPointer(3, GL_FLOAT, 0, squareVertices);
  glEnableClientState(GL_VERTEX_ARRAY);

  glTexCoordPointer(2, GL_FLOAT, 0, squareCoords);
  glEnableClientState(GL_TEXTURE_COORD_ARRAY);
  glEnable(GL_TEXTURE_2D);

  //glDisable(GL_CULL_FACE);

  // Draw 2D objects
  {
    int vw = pView->getWidth();
    int vh = pView->getHeight();

    float slabdepth = float(pView->getSlabDepth());
    if (slabdepth<=0.1f)
      slabdepth = 0.1f;
    float dist = float(pView->getViewDist());
    float slabnear = dist-slabdepth/2.0;
    float slabfar  = dist+slabdepth;
    
    glMatrixMode(GL_PROJECTION);
    glPushMatrix();
    glLoadIdentity();
    glOrthof(-vw/2, -vw/2+vw, vh/2-vh, vh/2, slabnear, slabfar);

    glMatrixMode(GL_MODELVIEW);
    glPushMatrix();
    glLoadIdentity();
    glTranslatef(0, 0, -dist); //slabnear);

    Matrix4D mat = pView->getRotQuat().toRotMatrix();
    qlib::Vector4D dv = (v - pView->getViewCenter());
    dv = mat.mulvec(dv);
    const double scale = ( double(pView->getHeight()) / (pView->getZoom()) );
    dv.x() = dv.x() * scale;
    dv.y() = dv.y() * scale;

    glTranslatef(float(dv.x()), float(dv.y()), float(dv.z()));
    //glTranslatef(float(dv.x()), float(dv.y()), 0.0f);
    
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

    glMatrixMode(GL_PROJECTION);
    glPopMatrix();
    glMatrixMode(GL_MODELVIEW);
    glPopMatrix();
  }  
  

  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_TEXTURE_COORD_ARRAY);

  glBindTexture(GL_TEXTURE_2D, 0);

  //glEnable(GL_CULL_FACE);
  // glDeleteTextures(1, &texid);
#endif
}

///////////////////////////////////////////////
// Program object support

OglProgramObject *GLES2DisplayContext::createProgramObject(const LString &name)
{
  OglProgramObject *pRval = NULL;

  setCurrent();
  pRval = getProgramObject(name);
  if (pRval!=NULL)
    return pRval;
  pRval = new OglProgramObject();  
  if (!pRval->init()) {
    delete pRval;
    return NULL;
  }

  m_progs.insert(ProgTab::value_type(name, pRval));

  return pRval;
}

OglProgramObject *GLES2DisplayContext::getProgramObject(const LString &name)
{
  ProgTab::const_iterator i = m_progs.find(name);
  if (i==m_progs.end())
    return NULL;
  return i->second;
}

bool GLES2DisplayContext::destroyProgramObject(const LString &name)
{
  ProgTab::iterator i = m_progs.find(name);
  if (i==m_progs.end())
    return false;
  
  OglProgramObject *pdel = i->second;
  m_progs.erase(i);
  delete pdel;
  return true;
}


#endif
