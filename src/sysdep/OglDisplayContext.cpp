// -*-Mode: C++;-*-
//
//  OpenGL display context implementation
//
//  $Id: OglDisplayContext.cpp,v 1.26 2011/04/10 10:48:09 rishitani Exp $

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

#define USE_GL_VBO_INST 1

#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <gfx/ColProfMgr.hpp>

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>

#include "OglDisplayContext.hpp"
#include "OglDisplayList.hpp"
#include "OglProgramObject.hpp"
#include "OglDrawElems.hpp"

using namespace sysdep;
using gfx::DisplayContext;
using gfx::AbstDrawElem;
using gfx::DrawElem;
using gfx::DrawElemV;
using gfx::DrawElemVC;
using gfx::DrawElemVNC;
using gfx::DrawElemVNCI;
using gfx::DrawElemVNCI32;
using gfx::DrawElemPix;

OglDisplayContext::OglDisplayContext(int sceneid)
{
  m_nSceneID = sceneid;
  m_pGluData = NULL;
  m_color = Vector4D(1.0, 1.0, 1.0, 1.0);
  m_nDetail = 5;

  m_bUseShaderAlpha = false;
  m_pDefPO = NULL;
  m_pEdgePO = NULL;
  m_pSilhPO = NULL;
}

OglDisplayContext::~OglDisplayContext()
{
  if (m_pGluData!=NULL)
    ::gluDeleteQuadric((GLUquadricObj *)m_pGluData);

  BOOST_FOREACH (ProgTab::value_type &elem, m_progs) {
    delete elem.second;
  }
}

void OglDisplayContext::init()
{
  setCurrent();

  m_bUseShaderAlpha = qsys::View::hasVS();
  if (!m_bUseShaderAlpha)
    return;

#if HAVE_GLEW
  // create default shaders
  m_pDefPO = createProgramObject("default");
  if (m_pDefPO==NULL) {
    m_bUseShaderAlpha = false;
    return;
  }

  //glFogi(GL_FOG_COORDINATE_SOURCE, GL_FRAGMENT_DEPTH);
  //glFogi(GL_FOG_COORDINATE_SOURCE, GL_FOG_COORDINATE);
  m_pDefPO->loadShader("vert",
                       "%%CONFDIR%%/data/shaders/default_vert.glsl",
                       GL_VERTEX_SHADER);
  m_pDefPO->loadShader("frag",
                       "%%CONFDIR%%/data/shaders/default_frag.glsl",
                       GL_FRAGMENT_SHADER);
  m_pDefPO->link();

  m_pDefPO->enable();
  m_pDefPO->setUniform("enable_lighting", 0);
  m_pDefPO->setUniformF("frag_alpha", 1.0);
  m_pDefPO->disable();

  //////////

  m_pEdgePO = createProgramObject("edge");
  if (m_pEdgePO==NULL) {
    LOG_DPRINTLN("Failed to load Edge ProgramObject");
    return;
  }
  m_pEdgePO->loadShader("vert",
                        "%%CONFDIR%%/data/shaders/edge_vert.glsl",
                       GL_VERTEX_SHADER);
  m_pEdgePO->loadShader("frag",
                        "%%CONFDIR%%/data/shaders/edge_frag.glsl",
                        GL_FRAGMENT_SHADER);
  m_pEdgePO->link();
  
  m_pEdgePO->enable();
  m_pEdgePO->setUniformF("frag_alpha", 1.0f);
  // m_pEdgePO->setUniformF("frag_zdisp", 0.001);
  m_pEdgePO->setUniformF("edge_width", 0.001f);
  m_pEdgePO->setUniformF("edge_color", 0,0,0,1);
  m_pEdgePO->disable();

  //////////

  m_pSilhPO = createProgramObject("silh");
  if (m_pSilhPO==NULL) {
    LOG_DPRINTLN("Failed to load Silhouette ProgramObject");
    return;
  }
  m_pSilhPO->loadShader("vert",
                        "%%CONFDIR%%/data/shaders/silh_vert.glsl",
                       GL_VERTEX_SHADER);
  m_pSilhPO->loadShader("frag",
                        "%%CONFDIR%%/data/shaders/silh_frag.glsl",
                        GL_FRAGMENT_SHADER);
  m_pSilhPO->link();
  
  m_pSilhPO->enable();
  m_pSilhPO->setUniformF("frag_alpha", 1.0f);
  // m_pSilhPO->setUniformF("backz", 0.001);
  m_pSilhPO->setUniformF("edge_width", 0.001f);
  m_pSilhPO->setUniformF("edge_color", 0,0,0,1);
  m_pSilhPO->disable();

#endif
}

