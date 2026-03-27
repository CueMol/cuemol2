// -*-Mode: C++;-*-
//
//  Abstract display context class
//
// $Id: DisplayContext.cpp,v 1.7 2011/02/11 06:56:57 rishitani Exp $

#include <common.h>

#include "DisplayContext.hpp"
#include "SolidColor.hpp"
#include "ShaderObject.hpp"
#include "PixelBuffer.hpp"

using namespace gfx;

DisplayContext::DisplayContext()
{
  //m_defMatName = LString();
  m_defAlpha = 1.0;
  m_dPixSclFac = 1.0;
  m_dEdgeLineWidth = -1.0;
  m_nEdgeLineType = ELT_NONE;
  m_pTargView = NULL;
  m_nSceneID = qlib::invalid_uid;
  m_nViewID = qlib::invalid_uid;
  m_lineWidth = -1.0;
  m_lineStipple = 0xFFFF;
  m_bLighting = false;

  m_matstack.push_front(Matrix4D());
}

bool DisplayContext::isRenderPixmap() const
{
  return true;
}

bool DisplayContext::isDrawElemSupported() const
{
  return false;
}

void DisplayContext::setTargetView(qsys::View *pView)
{
  m_pTargView = pView;
}

qsys::View *DisplayContext::getTargetView() const
{
  return m_pTargView;
}

void DisplayContext::vertex(double x, double y, double z)
{
  vertex(Vector4D(x,y,z));
}

void DisplayContext::normal(double x, double y, double z)
{
  normal(Vector4D(x,y,z));
}

void DisplayContext::color(double r, double g, double b, double a)
{
  color(SolidColor::createRGB(r,g,b,a));
}

void DisplayContext::color(double r, double g, double b)
{
  color(SolidColor::createRGB(r,g,b));
}

void DisplayContext::color(const ColorPtr &c)
{
    m_color = c;
}

// Enable fog
void DisplayContext::enableFog(bool b)
{
    m_bFogEnabled = b;
}

void DisplayContext::setFogStart(float val)
{
    m_fFogStart = val;
}

void DisplayContext::setFogEnd(float val)
{
    m_fFogEnd = val;
}

void DisplayContext::setFogColor(const ColorPtr &val)
{
    m_fogColor = val;
}

void DisplayContext::setMaterial(const LString &name)
{
  m_defMatName = name;
}

void DisplayContext::setAlpha(double a)
{
  m_defAlpha = a;
}

void DisplayContext::setStyleNames(const LString &name)
{
  m_styleNames = name;
}

void DisplayContext::pushMatrix()
{
    if (m_matstack.size() <= 0) {
        m_matstack.push_front(Matrix4D());
        return;
    }
    const Matrix4D &top = m_matstack.front();
    m_matstack.push_front(top);
}

