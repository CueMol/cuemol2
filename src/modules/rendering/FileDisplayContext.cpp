// -*-Mode: C++;-*-
//
//  Povray display context implementation
//
//  $Id: FileDisplayContext.cpp,v 1.17 2011/04/11 11:37:29 rishitani Exp $

#include <common.h>
#include <math.h>

#include "FileDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>

using namespace render;

using qlib::PrintStream;
using qlib::Matrix4D;
using qlib::Matrix3D;
using gfx::DisplayContext;

FileDisplayContext::FileDisplayContext()
     : m_pIntData(NULL)
{
  m_fPerspective = true;
  m_bUnitary = true;
  m_nDetail = 3;
  m_dUniTol = 1e-3;
  m_dLineScale = 0.02;
  m_nPolyMode = POLY_FILL;
  m_bLighting = false;

}

FileDisplayContext::~FileDisplayContext()
{
}

////////////////////////////////////////////////////////////
// generic implementation

void FileDisplayContext::init()
{
  clearMatStack();
  pushMatrix();
  loadIdent();
  m_linew = 1.0;

  // default color
  m_pColor = gfx::SolidColor::createRGB(0.5, 0.5, 0.5);

  m_nDrawMode = POV_NONE;
  m_fPrevPosValid = false;
  m_nTriIndex = 0;
  m_dZoom = 100;
  m_dViewDist = 100;
  m_dSlabDepth = 100;

  if (m_pIntData!=NULL)
    delete m_pIntData;
  m_pIntData = NULL;
}

void FileDisplayContext::vertex(const Vector4D &aV)
{
  Vector4D v(aV);
  xform_vec(v);

#ifdef MB_DEBUG
  if (!qlib::isFinite(v.x()) ||
      !qlib::isFinite(v.y()) ||
      !qlib::isFinite(v.z())) {
    LOG_DPRINTLN("FileDC> ERROR: invalid mesh vertex");
  }
#endif
  
  switch (m_nDrawMode) {
  default:
  case POV_NONE:
    MB_DPRINTLN("POVWriter> vertex command ignored.");
    break;

  case POV_POLYGON:
    MB_DPRINTLN("POVWriter> polygon is not supported (vertex command ignored.)");
    break;

  case POV_LINES:
    if (!m_fPrevPosValid) {
      m_prevPos = v;
      m_fPrevPosValid = true;
      break;
    }
    else {
      drawLine(v, m_prevPos);
      m_fPrevPosValid = false;
    }
    break;

    //////////////////////////////////////////////////////
  case POV_LINESTRIP:
    if (!m_fPrevPosValid) {
      m_prevPos = v;
      m_fPrevPosValid = true;
      break;
    }
    else {
      drawLine(v, m_prevPos);
      m_prevPos = v;
    }
    break;

    //////////////////////////////////////////////////////
  case POV_TRIGS:
    m_pIntData->meshVertex(v, m_norm, m_pColor);
    break;

    //////////////////////////////////////////////////////
  case POV_TRIGSTRIP:
    m_pIntData->meshVertex(v, m_norm, m_pColor);
    break;

    //////////////////////////////////////////////////////
  case POV_TRIGFAN:
    m_pIntData->meshVertex(v, m_norm, m_pColor);
    break;
  }

}

void FileDisplayContext::normal(const Vector4D &av)
{
  Vector4D v(av);
  xform_norm(v);

#ifdef MB_DEBUG
  if (!qlib::isFinite(v.x()) ||
      !qlib::isFinite(v.y()) ||
      !qlib::isFinite(v.z())) {
    LOG_DPRINTLN("FileDC> ERROR: invalid mesh norm");
  }
#endif

  const double len = v.length();
  if (len<F_EPS4) {
    LOG_DPRINTLN("FileDisp> Normal vector <%f,%f,%f> is too small.", v.x(), v.y(), v.z());
    m_norm = Vector4D(1.0,0.0,0.0);
    return;
  }
  m_norm = v.scale(1.0/len);
}

void FileDisplayContext::color(const gfx::ColorPtr &c)
{
  m_pColor = c;
}

////////////////////////////////////////////////

void FileDisplayContext::pushMatrix()
{
  if (m_matstack.size()<=0) {
    Matrix4D m;
    m_matstack.push_front(m);
    return;
  }
  const Matrix4D &top = m_matstack.front();
  m_matstack.push_front(top);
}