bool OglDisplayContext::isFile() const
{
  return false;
}

bool OglDisplayContext::isDrawElemSupported() const
{
  return true;
}

void OglDisplayContext::startSection(const LString &section_name)
{
  if (!m_bUseShaderAlpha || m_pDefPO==NULL)
    return;

  m_pDefPO->enable();
  m_pDefPO->setUniformF("frag_alpha", getAlpha());

}

void OglDisplayContext::endSection()
{
  if (!m_bUseShaderAlpha || m_pDefPO==NULL)
    return;

  m_pDefPO->setUniformF("frag_alpha", 1.0);
  m_pDefPO->disable();

}

void OglDisplayContext::startEdgeSection()
{
  if (getEdgeLineType()==ELT_EDGES) {
    if (m_pEdgePO==NULL)
      return;

    // TO DO: conv to devcolor
    double r=.0,g=.0,b=.0;
    ColorPtr pcol = getEdgeLineColor();
    if (!pcol.isnull()) {
      r = pcol->fr();
      g = pcol->fg();
      b = pcol->fb();
    }
    double alpha = getAlpha();
    
    m_pEdgePO->enable();
    m_pEdgePO->setUniformF("frag_alpha", alpha);
    m_pEdgePO->setUniformF("edge_width", getEdgeLineWidth());
    m_pEdgePO->setUniformF("edge_color", r,g,b,alpha);

    glEnable(GL_CULL_FACE);
    glFrontFace(GL_CW);
  }
  else if (getEdgeLineType()==ELT_SILHOUETTE) {
    if (m_pSilhPO==NULL)
      return;

    double r=.0,g=.0,b=.0;
    ColorPtr pcol = getEdgeLineColor();
    if (!pcol.isnull()) {
      r = pcol->fr();
      g = pcol->fg();
      b = pcol->fb();
    }
    double alpha = getAlpha();
    
    m_pSilhPO->enable();
    m_pSilhPO->setUniformF("frag_alpha", alpha);
    m_pSilhPO->setUniformF("edge_width", getEdgeLineWidth());
    m_pSilhPO->setUniformF("edge_color", r,g,b,alpha);

    glEnable(GL_CULL_FACE);
    glFrontFace(GL_CW);
  }
}

void OglDisplayContext::endEdgeSection()
{
  if (getEdgeLineType()==ELT_EDGES) {
    if (m_pEdgePO==NULL)
      return;

    m_pEdgePO->disable();
    glFrontFace(GL_CCW);
  }
  else if (getEdgeLineType()==ELT_SILHOUETTE) {
    if (m_pSilhPO==NULL)
      return;

    m_pSilhPO->disable();
    glFrontFace(GL_CCW);
  }
}

//////////////////////////////////////////////////////////

void OglDisplayContext::vertex(const Vector4D &v)
{
  ::glVertex3d(v.x(), v.y(), v.z());

  /*if (m_fDebugMode) {
    std::pair<Vector4D, Vector4D> nv;
    nv.second = m_curVertex;
    nv.first  = Vector4D(x, y, z);
    m_normlist.push_back(nv);
    }*/
}

void OglDisplayContext::vertex(double x, double y, double z)
{
  ::glVertex3d(x, y, z);
}

void OglDisplayContext::normal(const Vector4D &rn)
{
  ::glNormal3d(rn.x(), rn.y(), rn.z());

/*
  Vector4D nn = rn;
  double len = nn.length();
  if (len>=F_EPS4) {
    nn = nn.divide(len);
  }
  
  glNormal3d(nn.x(), nn.y(), nn.z());

  if (m_fDebugMode) {
    m_curVertex = Vector4D(x/2.0, y/2.0, z/2.0);
  }
*/
}

