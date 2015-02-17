// -*-Mode: C++;-*-
//
// OpenGL ES1.1 context implementation
//

#include <common.h>

#include <OpenGLES/ES1/gl.h>
#include <OpenGLES/ES1/glext.h>
//#import <OpenGLES/ES2/gl.h>
//#import <OpenGLES/ES2/glext.h>

#include "GLES1DisplayContext.hpp"
#include "GLES1View.hpp"
#include "GLES1DisplayList.hpp"

//#include <gfx/TextRenderManager.hpp>
//#include <gfx/PixelBuffer.hpp>
//#include <gfx/SolidColor.hpp>
//#include <gfx/Mesh.hpp>
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

GLES1DisplayContext::GLES1DisplayContext(GLES1View *pView)
{
  m_nDetail = 5;
  // m_pGluData = NULL;
  m_pTargetView = pView;
  m_curNorm = Vector4D(1,0,0);
}

GLES1DisplayContext::~GLES1DisplayContext()
{
  //if (m_pGluData!=NULL)
  //::gluDeleteQuadric((GLUquadricObj *)m_pGluData);
}

bool GLES1DisplayContext::isFile() const
{
  return false;
}

////////////////////////////////////////////////////////////////////
// GLES1 supported operations

void GLES1DisplayContext::setLineWidth(double lw)
{
  glLineWidth((float)lw);
}

void GLES1DisplayContext::setPointSize(double size)
{
  ::glPointSize(size);
}

void GLES1DisplayContext::pushMatrix()
{
  glPushMatrix();
}

void GLES1DisplayContext::multMatrix(const Matrix4D &mat)
{
  GLfloat m[16];

  m[0]  = mat.aij(1,1);
  m[4]  = mat.aij(1,2);
  m[8]  = mat.aij(1,3);
  m[12] = mat.aij(1,4);

  m[1]  = mat.aij(2,1);
  m[5]  = mat.aij(2,2);
  m[9]  = mat.aij(2,3);
  m[13] = mat.aij(2,4);

  m[2]  = mat.aij(3,1);
  m[6]  = mat.aij(3,2);
  m[10] = mat.aij(3,3);
  m[14] = mat.aij(3,4);

  m[3]  = mat.aij(4,1);
  m[7]  = mat.aij(4,2);
  m[11] = mat.aij(4,3);
  m[15] = mat.aij(4,4);

  glMultMatrixf(m);
}

void GLES1DisplayContext::loadMatrix(const Matrix4D &mat)
{
  GLfloat m[16];

  m[0]  = mat.aij(1,1);
  m[4]  = mat.aij(1,2);
  m[8]  = mat.aij(1,3);
  m[12] = mat.aij(1,4);

  m[1]  = mat.aij(2,1);
  m[5]  = mat.aij(2,2);
  m[9]  = mat.aij(2,3);
  m[13] = mat.aij(2,4);

  m[2]  = mat.aij(3,1);
  m[6]  = mat.aij(3,2);
  m[10] = mat.aij(3,3);
  m[14] = mat.aij(3,4);

  m[3]  = mat.aij(4,1);
  m[7]  = mat.aij(4,2);
  m[11] = mat.aij(4,3);
  m[15] = mat.aij(4,4);

  glLoadMatrixf(m);
}

void GLES1DisplayContext::popMatrix()
{
  glPopMatrix();
}

void GLES1DisplayContext::enableDepthTest(bool f)
{
  if (f)
    ::glDepthMask(GL_TRUE);
  else
    ::glDepthMask(GL_FALSE);
}

void GLES1DisplayContext::setLighting(bool f)
{
  if (f)
    ::glEnable(GL_LIGHTING);
  else
    ::glDisable(GL_LIGHTING);
}

void GLES1DisplayContext::setCullFace(bool f/*=true*/)
{
  if (f)
    ::glEnable(GL_CULL_FACE);
  else
    ::glDisable(GL_CULL_FACE);
}

////////////////////////////////////////////////
// DisplayCommand overloads for performance

void GLES1DisplayContext::translate(const Vector4D &v)
{
  ::glTranslatef(v.x(), v.y(), v.z());
}

void GLES1DisplayContext::scale(const Vector4D &v)
{
  ::glScalef(v.x(), v.y(), v.z());
}

void GLES1DisplayContext::loadIdent()
{
  ::glLoadIdentity();
}

////////////////////////////////////////////////////////////////////

void GLES1DisplayContext::startPoints()
{
}

void GLES1DisplayContext::startPolygon()
{
}

void GLES1DisplayContext::startLines()
{
  m_vattr.clear();
  m_nDrawMode = ESDC_LINES;
}