void FileDisplayContext::popMatrix()
{
  if (m_matstack.size()<=1) {
    LString msg("POVWriter> FATAL ERROR: cannot popMatrix()!!");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  m_matstack.pop_front();
}

void FileDisplayContext::checkUnitary()
{
  const Matrix4D &top = m_matstack.front();
  Matrix3D t = top.getMatrix3D();
  Matrix3D t2 = t;
  t2.transpose();
  t2.matprod(t);
  if (t2.isIdent())
    m_bUnitary = true;
  else
    m_bUnitary = false;
}  

void FileDisplayContext::multMatrix(const Matrix4D &mat)
{
  Matrix4D top = m_matstack.front();
  top.matprod(mat);
  m_matstack.front() = top;

  // check unitarity
  checkUnitary();
}

void FileDisplayContext::loadMatrix(const Matrix4D &mat)
{
  m_matstack.front() = mat;

  // check unitarity
  checkUnitary();
}

void FileDisplayContext::setLineWidth(double lw)
{
  m_linew = lw;
}

void FileDisplayContext::setPointSize(double size)
{
  m_linew = size;
}

void FileDisplayContext::setLineStipple(unsigned short pattern)
{
}

void FileDisplayContext::setPolygonMode(int id)
{
  m_nPolyMode = id;
}

void FileDisplayContext::setDetail(int n)
{
  m_nDetail = n;
}

int FileDisplayContext::getDetail() const
{
  return m_nDetail;
}

void FileDisplayContext::setLighting(bool f/*=true*/)
{
  m_bLighting = f;
}

//////////////////////////////

bool FileDisplayContext::setCurrent()
{
  return true;
}

bool FileDisplayContext::isCurrent() const
{
  return true;
}

bool FileDisplayContext::isPostBlend() const
{
  return false;
}

//////////////////////////////

DisplayContext *FileDisplayContext::createDisplayList() { return NULL; }
bool FileDisplayContext::canCreateDL() const { return false; }
void FileDisplayContext::callDisplayList(DisplayContext *pdl) {}
bool FileDisplayContext::isCompatibleDL(DisplayContext *pdl) const { return false; }

bool FileDisplayContext::isDisplayList() const { return false; }
bool FileDisplayContext::recordStart() { return false; }
void FileDisplayContext::recordEnd() {}

//////////////////////////////

/// Draw a single line segment from v1 to v2 to the output
/// v1 and v2 should be transformed by matrix stack
void FileDisplayContext::drawLine(const Vector4D &v1, const Vector4D &v2)
{
  if (v1.equals(v2))
    return;
  m_pIntData->line(v1, v2, m_linew);
}

void FileDisplayContext::startPoints()
{
  m_nDrawMode = POV_POINTS;
}

void FileDisplayContext::startPolygon()
{
  m_nDrawMode = POV_POLYGON;
}

void FileDisplayContext::startLines()
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }
  m_nDrawMode = POV_LINES;
  //startUnion();
}

void FileDisplayContext::startLineStrip()
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }
  m_nDrawMode = POV_LINESTRIP;
  //startUnion();
}

void FileDisplayContext::startTriangles()
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }
  m_nDrawMode = POV_TRIGS;
  m_pIntData->meshStart();
}

void FileDisplayContext::startTriangleStrip()
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }
  m_nDrawMode = POV_TRIGSTRIP;
  m_pIntData->meshStart();
}

void FileDisplayContext::startTriangleFan()
{
  m_nDrawMode = POV_TRIGFAN;
  m_pIntData->meshStart();
}

void FileDisplayContext::startQuadStrip()
{
  m_nDrawMode = POV_QUADS;
}

void FileDisplayContext::startQuads()
{
  m_nDrawMode = POV_QUADSTRIP;
}

void FileDisplayContext::end()
{
  switch (m_nDrawMode) {
  case POV_LINES:
  case POV_LINESTRIP:
    m_fPrevPosValid = false;
    //endUnion();
    break;

  case POV_TRIGS:
    m_pIntData->meshEndTrigs();
    break;

  case POV_TRIGFAN:
    m_pIntData->meshEndFan();
    break;

  case POV_TRIGSTRIP:
    m_pIntData->meshEndTrigStrip();
    break;
  }
  m_nDrawMode = POV_NONE;
}

//////////////////////////////

void FileDisplayContext::sphere(double r, const Vector4D &vec)
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }

  Vector4D v(vec);
  xform_vec(v);
  m_pIntData->sphere(v, r, m_nDetail);

}

void FileDisplayContext::sphere()
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }

  Vector4D v(0, 0, 0);
  xform_vec(v);
  
  const Matrix4D &mtop = m_matstack.front();
  if (mtop.isIdentAffine(F_EPS4))
    m_pIntData->sphere(v, 1.0, m_nDetail);
  else {
    LOG_DPRINTLN("ERROR, sphere(): unsupported operation!!");
    m_pIntData->sphere(v, 1.0, m_nDetail);
  }

}

void FileDisplayContext::cone(double r1, double r2,
                              const Vector4D &pos1, const Vector4D &pos2,
                              bool bCap)
{
  if (m_nDrawMode!=POV_NONE) {
    MB_THROW(qlib::RuntimeException, "FileDisplayContext: Unexpected condition");
    return;
  }

  if (pos1.equals(pos2))
    return;

  const Matrix4D &xm = m_matstack.front();
  Matrix3D xm3 = xm.getMatrix3D(), test;
  bool bUnitary = true;
  if (!xm3.isIdent()) {
    test = xm3.transpose() * xm3;
    bUnitary = test.isIdent(m_dUniTol);
  }
  
  if (bUnitary) {
    Vector4D p1 = pos1;
    Vector4D p2 = pos2;
    xform_vec(p1);
    xform_vec(p2);
    m_pIntData->cylinder(p1, p2, r1, r2, bCap, m_nDetail, NULL);
  }
  else {
    m_pIntData->cylinder(pos1, pos2, r1, r2, bCap, m_nDetail, &xm);
  }

}

void FileDisplayContext::drawMesh(const gfx::Mesh &mesh)
{
  m_pIntData->mesh(m_matstack.front(), mesh);
}

//////////////////////

void FileDisplayContext::startSection(const LString &name)
{
  // start of rendering
  if (m_pIntData!=NULL) {
    MB_THROW(qlib::RuntimeException, "Unexpected condition");
    return ;
  }
  m_pIntData = MB_NEW RendIntData(this);
  if (m_bUseClipZ)
    m_pIntData->m_dClipZ = m_dSlabDepth/2.0;
  else
    m_pIntData->m_dClipZ = -1.0;
}

void FileDisplayContext::endSection()
{
  // end of rendering
  if (m_pIntData==NULL) {
    MB_THROW(qlib::RuntimeException, "Unexpected condition");
    return ;
  }
  // m_pIntData->end();
  delete m_pIntData;
  m_pIntData = NULL;
}