void OglDisplayContext::normal(double x, double y, double z)
{
  ::glNormal3d(x,y,z);
}

void OglDisplayContext::setMaterial(const LString &name)
{
  super_t::setMaterial(name);
  setMaterImpl(name);
}

void OglDisplayContext::setMaterImpl(const LString &name)
{
  if (m_curMater.equals(name))
    return;
  m_curMater = name;

  qsys::StyleMgr *pSM = qsys::StyleMgr::getInstance();
  double dvalue;

  // Default Material: (defined in OglView; plastic-like shading)
  //  Ambient = 0.2 (*(1,1,1))
  //  Diffuse = 0.8
  //  Specular = 0.4
  double amb = 0.2, diff = 0.8, spec = 0.4;
  double shin = 32.0;

  dvalue = pSM->getMaterial(name, gfx::Material::MAT_AMBIENT);
  if (dvalue>=-0.1) {
    amb = dvalue;
  }

  dvalue = pSM->getMaterial(name, gfx::Material::MAT_DIFFUSE);
  if (dvalue>=-0.1) {
    diff = dvalue;
  }

  dvalue = pSM->getMaterial(name, gfx::Material::MAT_SPECULAR);
  if (dvalue>=-0.1) {
    spec = dvalue;
  }

  dvalue = pSM->getMaterial(name, gfx::Material::MAT_SHININESS);
  if (dvalue>=-0.1) {
    shin = dvalue;
  }

  GLfloat tmpv[4] = {0.0, 0.0, 0.0, 1.0};
  
  tmpv[0] = tmpv[1] = tmpv[2] = float(amb);
  glLightfv(GL_LIGHT0, GL_AMBIENT, tmpv);

  tmpv[0] = tmpv[1] = tmpv[2] = float(diff);
  glLightfv(GL_LIGHT0, GL_DIFFUSE, tmpv);

  tmpv[0] = tmpv[1] = tmpv[2] = float(spec);
  glLightfv(GL_LIGHT0, GL_SPECULAR, tmpv);

  glMaterialf(GL_FRONT_AND_BACK, GL_SHININESS, float(shin));

  // LOG_DPRINTLN("OglSetMaterial %s a=%f,d=%f,s=%f,sh=%f",
  // name.c_str(), amb, diff, spec, shin);
}

void OglDisplayContext::color(const ColorPtr &c)
{
  //::glColor4ub(c->r(), c->g(), c->b(), c->a());

  quint32 devcolc = c->getDevCode(m_nSceneID);

  m_color.x() = gfx::getFR(devcolc); //c->fr();
  m_color.y() = gfx::getFG(devcolc); //c->fg();
  m_color.z() = gfx::getFB(devcolc); //c->fb();
  if (useShaderAlpha())
    m_color.w() = c->fa();
  else
    m_color.w() = c->fa() * getAlpha();
    
/*
  LString strmat = c->getMaterial();
  LString defmat = getMaterial();
  if (strmat.isEmpty()) {
    setMaterImpl(defmat);
  }
  else {
    setMaterImpl(strmat);
  }
*/
  
  ::glColor4d(m_color.x(), m_color.y(), m_color.z(), m_color.w());
}

void OglDisplayContext::color(double r, double g, double b, double a)
{
  Vector4D vcol(r,g,b);
  gfx::ColProfMgr *pCPM = gfx::ColProfMgr::getInstance();
  pCPM->doXForm(m_nSceneID, vcol, m_color);

  //m_color.x() = r;
  //m_color.y() = g;
  //m_color.z() = b;

  if (useShaderAlpha())
    m_color.w() = a;
  else
    m_color.w() = a * getAlpha();
  
  ::glColor4d(m_color.x(), m_color.y(), m_color.z(), m_color.w());
}

void OglDisplayContext::color(double r, double g, double b)
{
  Vector4D vcol(r,g,b);
  gfx::ColProfMgr *pCPM = gfx::ColProfMgr::getInstance();
  pCPM->doXForm(m_nSceneID, vcol, m_color);

  //m_color.x() = r;
  //m_color.y() = g;
  //m_color.z() = b;

  if (useShaderAlpha())
    m_color.w() = 1.0;
  else
    m_color.w() = getAlpha();

  ::glColor4d(m_color.x(), m_color.y(), m_color.z(), m_color.w());
}