void GLES1DisplayContext::startLineStrip()
{
  m_vattr.clear();
  m_nDrawMode = ESDC_LINESTRIP;
}

void GLES1DisplayContext::startTriangleStrip()
{
}

void GLES1DisplayContext::startTriangleFan()
{
}

void GLES1DisplayContext::startTriangles()
{
}

void GLES1DisplayContext::startQuadStrip()
{
}

void GLES1DisplayContext::startQuads()
{
}

namespace {
  struct VCArray {
    GLfloat x, y, z;
    GLubyte r, g, b, a;
  };
}

void GLES1DisplayContext::end()
{
  const int nVerts = m_vattr.size();
  //MB_DPRINTLN("nVerts=%d", nVerts);

  // Make VBO
  GLuint buffers[1];
  glGenBuffers(1, buffers);
  GLuint ivbo = buffers[0];

  // make vert array
  VCArray*pVert = new VCArray[nVerts];
  //GLfloat *pVert = new GLfloat[nVerts*3];
  //GLubyte *pCols = new GLubyte[nVerts*4];
  {
    std::deque<VertexAttr>::const_iterator iter = m_vattr.begin();
    std::deque<VertexAttr>::const_iterator eiter = m_vattr.end();
    int i=0;
    for (; iter!=eiter; ++iter, ++i) {
      const VertexAttr &elem = *iter;
      pVert[i].x = elem.x;
      pVert[i].y = elem.y;
      pVert[i].z = elem.z;

      pVert[i].r = GLubyte(elem.pcol->r());
      pVert[i].g = GLubyte(elem.pcol->g());
      pVert[i].b = GLubyte(elem.pcol->b());
      pVert[i].a = GLubyte(elem.pcol->a());

      /*
      pCols[i*4+0] = GLubyte(elem.pcol->r());
      pCols[i*4+1] = GLubyte(elem.pcol->g());
      pCols[i*4+2] = GLubyte(elem.pcol->b());
      pCols[i*4+3] = GLubyte(elem.pcol->a());
      */
    }
  }

  // Init VBO & copy data
  glBindBuffer(GL_ARRAY_BUFFER, ivbo);
  glBufferData(GL_ARRAY_BUFFER, sizeof(VCArray)*nVerts, pVert, GL_STATIC_DRAW);
  glBindBuffer(GL_ARRAY_BUFFER, 0);

  // set client state
  ::glEnableClientState(GL_VERTEX_ARRAY);
  ::glEnableClientState(GL_COLOR_ARRAY);

  // attach vbo
  ::glBindBuffer(GL_ARRAY_BUFFER, ivbo);
  ::glVertexPointer(3, GL_FLOAT, sizeof(VCArray), 0);
  ::glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(VCArray), (GLvoid *)( sizeof(GLfloat)*3 ));

  //::glVertexPointer(3, GL_FLOAT, 0, pVert);
  //::glEnableClientState(GL_VERTEX_ARRAY);
  //::glColorPointer(4, GL_UNSIGNED_BYTE, 0, pCols);
  //::glEnableClientState(GL_COLOR_ARRAY);

  switch (m_nDrawMode) {
  case ESDC_LINES:
    glDrawArrays(GL_LINES, 0, nVerts);
    break;

  case ESDC_LINESTRIP:
    glDrawArrays(GL_LINE_STRIP, 0, nVerts);
    break;

  default:
    // noimpl 
    MB_DPRINTLN("ERROR: GLES1DC, noimpl");
    break;
  }
  m_vattr.clear();

  delete [] pVert;
  //delete [] pCols;

  glDeleteBuffers(1, buffers);
}

void GLES1DisplayContext::vertex(const Vector4D &v)
{
  m_vattr.push_back(VertexAttr(float(v.x()), float(v.y()), float(v.z()),
			       m_pCurCol));
}

void GLES1DisplayContext::normal(const Vector4D &v)
{
  m_curNorm = v;
}

void GLES1DisplayContext::color(const ColorPtr &c)
{
  m_pCurCol = c;
}

void GLES1DisplayContext::setPolygonMode(int id)
{
}

////////////////////////////////////////////////////////////////////
// non-supported operations

void GLES1DisplayContext::setLineStipple(unsigned short pattern)
{
  // line stipple is not supported in GLES!!
}

////////////
// Selection: selection is not supported in GLES

void GLES1DisplayContext::startHit(qlib::uid_t rend_uid)
{
  MB_DPRINTLN("StartHit %d", rend_uid);
  m_nHitRendUID = rend_uid;
}

void GLES1DisplayContext::endHit()
{
  MB_DPRINTLN("EndHit");
}

