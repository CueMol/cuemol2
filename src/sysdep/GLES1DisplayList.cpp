// -*-Mode: C++;-*-
//
// OpenGL ES1.1 display list implementation
//

#include <common.h>

#include <OpenGLES/ES1/gl.h>
#include <OpenGLES/ES1/glext.h>
//#import <OpenGLES/ES2/gl.h>
//#import <OpenGLES/ES2/glext.h>

#include "GLES1DisplayList.hpp"
#include "GLES1DisplayContext.hpp"
#include "GLES1View.hpp"

//#include <gfx/TextRenderManager.hpp>
//#include <gfx/PixelBuffer.hpp>
//#include <gfx/SolidColor.hpp>
//#include <gfx/Mesh.hpp>

#include <qsys/ViewInputConfig.hpp>

using namespace sysdep;
using gfx::DisplayContext;

GLES1DisplayList::GLES1DisplayList(GLES1DisplayContext *par)
{
  m_pParent = par;
  m_curNorm = Vector4D(1,0,0);
  m_iVbo = 0;
  pushMatrix();
  m_bUseHit = false;

  m_fHitPrec = (float) qsys::ViewInputConfig::getInstance()->getHitPrec();
  MB_DPRINTLN("GLES1DL: hittest prec=%f", m_fHitPrec);
}

GLES1DisplayList::~GLES1DisplayList()
{
  if (m_iVbo>0) {
    glDeleteBuffers(1, &m_iVbo);
  }
}

bool GLES1DisplayList::setCurrent()
{
  return true;
}

bool GLES1DisplayList::isCurrent() const
{
  return true;
}

bool GLES1DisplayList::isDisplayList() const
{
  return true;
}

bool GLES1DisplayList::recordStart()
{
  m_bUseHit = false;
  return true;
}

void GLES1DisplayList::recordEnd()
{
  if (!m_bUseHit)
    return;
  if (m_vattr.size()>0) {
    m_nDrawMode = ESDC_HITTEST;
    end();
  }
}

////////////////////////////////////////////////////////////////////
// GLES1 supported operations

void GLES1DisplayList::pushMatrix()
{
  m_matstack.push_back(Matrix4D());
}

void GLES1DisplayList::multMatrix(const Matrix4D &mat)
{
  m_matstack.back() = m_matstack.back().mul(mat);
}

void GLES1DisplayList::loadMatrix(const Matrix4D &mat)
{
  m_matstack.back() = mat;
}

void GLES1DisplayList::popMatrix()
{
  MB_ASSERT(m_matstack.size()>0);
  m_matstack.pop_back();
}

void GLES1DisplayList::setLineWidth(double lw)
{
  m_lw = lw;
}

////////////////////////////////////////////////////////////////////

void GLES1DisplayList::startPoints()
{
}

void GLES1DisplayList::startPolygon()
{
}

void GLES1DisplayList::startLines()
{
  m_vattr.clear();
  m_nDrawMode = ESDC_LINES;
}

void GLES1DisplayList::startLineStrip()
{
  m_vattr.clear();
  m_nDrawMode = ESDC_LINESTRIP;
}

void GLES1DisplayList::startTriangleStrip()
{
}

void GLES1DisplayList::startTriangleFan()
{
}

void GLES1DisplayList::startTriangles()
{
}

void GLES1DisplayList::startQuadStrip()
{
}

void GLES1DisplayList::startQuads()
{
}

void GLES1DisplayList::xform_vec(Vector4D &v)
{
  const Matrix4D &mtop = m_matstack.front();
  v.w() = 1.0;
  m_matstack.back().xform4D(v);
}
    
void GLES1DisplayList::xform_norm(Vector4D &v)
{
  const Matrix4D &mtop = m_matstack.front();
  v.w() = 0.0;
  m_matstack.back().xform4D(v);
}

void GLES1DisplayList::vertex(const Vector4D &av)
{
  Vector4D v(av);
  xform_vec(v);

  GLubyte r = m_pCurCol->r();
  GLubyte g = m_pCurCol->g();
  GLubyte b = m_pCurCol->b();
  GLubyte a = m_pCurCol->a();

  VCAttr va = {
    float(v.x()), float(v.y()), float(v.z()),
    r, g, b, a
  };
  m_vattr.push_back(va);
}