void OglDisplayContext::setLineWidth(double lw)
{
  glLineWidth( float(lw * getPixSclFac()) );
}

void OglDisplayContext::setLineStipple(unsigned short pattern)
{
  if (pattern==0xFFFF)
    glDisable(GL_LINE_STIPPLE);
  else {
    glEnable(GL_LINE_STIPPLE);
    glLineStipple(1,pattern);
  }
}

void OglDisplayContext::setPointSize(double size)
{
  ::glPointSize((GLfloat)size);
}

void OglDisplayContext::startPoints()
{
  glBegin(GL_POINTS);
}

void OglDisplayContext::startPolygon()
{
  glBegin(GL_POLYGON);
}

void OglDisplayContext::startLines()
{
  glBegin(GL_LINES);
}

void OglDisplayContext::startLineStrip()
{
  glBegin(GL_LINE_STRIP);
}

void OglDisplayContext::startTriangleStrip()
{
  glBegin(GL_TRIANGLE_STRIP);
}

void OglDisplayContext::startTriangleFan()
{
  glBegin(GL_TRIANGLE_FAN);
}

void OglDisplayContext::startTriangles()
{
  glBegin(GL_TRIANGLES);
}

void OglDisplayContext::startQuadStrip()
{
  glBegin(GL_QUAD_STRIP);
}

void OglDisplayContext::startQuads()
{
  glBegin(GL_QUADS);
}

void OglDisplayContext::end()
{
  glEnd();

  /*  if (m_fDebugMode && m_normlist.size()>0) {
    glBegin(GL_LINES);
    std::list<std::pair<Vector4D, Vector4D> >::const_iterator iter =
      m_normlist.begin();
    for ( ; iter!=m_normlist.end(); iter++) {
      Vector4D p1 = (*iter).first;
      Vector4D p2 = p1+(*iter).second;
      glVertex3d(p1.x, p1.y, p1.z);
      glVertex3d(p2.x, p2.y, p2.z);
    }
    glEnd();
    m_normlist.erase(m_normlist.begin(), m_normlist.end());
  }
  */
}

void OglDisplayContext::pushMatrix()
{
  glPushMatrix();
}

void OglDisplayContext::multMatrix(const Matrix4D &mat)
{
  GLdouble m[16];

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

  glMultMatrixd(m);
}

void OglDisplayContext::loadMatrix(const Matrix4D &mat)
{
  GLdouble m[16];

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

  glLoadMatrixd(m);
}

void OglDisplayContext::popMatrix()
{
  glPopMatrix();
}

void OglDisplayContext::enableDepthTest(bool f)
{
  if (f)
    ::glDepthMask(GL_TRUE);
  else
    ::glDepthMask(GL_FALSE);
}

void OglDisplayContext::startHit(qlib::uid_t rend_uid)
{
  glLoadName(rend_uid);
  glPushName(-1);
}

void OglDisplayContext::endHit()
{
  glPopName();
}

void OglDisplayContext::drawPointHit(int nid, const Vector4D &pos)
{
  glLoadName(nid);
  //glColor3d(1.0, 1.0, 1.0);

  startPoints();
  vertex(pos);
  end();
}


void OglDisplayContext::loadName(int nameid)
{
  glLoadName(nameid);
}

void OglDisplayContext::pushName(int nameid)
{
  glPushName(nameid);
}

void OglDisplayContext::popName()
{
  glPopName();
}



void OglDisplayContext::setLighting(bool f)
{
  if (!m_bUseShaderAlpha || m_pDefPO==NULL) {
    if (f)
      glEnable(GL_LIGHTING);
    else
      glDisable(GL_LIGHTING);
  }
  else {
    // shader mode
    m_pDefPO->setUniform("enable_lighting", f);
  }
}

void OglDisplayContext::setCullFace(bool f/*=true*/)
{
  if (f)
    glEnable(GL_CULL_FACE);
  else
    glDisable(GL_CULL_FACE);
}