void GLES1DisplayContext::drawPointHit(int nid, const Vector4D &pos)
{
}

//////////////////////////////////////////////////////////////////
// Display list impl

DisplayContext *GLES1DisplayContext::createDisplayList()
{
  GLES1DisplayList *pdl = MB_NEW GLES1DisplayList(this);
  pdl->setAlpha(getAlpha());
  pdl->setMaterial(getMaterial());
  return pdl;
}

bool GLES1DisplayContext::canCreateDL() const
{
  return true;
  // return false;
}

void GLES1DisplayContext::callDisplayList(DisplayContext *pdl)
{
  GLES1DisplayList *psrc = dynamic_cast<GLES1DisplayList *>(pdl);
  if (psrc==NULL)
    return;
  psrc->play();
}

bool GLES1DisplayContext::isCompatibleDL(DisplayContext *pdl) const
{
  GLES1DisplayList *psrc = dynamic_cast<GLES1DisplayList *>(pdl);
  if (psrc==NULL)
    return false;
  return true;
}

bool GLES1DisplayContext::isDisplayList() const
{
  return false;
}

bool GLES1DisplayContext::recordStart()
{
  return false;
}

void GLES1DisplayContext::recordEnd()
{
}

//////////////////////////////////////////////////////////////////
// Quadric object drawing impl

void GLES1DisplayContext::sphere()
{
}

void GLES1DisplayContext::cone(double r1, double r2,
                             const Vector4D &pos1, const Vector4D &pos2,
                             bool bCap)
{
}

void GLES1DisplayContext::sphere(double r, const Vector4D &vec)
{
  pushMatrix();
  translate(vec);
  scale(Vector4D(r,r,r));
  sphere();
  popMatrix();
}

void GLES1DisplayContext::setDetail(int n)
{
  m_nDetail = n;
}

int GLES1DisplayContext::getDetail() const
{
  return m_nDetail;
}

/*
void GLES1DisplayContext::drawMesh(const gfx::Mesh &mesh)
{
  const int nverts = mesh.getVertSize();
  const int nfaces = mesh.getFaceSize();

  glEnableClientState(GL_VERTEX_ARRAY);
  glEnableClientState(GL_NORMAL_ARRAY);
  glEnableClientState(GL_COLOR_ARRAY);

  const float *pverts = mesh.getFloatVerts();
  glVertexPointer(3, GL_FLOAT, 0, pverts);

  const float *pnorms = mesh.getFloatNorms();
  glNormalPointer(GL_FLOAT, 0, pnorms);

  unsigned char *pcols = MB_NEW unsigned char[nverts*4];

  int calpha = int(getAlpha()* 255.0 + 0.5);
  mesh.convRGBAByteCols(pcols, nverts*4, calpha);

  glColorPointer(4, GL_UNSIGNED_BYTE, 0, pcols);

  const int *pinds = mesh.getFaces();

  glDrawElements(GL_TRIANGLES, 3*nfaces, GL_UNSIGNED_INT, pinds);

  delete [] pcols;
}
*/

bool GLES1DisplayContext::setCurrent()
{
  return true;
}

bool GLES1DisplayContext::isCurrent() const
{
  return true;
}

qsys::View *GLES1DisplayContext::getTargetView() const
{
  return m_pTargetView;
}

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
      LString msg = LString::format("GLES1 DrawElem: invalid draw mode %d", nMode);
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::RuntimeException, msg);
    }
    }
    return mode;
  }
}

/////////////////////////////////////////////////

namespace {
  class GLES1VBORep : public gfx::VBORep
  {
  public:
    qlib::uid_t m_nViewID;
    GLuint m_nBufID;
    
    virtual ~GLES1VBORep()
    {
      qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
      if (rvw.isnull()) {
        MB_DPRINTLN("GLES1> unknown parent view (%d), VBO %d cannot be deleted", m_nViewID, m_nBufID);
        return;
      }

      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      
      glDeleteBuffers(1, &m_nBufID);
      MB_DPRINTLN("GLES1> VBO %d deleted", m_nBufID);
    }
  };
}