void GLES1DisplayList::normal(const Vector4D &av)
{
  m_curNorm = av;
  xform_norm(m_curNorm);
}

void GLES1DisplayList::color(const ColorPtr &c)
{
  m_pCurCol = c;
}

void GLES1DisplayList::setPolygonMode(int id)
{
}

void GLES1DisplayList::end()
{
  // clear old data;
  if (m_iVbo>0) {
    glDeleteBuffers(1, &m_iVbo);
  }

  // Make VBO
  m_nVerts = m_vattr.size();
  //MB_DPRINTLN("nVerts=%d", nVerts);

  glGenBuffers(1, &m_iVbo);
  LOG_DPRINTLN("ES1DL> VBO created %d", m_iVbo);

  // make vert array
  VCAttr *pVCAttr = new VCAttr[m_nVerts];

  {
    std::deque<VCAttr>::const_iterator iter = m_vattr.begin();
    std::deque<VCAttr>::const_iterator eiter = m_vattr.end();
    int i=0;
    for (; iter!=eiter; ++iter, ++i)
      pVCAttr[i] = *iter;
  }

  // Init VBO & copy data
  glBindBuffer(GL_ARRAY_BUFFER, m_iVbo);
  glBufferData(GL_ARRAY_BUFFER, sizeof(VCAttr)*m_nVerts, pVCAttr, GL_STATIC_DRAW);
  glBindBuffer(GL_ARRAY_BUFFER, 0);

  m_vattr.clear();

  delete [] pVCAttr;
}

//////////////////////////////////////////////////////////////////

void GLES1DisplayList::drawPointHit(int nid, const Vector4D &pos)
{
  qlib::uid_t rid = m_pParent->m_nHitRendUID;
  MB_DPRINTLN("Hit %d/%d %s", rid, nid, pos.toString().c_str());
  m_bUseHit = true;

  Vector4D v(pos);
  xform_vec(v);

  GLubyte r = (GLubyte) rid;
  GLubyte g = (GLubyte) (nid & 0xFF);
  GLubyte b = (GLubyte) ((nid>>8) & 0xFF);
  GLubyte a = (GLubyte) ((nid>>16) & 0xFF);

  VCAttr va = {
    float(v.x()), float(v.y()), float(v.z()),
    r, g, b, a
  };
  m_vattr.push_back(va);
}

//////////////////////////////////////////////////////////////////
// non-interface impl

void GLES1DisplayList::play()
{
  //MB_DPRINTLN("GLES1DisplayList::play iVbo=%d", m_iVbo);
  if (m_iVbo==0)
    return;

  // set client state
  ::glEnableClientState(GL_VERTEX_ARRAY);
  ::glEnableClientState(GL_COLOR_ARRAY);

  // attach vbo
  ::glBindBuffer(GL_ARRAY_BUFFER, m_iVbo);
  ::glVertexPointer(3, GL_FLOAT, sizeof(VCAttr), 0);
  ::glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(VCAttr), (GLvoid *)( sizeof(GLfloat)*3 ));

  switch (m_nDrawMode) {
  case ESDC_HITTEST:
    glPointSize((GLfloat)m_fHitPrec);
    glDrawArrays(GL_POINTS, 0, m_nVerts);
    break;

  case ESDC_LINES:
    //MB_DPRINTLN("LINES lw=%f, verts=%d", m_lw, m_nVerts);
    glLineWidth((GLfloat)m_lw);
    glDrawArrays(GL_LINES, 0, m_nVerts);
    break;

  case ESDC_LINESTRIP:
    glLineWidth((GLfloat)m_lw);
    glDrawArrays(GL_LINE_STRIP, 0, m_nVerts);
    break;

  default:
    // noimpl 
    MB_DPRINTLN("ERROR: GLES1DC, noimpl");
    break;
  }

  ::glBindBuffer(GL_ARRAY_BUFFER, 0);
}