void OglDisplayContext::drawPixels(const Vector4D &pos,
                                   const gfx::PixelBuffer &data,
                                   const gfx::ColorPtr &acol)
{
  // TO DO: use devcolor
  gfx::ColorPtr col = acol;
  if (col.isnull()) {
    //gfx::SolidColor col(m_color);
    col = gfx::ColorPtr(new gfx::SolidColor(m_color));
  }
  

  glRasterPos3d(pos.x(), pos.y(), pos.z());

  const int w = data.getWidth();
  const int h = data.getHeight();

  const QUE_BYTE *pdata = data.data();

  // int nlen = data.size();
  // QUE_BYTE *pdata = new QUE_BYTE[nlen];
  // for (int i=0; i<nlen; ++i)
  // pdata[i] = data.at(i);

  if (data.getDepth()==8) {
    glEnable(GL_ALPHA_TEST);
    glAlphaFunc(GL_GREATER, 0.1);
    glPixelTransferf(GL_RED_BIAS, (float) col->fr());
    glPixelTransferf(GL_GREEN_BIAS, (float) col->fg());
    glPixelTransferf(GL_BLUE_BIAS, (float) col->fb());
    glDrawPixels(w, h, GL_ALPHA, GL_UNSIGNED_BYTE, pdata);
    glPixelTransferf(GL_RED_BIAS, 0);
    glPixelTransferf(GL_GREEN_BIAS, 0);
    glPixelTransferf(GL_BLUE_BIAS, 0);
    glDisable(GL_ALPHA_TEST);
  }
  else if (data.getDepth()==1) {
    glColor4ub(col->r(), col->g(), col->b(), col->a());
    glBitmap(w, h, 0, 0, 0, 0, pdata);
  }

  //delete [] pdata;
}

void OglDisplayContext::drawString(const Vector4D &pos, const qlib::LString &str)
{
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL) return;

  gfx::PixelBuffer pixbuf;
  if (!pTRM->renderText(str, pixbuf))
    return;

  //gfx::SolidColor col(m_color);
  drawPixels(pos, pixbuf, ColorPtr());
}

void OglDisplayContext::setPolygonMode(int id)
{
  switch (id) {
  default:
  case DisplayContext::POLY_FILL:
  case DisplayContext::POLY_FILL_NORGLN:
  case DisplayContext::POLY_FILL_XX:
    //glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);
    glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
    break;
  
  case DisplayContext::POLY_LINE:
    glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);
    break;
  
  case DisplayContext::POLY_POINT:
    glPolygonMode(GL_FRONT_AND_BACK, GL_POINT);
    break;
  }  
}

////////////////////////////////////////////////
// specialized impl for GL matrix stack

void OglDisplayContext::translate(const Vector4D &v)
{
  glTranslated(v.x(), v.y(), v.z());
}

void OglDisplayContext::scale(const Vector4D &v)
{
  glScaled(v.x(), v.y(), v.z());
}

void OglDisplayContext::loadIdent()
{
  glLoadIdentity();
}

//////////////////////////////////////////////////////////////////
// Texture impl

/*
#include "OglTexture.hpp"

void OglDisplayContext::useTexture(const LTexture &tex)
{
  OglTextureRep *pRep = dynamic_cast<OglTextureRep *>(tex.getRep());
  if (pRep==NULL) return;
  glBindTexture(GL_TEXTURE_2D, pRep->getTexID());
  glEnable(GL_TEXTURE_2D);
}

void OglDisplayContext::unuseTexture()
{
  glDisable(GL_TEXTURE_2D);
}

void OglDisplayContext::texCoord(float fx, float fy)
{
  glTexCoord2d(fx, fy);
}
*/

//////////////////////////////////////////////////////////////////
// Display list impl

DisplayContext *OglDisplayContext::createDisplayList()
{
  OglDisplayList *pdl = MB_NEW OglDisplayList(m_nSceneID);
  // inherit properties (default alpha/material/pixsclfac)
  pdl->setAlpha(getAlpha());
  pdl->setMaterial(getMaterial());
  pdl->setUseShaderAlpha(useShaderAlpha());
  pdl->setPixSclFac(getPixSclFac());
  return pdl;
}