void GLES1DisplayContext::drawElem(const DrawElem &de)
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
    GLES1VBORep *pRep = MB_NEW GLES1VBORep();
    pRep->m_nBufID = nvbo;
    pRep->m_nViewID = m_pTargetView->getUID();
    de.setVBO(pRep);

    MB_DPRINTLN("GLES1> VBO created %d for view %d", nvbo, pRep->m_nViewID);

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
      GLES1VBORep *pRep = MB_NEW GLES1VBORep();
      pRep->m_nBufID = nvbo_ind;
      pRep->m_nViewID = m_pTargetView->getUID();
      devnci.setIndexVBO(pRep);
      ninds = devnci.getIndexSize();
      MB_DPRINTLN("GLES1> ninds=%d index VBO created %d for view %d", ninds, nvbo_ind, pRep->m_nViewID);

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
    GLES1VBORep *pRep = (GLES1VBORep *) de.getVBO();
    nvbo = pRep->m_nBufID;
    glBindBuffer(GL_ARRAY_BUFFER, nvbo);
    //MB_DPRINTLN("DrawElem> use vbo=%d", nvbo);

    if (ntype==DrawElem::VA_VNCI) {
      const DrawElemVNCI &devnci = static_cast<const DrawElemVNCI&>(de);
      GLES1VBORep *pRep = (GLES1VBORep *) devnci.getIndexVBO();
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
  qbyte cca = gfx::getACode(cc);
  //if (calpha<255)
  //cca = qbyte( int(cca)*calpha );
  glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
	     cca);

  if (ntype==DrawElem::VA_VC) {
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVC::Elem), 0);
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVC::Elem),
                   (const GLvoid *) (3*sizeof(qfloat32)) );
  }
  else if (ntype==DrawElem::VA_V) {
    glEnableClientState(GL_VERTEX_ARRAY);
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemV::Elem), 0);
  }
  else if (ntype==DrawElem::VA_VNC || ntype==DrawElem::VA_VNCI ) {
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVNC::Elem), 0);
    glNormalPointer(GL_FLOAT, sizeof(DrawElemVNC::Elem),
                    (const GLvoid *) (3*sizeof(qfloat32)));
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVNC::Elem),
                   (const GLvoid *) (6*sizeof(qfloat32)));
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

  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
  glDisableClientState(GL_COLOR_ARRAY);

  glBindBuffer(GL_ARRAY_BUFFER, 0);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);

}

namespace {
  void calc3Drect(const Vector4D &ref, float w, float h,
		  const Vector4D &vhorz,const Vector4D &vvert,
		  Vector4D &pos1,Vector4D &pos2,Vector4D &pos3,Vector4D &pos4)
  {
    switch (0) {
    case 0:
      pos1 = ref;
      pos4 = ref + vhorz.scale(w);
      pos2 = ref;
      pos3 = ref + vhorz.scale(w);
      break;
    case 1:
      pos1 = ref - vhorz.scale(w/2.0);
      pos4 = ref + vhorz.scale(w/2.0);
      pos2 = ref - vhorz.scale(w/2.0);
      pos3 = ref + vhorz.scale(w/2.0);
      break;
    case 2:
      pos1 = ref - vhorz.scale(w);
      pos4 = ref;
      pos2 = ref - vhorz.scale(w);
      pos3 = ref;
      break;
    }

    switch (2) {
    case 0:
      //pos1 += ref;
      pos2 += vvert.scale(h);
      //pos4 = ref;
      pos3 += vvert.scale(h);
      break;
    case 1:
      pos1 -= vvert.scale(h/2.0);
      pos2 += vvert.scale(h/2.0);
      pos4 -= vvert.scale(h/2.0);
      pos3 += vvert.scale(h/2.0);
      break;
    case 2:
      pos1 -= vvert.scale(h);
      //pos2 = ref;
      pos4 -= vvert.scale(h);
      //pos3 = ref;
      break;
    }
  
  }

  class GLES1TexRep : public gfx::VBORep
  {
  public:
    qlib::uid_t m_nViewID;
    GLuint m_nBufID;
    
    virtual ~GLES1TexRep()
    {
      qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
      if (rvw.isnull()) {
        MB_DPRINTLN("GLES1> unknown parent view (%d), Texture %d cannot be deleted", m_nViewID, m_nBufID);
        return;
      }

      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      
      glDeleteTextures(1, &m_nBufID);
      MB_DPRINTLN("GLES1> Texture %d deleted", m_nBufID);
    }
  };
}


void GLES1DisplayContext::drawElemPix(const gfx::DrawElemPix &de)
{
  GLES1View *pView = m_pTargetView;

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

    GLES1TexRep *pRep = MB_NEW GLES1TexRep();
    pRep->m_nBufID = texid;
    pRep->m_nViewID = pView->getUID();
    de.setVBO(pRep);

    MB_DPRINTLN("GLES1> Texture created %d for view %d", texid, pRep->m_nViewID);

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
    GLES1TexRep *pRep = static_cast<GLES1TexRep *>( de.getVBO() );
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
    
    glEnable(GL_ALPHA_TEST);
    glAlphaFunc(GL_GREATER, 0.1);

    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

    glDisable(GL_ALPHA_TEST);

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
}