void DisplayContext::popMatrix()
{
    if (m_matstack.size() <= 1) {
        LString msg("FATAL ERROR: cannot popMatrix()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
        return;
    }
    m_matstack.pop_front();
}

void DisplayContext::multMatrix(const qlib::Matrix4D &mat)
{
    Matrix4D top = m_matstack.front();
    top.matprod(mat);
    m_matstack.front() = top;

    // check unitarity
    // checkUnitary();
}
void DisplayContext::loadMatrix(const qlib::Matrix4D &mat)
{
    m_matstack.front() = mat;

    // check unitarity
    // checkUnitary();
}

void DisplayContext::setProjMat(const Matrix4D &mat)
{
    m_projMat = mat;
}

void DisplayContext::setViewport(const Vector4D &vp)
{
    m_viewport = vp;
}

// static
Matrix4D DisplayContext::makeOrthoProjMat(float left, float right, float bottom, float top,
                                          float slabnear, float slabfar)
{
    MB_DPRINTLN("LR=%f,%f", left, right);
    MB_DPRINTLN("BT=%f,%f", bottom, top);
    MB_DPRINTLN("NF=%f,%f", slabnear, slabfar);
    
    float r_l = right - left;
    float t_b = top - bottom;
    float f_n = slabfar - slabnear;
    float tx = - (right + left) / (right - left);
    float ty = - (top + bottom) / (top - bottom);
    float tz = - (slabfar + slabnear) / (slabfar - slabnear);
    
    Matrix4D ret;
    ret.aij(1,1) = 2.0f / r_l;
    ret.aij(2,1) = 0.0f;
    ret.aij(3,1) = 0.0f;
    ret.aij(4,1) = 0.0f;
    
    ret.aij(1,2) = 0.0f;
    ret.aij(2,2) = 2.0f / t_b;
    ret.aij(3,2) = 0.0f;
    ret.aij(4,2) = 0.0f;
    
    ret.aij(1,3) = 0.0f;
    ret.aij(2,3) = 0.0f;
    ret.aij(3,3) = -2.0f / f_n;
    ret.aij(4,3) = 0.0f;
    
    ret.aij(1,4) = tx;
    ret.aij(2,4) = ty;
    ret.aij(3,4) = tz;
    ret.aij(4,4) = 1.0f;

    return ret;
}

// static
Matrix4D DisplayContext::makePersProjMat(float width, float fasp,
                                         float slabnear, float slabfar, float distance)
{
    float t = distance/width;

    Matrix4D ret;
    ret.aij(1,1) = t / fasp;
    ret.aij(2,1) = 0;
    ret.aij(3,1) = 0;
    ret.aij(4,1) = 0;
    
    ret.aij(1,2) = 0;
    ret.aij(2,2) = t;
    ret.aij(3,2) = 0;
    ret.aij(4,2) = 0;
    
    ret.aij(1,3) = 0;
    ret.aij(2,3) = 0;
    ret.aij(3,3) = (slabfar + slabnear) / (slabnear - slabfar);
    ret.aij(4,3) = -1;
    
    ret.aij(1,4) = 0;
    ret.aij(2,4) = 0;
    ret.aij(3,4) = (2 * slabfar * slabnear) / (slabnear - slabfar);
    ret.aij(4,4) = 0;

    return ret;
}

//////////

void DisplayContext::drawString(const Vector4D &pos,
                                const qlib::LString &str)
{
}

void DisplayContext::drawPixels(const Vector4D &pos,
                                const PixelBuffer &data,
                                const ColorPtr &col)
{
}

/// Display unit sphere
void DisplayContext::sphere()
{
}

/// Display sphere with radius of r at position vec
void DisplayContext::sphere(double r, const Vector4D &vec)
{
  // Ignore very small spheres
  if (r<F_EPS4)
    return;
  pushMatrix();
  translate(vec);
  scale(Vector4D(r,r,r));
  sphere();
  popMatrix();
}

void DisplayContext::setDetail(int n)
{
}

int DisplayContext::getDetail() const
{
  return 0;
}

void DisplayContext::cylinder(double r, const Vector4D &pos1, const Vector4D &pos2)
{
  cone(r, r, pos1, pos2, false);
}

void DisplayContext::cylinderCap(double r, const Vector4D &pos1, const Vector4D &pos2)
{
  cone(r, r, pos1, pos2, true);
}

void DisplayContext::cone(double r1, double r2,
                          const Vector4D &pos1, const Vector4D &pos2,bool bCap)
{
  return;
}

void DisplayContext::drawMesh(const Mesh &)
{
}

void DisplayContext::drawElem(const AbstDrawElem &)
{
}

void DisplayContext::setLineWidth(double lw)
{
    m_lineWidth = lw;
}

void DisplayContext::setLineStipple(unsigned short pattern)
{
    m_lineStipple = pattern;
}

void DisplayContext::setPointSize(double size)
{
}

void DisplayContext::setLighting(bool f)
{
    m_bLighting = f;
}


//////////////////////////////////////////////////////////////////
// Display list (null implementation)

DisplayContext *DisplayContext::createDisplayList()
{
  return NULL;
}

bool DisplayContext::canCreateDL() const
{
  return false;
}

void DisplayContext::callDisplayList(DisplayContext *pdl)
{
}

bool DisplayContext::isCompatibleDL(DisplayContext *pdl) const
{
  return false;
}

bool DisplayContext::isDisplayList() const
{
  return false;
}

bool DisplayContext::recordStart()
{
  return false;
}

void DisplayContext::recordEnd()
{
}

//////////////////////////////////////////////////////////////////

void DisplayContext::startHit(qlib::uid_t rend_uid) {}
void DisplayContext::endHit() {}

void DisplayContext::loadName(int nameid) {}
void DisplayContext::pushName(int nameid) {}
void DisplayContext::popName() {}
void DisplayContext::drawPointHit(int nid, const Vector4D &pos) {}

void DisplayContext::startRender() {}
void DisplayContext::endRender() {}
void DisplayContext::startSection(const LString &section_name) {}
void DisplayContext::endSection() {}

//////////

void DisplayContext::startEdgeSection() {}
void DisplayContext::endEdgeSection() {}

//

void DisplayContext::setEdgeLineType( int n )
{
  m_nEdgeLineType = n;
}

int DisplayContext::getEdgeLineType() const
{
  return m_nEdgeLineType;
}

//

void DisplayContext::setEdgeLineWidth(double w)
{
  m_dEdgeLineWidth = w;
}

double DisplayContext::getEdgeLineWidth() const
{
  return m_dEdgeLineWidth;
}

//

void DisplayContext::setEdgeLineColor(const ColorPtr &c)
{
  m_egLineCol = c;
}

ColorPtr DisplayContext::getEdgeLineColor() const
{
  return m_egLineCol;
}

void DisplayContext::attribute(int n)
{
}

void DisplayContext::getDevRGBColor(const ColorPtr &pcol, float &r, float &g, float &b)
{
    if (!pcol.isnull()) {
        auto ccode = pcol->getDevCode(getSceneID());
        r = gfx::getFR(ccode);
        g = gfx::getFG(ccode);
        b = gfx::getFB(ccode);
    }
}

void DisplayContext::getDevRGBAColor(const ColorPtr &pcol, float &r, float &g, float &b, float &a)
{
    if (!pcol.isnull()) {
        auto ccode = pcol->getDevCode(getSceneID());
        r = gfx::getFR(ccode);
        g = gfx::getFG(ccode);
        b = gfx::getFB(ccode);
        a = gfx::getFA(ccode);
    }
}

ShaderObject *DisplayContext::loadShaderObject(const LString &name,
                                               const LString &vert_path,
                                               const LString &frag_path)
{
    return nullptr;
}

ShaderObject *DisplayContext::createShaderObject(const LString &name,
                                                 const LString &vert_path,
                                                 const LString &frag_path)
{
    return nullptr;
}

BufTexRep *DisplayContext::createBufTexRep()
{
    return nullptr;
}