bool OglDisplayContext::canCreateDL() const
{
  return true;
}

void OglDisplayContext::callDisplayList(DisplayContext *pdl)
{
  OglDisplayList *psrc = dynamic_cast<OglDisplayList *>(pdl);
  if (psrc==NULL || !psrc->isValid())
    return;

  GLuint id = psrc->getID();
  if (id==0)
    return;

  glCallList(id);
}

bool OglDisplayContext::isCompatibleDL(DisplayContext *pdl) const
{
  OglDisplayList *psrc = dynamic_cast<OglDisplayList *>(pdl);
  if (psrc==NULL)
    return false;
  return true;
}

bool OglDisplayContext::isDisplayList() const
{
  return false;
}

bool OglDisplayContext::recordStart()
{
  return false;
}

void OglDisplayContext::recordEnd()
{
}

//////////////////////////////////////////////////////////////////
// Quadric object drawing impl

namespace {
GLUquadricObj *createQuadricObj()
{
  GLUquadricObj *quadObj;

  quadObj = gluNewQuadric(); 
  gluQuadricDrawStyle(quadObj, GLU_FILL); 
  gluQuadricOrientation(quadObj, GLU_OUTSIDE); 
  gluQuadricNormals(quadObj, GLU_SMOOTH); 
  return quadObj;
}

void setTransRot(const Vector4D &pos, const Vector4D &vec)
{
  double a, f, m[4][4];

  a = sqrt(vec.x() * vec.x() + vec.y() * vec.y());
  if (a > 1.0e-6) {
    f = 1.0 / a;
    m[0][0] = vec.x() * vec.z() * f;
    m[0][1] = vec.y() * vec.z() * f;
    m[0][2] = - a;
    m[0][3] = 0.0;
    m[1][0] = - vec.y() * f;
    m[1][1] = vec.x() * f;
    m[1][2] = 0.0;
    m[1][3] = 0.0;
    m[2][0] = vec.x();
    m[2][1] = vec.y();
    m[2][2] = vec.z();
    m[2][3] = 0.0;
    m[3][0] = pos.x();
    m[3][1] = pos.y();
    m[3][2] = pos.z();
    m[3][3] = 1.0;
    ::glMultMatrixd(&m[0][0]);
  } else {
    ::glTranslated(pos.x(), pos.y(), pos.z());
    if (vec.z()<0.0)
      ::glRotated(180.0, 1.0, 0.0, 0.0);
  }
}

} // namespace

void OglDisplayContext::sphere()
{
  if (m_pGluData==NULL) {
    m_pGluData = createQuadricObj();
  }

  ::gluSphere((GLUquadricObj *)m_pGluData, 1, (m_nDetail+1)*2, m_nDetail+1); 
}

void OglDisplayContext::cone(double r1, double r2,
                             const Vector4D &pos1, const Vector4D &pos2,
                             bool bCap)
{
  if (m_pGluData==NULL) {
    m_pGluData = createQuadricObj();
  }

  pushMatrix();

  Vector4D dv = pos2 - pos1;
  double len = dv.length();
  dv /= len;
  setTransRot(pos1, dv);

  gluCylinder((GLUquadricObj *)m_pGluData, r1, r2, len, (m_nDetail+1)*2, 1); 
  // gluCylinder((GLUquadricObj *)m_pGluData, r, r, len, 10, 1); 

  if (bCap) {
    if (r1>1.0e-4) {
      glPushMatrix();
      glRotated(180, 1, 0, 0);
      gluDisk((GLUquadricObj *)m_pGluData, 0.0, r1,
              (m_nDetail+1)*2, 1);
      glPopMatrix();
    }
    
    if (r2>1.0e-4) {
      glTranslated(0, 0, len);
      gluDisk((GLUquadricObj *)m_pGluData, 0.0, r2,
              (m_nDetail+1)*2, 1);
    }
  }

  popMatrix();
}

void OglDisplayContext::sphere(double r, const Vector4D &vec)
{
  pushMatrix();
  translate(vec);
  scale(Vector4D(r,r,r));
  sphere();
  popMatrix();
}

