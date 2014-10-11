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

#include "OglDisplayContext.hpp"
#include "OglDisplayList.hpp"
#include "OglProgramObject.hpp"

#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/DrawElem.hpp>

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>

using namespace sysdep;
using gfx::DisplayContext;
using gfx::DrawElem;
using gfx::DrawElemV;
using gfx::DrawElemVC;
using gfx::DrawElemVNC;
using gfx::DrawElemVNCI;
using gfx::DrawElemPix;

OglDisplayContext::OglDisplayContext(int sceneid)
{
  m_nSceneID = sceneid;
  m_pGluData = NULL;
  m_color = Vector4D(1.0, 1.0, 1.0, 1.0);
  m_nDetail = 5;

  m_bUseShaderAlpha = false;
  m_pDefPO = NULL;
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
#endif
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

  m_color.x() = c->fr();
  m_color.y() = c->fg();
  m_color.z() = c->fb();
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
  m_color.x() = r;
  m_color.y() = g;
  m_color.z() = b;

  if (useShaderAlpha())
    m_color.w() = a * getAlpha();
  else
    m_color.w() = a;
  
  ::glColor4d(m_color.x(), m_color.y(), m_color.z(), m_color.w());
}

void OglDisplayContext::color(double r, double g, double b)
{
  m_color.x() = r;
  m_color.y() = g;
  m_color.z() = b;

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
  case DisplayContext::POLY_FILL_NOEGLN:
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
  mesh.convRGBAByteCols(pcols, nverts*4, calpha);

  glColorPointer(4, GL_UNSIGNED_BYTE, 0, pcols);

  const int *pinds = mesh.getFaces();

  glDrawElements(GL_TRIANGLES, 3*nfaces, GL_UNSIGNED_INT, pinds);

  delete [] pcols;

  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
  glDisableClientState(GL_COLOR_ARRAY);
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
    case DrawElem::DRAW_QUAD_STRIP:
      mode = GL_QUAD_STRIP;
      break;
    case DrawElem::DRAW_QUADS:
      mode = GL_QUADS;
      break;
    case DrawElem::DRAW_POLYGON:
      mode = GL_POLYGON;
      break;
    default: {
      LString msg = "Ogl DrawElem: invalid draw mode";
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::RuntimeException, msg);
    }
    }
    return mode;
  }
}

/////////////////////////////////////////////////

#ifdef HAVE_GLEW
namespace {
  class OglVBORep : public gfx::VBORep
  {
  public:
    qlib::uid_t m_nSceneID;
    GLuint m_nBufID;
    
    virtual ~OglVBORep()
    {
      qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(m_nSceneID);
      if (rsc.isnull()) {
        MB_DPRINTLN("OglVBO> unknown scene, VBO %d cannot be deleted", m_nBufID);
        return;
      }

      qsys::Scene::ViewIter viter = rsc->beginView();
      if (viter==rsc->endView()) {
        MB_DPRINTLN("OglVBO> no view, VBO %d cannot be deleted", m_nBufID);
        return;
      }

      qsys::ViewPtr rvw = viter->second;
      if (rvw.isnull()) {
        // If any views aren't found, it is no problem,
        // because the parent context (and also all DLs) may be already destructed.
        return;
      }
      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      
      GLuint buffers[1];
      buffers[0] = m_nBufID;
      glDeleteBuffers(1, buffers);
    }
  };
}
#endif

void OglDisplayContext::drawElem(const DrawElem &de)
{
  const int ntype = de.getType();

  if (ntype==DrawElem::VA_PIXEL) {
    drawElemPix(static_cast<const DrawElemPix &>(de));
    return;
  }

  //if (!hasVBO()) {
  if (!qsys::View::hasVBO()) {
    // fall back to the vertex array impl
    drawElemVA(de);
    return;
  }

#ifdef HAVE_GLEW
  const int nelems = de.getSize();
  int ninds = 0;
  GLuint nvbo = 0;
  GLuint nvbo_ind = 0;
  if (de.getVBO()==NULL) {
    // Make VBO
    glGenBuffers(1, &nvbo);
    OglVBORep *pRep = MB_NEW OglVBORep();
    pRep->m_nBufID = nvbo;
    pRep->m_nSceneID = m_nSceneID;
    de.setVBO(pRep);

    // Init VBO & copy data
    glBindBuffer(GL_ARRAY_BUFFER, nvbo);

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
      OglVBORep *pRep = MB_NEW OglVBORep();
      pRep->m_nBufID = nvbo_ind;
      pRep->m_nSceneID = m_nSceneID;
      devnci.setIndexVBO(pRep);
      ninds = devnci.getIndexSize();

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
    OglVBORep *pRep = (OglVBORep *) de.getVBO();
    nvbo = pRep->m_nBufID;
    glBindBuffer(GL_ARRAY_BUFFER, nvbo);

    if (ntype==DrawElem::VA_VNCI) {
      const DrawElemVNCI &devnci = static_cast<const DrawElemVNCI&>(de);
      OglVBORep *pRep = (OglVBORep *) devnci.getIndexVBO();
      nvbo_ind = pRep->m_nBufID;
      ninds = devnci.getIndexSize();
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, nvbo_ind);
    }
  }
  //MB_ASSERT(nvbo!=0);

  GLenum mode = convDrawMode(de.getDrawMode());

  glLineWidth( de.getLineWidth() * float(getPixSclFac()) );
  glPointSize( de.getLineWidth() * float(getPixSclFac()) );
  quint32 cc = de.getDefColor();
  glColor4ub(gfx::getRCode(cc),
             gfx::getGCode(cc),
             gfx::getBCode(cc),
             gfx::getACode(cc));

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

#endif
}

/*
namespace {
  class OglTexRep : public gfx::VBORep
  {
  public:
    qlib::uid_t m_nSceneID;
    GLuint m_nBufID;
    
    virtual ~OglTexRep()
    {
      qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(m_nSceneID);
      if (rsc.isnull()) {
        MB_DPRINTLN("OglTexture> unknown scene, Texture %d cannot be deleted", m_nBufID);
        return;
      }

      qsys::Scene::ViewIter viter = rsc->beginView();
      if (viter==rsc->endView()) {
        MB_DPRINTLN("OglTexture> no view, Texture %d cannot be deleted", m_nBufID);
        return;
      }

      qsys::ViewPtr rvw = viter->second;
      if (rvw.isnull()) {
        // If any views aren't found, it is no problem,
        // because the parent context (and also all DLs) may be already destructed.
        return;
      }
      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      
      glDeleteTextures(1, &m_nBufID);
    }
  };
}
*/

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
    const qbyte *pdata = (const qbyte *) static_cast<const DrawElemVC&>(de).getData();
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVC::Elem), pdata);
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVC::Elem), pdata+3*sizeof(qfloat32));
  }
  else if (ntype==DrawElem::VA_VNC) {
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);
    const DrawElemVNC::Elem *pdata = static_cast<const DrawElemVNC&>(de).getData();
    glVertexPointer(3, GL_FLOAT, sizeof(DrawElemVNC::Elem), pdata);
    glNormalPointer(GL_FLOAT, sizeof(DrawElemVNC::Elem), pdata+3*sizeof(qfloat32));
    glColorPointer(4, GL_UNSIGNED_BYTE, sizeof(DrawElemVNC::Elem), pdata+6*sizeof(qfloat32));
  }

  glDrawArrays(mode, 0, nelems);

  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
  glDisableClientState(GL_COLOR_ARRAY);
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