/*
void OglDisplayContext::cylinder(double r, const Vector4D &pos1, const Vector4D &pos2)
{
  cone(r, r, pos1, pos2, false);
}

void OglDisplayContext::cylinderCap(double r, const Vector4D &pos1, const Vector4D &pos2)
{
  cone(r, r, pos1, pos2, true);
}
*/

void OglDisplayContext::setDetail(int n)
{
  m_nDetail = n;
}

int OglDisplayContext::getDetail() const
{
  return m_nDetail;
}

void OglDisplayContext::drawMesh(const gfx::Mesh &mesh)
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

  int calpha;
  if (!useShaderAlpha())
    calpha = int(getAlpha()* 255.0 + 0.5);
  else
    calpha = 255;
  mesh.convRGBAByteCols(pcols, nverts*4, calpha, m_nSceneID);

  glColorPointer(4, GL_UNSIGNED_BYTE, 0, pcols);

  const int *pinds = mesh.getFaces();

  glDrawElements(GL_TRIANGLES, 3*nfaces, GL_UNSIGNED_INT, pinds);

  delete [] pcols;

  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
  glDisableClientState(GL_COLOR_ARRAY);
}

/////////////////////////////////////////////////

void OglDisplayContext::drawElem(const AbstDrawElem &ade)
{
  const int ntype = ade.getType();

  if (ntype==DrawElem::VA_PIXEL) {
    drawElemPix(static_cast<const DrawElemPix &>(ade));
    return;
  }

  if (!qsys::View::hasVBO()) {
    if (ntype==AbstDrawElem::VA_ATTRS||
        ntype==AbstDrawElem::VA_ATTR_INDS) {
      // ERROR: not supported
      MB_DPRINTLN("Ogl.drawElem> Fatal Error: no VBO support --> cannot draw attr array!!");
    }
    else {
      // fall back to the vertex array impl
      drawElemVA(static_cast<const DrawElem &>(ade));
    }
    return;
  }

  if (ntype==AbstDrawElem::VA_ATTRS||
      ntype==AbstDrawElem::VA_ATTR_INDS) {
    // shader attribute impl
    drawElemAttrs(static_cast<const gfx::AbstDrawAttrs &>(ade));
    return;
  }

  //
  // implementation using OpenGL fixed pipeline
  //
  
  //const int nelems = ade.getSize();
  //int ninds = 0;

  gfx::DrawElemImpl *pRep = ade.getImpl();
  if (pRep==NULL) {
    if (ntype==DrawElem::VA_VNCI ||
        ntype==DrawElem::VA_VNCI32)
      pRep = MB_NEW OglDrawElemImpl(m_nSceneID);
    else
      pRep = MB_NEW OglDrawArrayImpl(m_nSceneID);

    ade.setImpl(pRep);

    //de.create();
    pRep->create(ade);
  }
  else if (ade.isUpdated()) {
    pRep->update(ade);
    ade.setUpdated(false);
  }

  const DrawElem &de = static_cast<const DrawElem &>(ade);
  glLineWidth( de.getLineWidth() * float(getPixSclFac()) );
  glPointSize( de.getLineWidth() * float(getPixSclFac()) );
  quint32 cc = de.getDefColor();
  glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
             gfx::getACode(cc));

  pRep->preDraw(ade);
  pRep->draw(ade);
  pRep->postDraw(ade);

  /*
  if (ntype==AbstDrawElem::VA_VNC||
      ntype==AbstDrawElem::VA_VNCI||
      ntype==AbstDrawElem::VA_VNCI32){
    const DrawElemVNC &de = static_cast<const DrawElemVNC &>(ade);
    const int nverts = de.getSize();
    DrawElemV dbg;
    dbg.setDrawMode(DrawElemV::DRAW_LINES);
    dbg.alloc(nverts * 2);
    for (int i=0; i<nverts; ++i) {
      Vector4D v, n;
      de.getVertex(i, v);
      de.getNormal(i, n);
      dbg.vertex(i*2, v);
      dbg.vertex(i*2+1, v+n.scale(0.1));
    }
    dbg.setLineWidth(1.0);
    drawElem(dbg);
  }*/

  return;
}


void OglDisplayContext::drawElemPix(const gfx::DrawElemPix &de)
{
  gfx::ColorPtr pcol = gfx::ColorPtr(new gfx::SolidColor(de.m_color));
  drawPixels(de.m_pos, *de.m_pPixBuf, pcol);
}

/// Draw element (vertex array version)
void OglDisplayContext::drawElemVA(const DrawElem &de)
{
  GLenum mode = convDrawMode(de.getDrawMode());

  glLineWidth( de.getLineWidth() * float(getPixSclFac())  );

  quint32 cc = de.getDefColor();
  glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
             gfx::getACode(cc));

  const int ntype = de.getType();
  const int nelems = de.getSize();
  if (ntype==DrawElem::VA_VC) {
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);
    const qbyte *pdata = static_cast<const qbyte *>(de.getData());
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVC::Elem), pdata);
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVC::Elem), pdata+3*sizeof(qfloat32));
  }
  else if (ntype==DrawElem::VA_VNC) {
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);
    const qbyte *pdata = static_cast<const qbyte *>(de.getData());
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVNC::Elem), pdata);
    glNormalPointer(GL_FLOAT, sizeof(DrawElemVNC::Elem), pdata+3*sizeof(qfloat32));
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVNC::Elem), pdata+6*sizeof(qfloat32));
  }

  glDrawArrays(mode, 0, nelems);

  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
  glDisableClientState(GL_COLOR_ARRAY);
}


void OglDisplayContext::drawElemAttrs(const gfx::AbstDrawAttrs &ada)
{
  const int itype = ada.getType();
  
  gfx::DrawElemImpl *pRep = ada.getImpl();
  if (pRep==NULL) {
    if (itype==AbstDrawElem::VA_ATTR_INDS) {
      //if(GLEW_ARB_vertex_array_object)
      //pRep = MB_NEW OglVAOElemImpl(m_nSceneID);
      //else
      pRep = MB_NEW OglDrawElemAttrsImpl(m_nSceneID);
    }
    else {
      //if(GLEW_ARB_vertex_array_object)
      //  pRep = MB_NEW OglVAOArrayImpl(m_nSceneID);
      //else
      pRep = MB_NEW OglDrawArrayAttrsImpl(m_nSceneID);
    }

    ada.setImpl(pRep);

    //de.create();
    pRep->create(ada);
  }
  else if (ada.isUpdated()) {
    pRep->update(ada);
    ada.setUpdated(false);
  }

  /*
  glLineWidth( de.getLineWidth() * float(getPixSclFac()) );
  glPointSize( de.getLineWidth() * float(getPixSclFac()) );
  quint32 cc = de.getDefColor();
  glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
             gfx::getACode(cc));
   */
  
  pRep->preDraw(ada);
  pRep->draw(ada);
  pRep->postDraw(ada);

  return;

}


OglProgramObject *OglDisplayContext::createProgramObject(const LString &name)
{
  OglProgramObject *pRval = NULL;

  if (!qsys::View::hasVS())
    return NULL;

#ifdef HAVE_GLEW
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
#endif

  return pRval;
}

OglProgramObject *OglDisplayContext::getProgramObject(const LString &name)
{
  ProgTab::const_iterator i = m_progs.find(name);
  if (i==m_progs.end())
    return NULL;
  return i->second;
}

bool OglDisplayContext::destroyProgramObject(const LString &name)
{
  ProgTab::iterator i = m_progs.find(name);
  if (i==m_progs.end())
    return false;
  
  OglProgramObject *pdel = i->second;
  m_progs.erase(i);
  delete pdel;
  return true;
}

//////////

#include "OglTexture.hpp"

void OglDisplayContext::useTexture(gfx::Texture *pTex, int nunit)
{
  if (pTex->getRep()==NULL) {
    OglTextureRep *pRep = MB_NEW OglTextureRep(m_nSceneID, nunit);
    pTex->setRep(pRep);
  }
  pTex->use();
}

void OglDisplayContext::unuseTexture(gfx::Texture *pTex)
{
  pTex->unuse();
}
