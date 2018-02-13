// -*-Mode: C++;-*-
//
//  Interaction line renderer class (GLSL ver 2)
//

#include <common.h>
#include "GLSLAtomIntr2Renderer.hpp"

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/SelCommand.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/Texture.hpp>

#include <qsys/SceneManager.hpp>

#include <sysdep/OglShaderSetupHelper.hpp>

#ifdef WIN32
#  define USE_TBO 1
#else
#endif

using namespace molvis;
using namespace molstr;

GLSLAtomIntr2Renderer::GLSLAtomIntr2Renderer()
     : super_t()
{
  m_pPO = NULL;
  m_pAttrAry = NULL;
  m_pLabPO = NULL;
  m_pLabAttrAry = NULL;
  m_pLabelTex = NULL;

  m_pNumTex = NULL;
  m_nDigits = 6;

  setForceGLSL(true);
}

GLSLAtomIntr2Renderer::~GLSLAtomIntr2Renderer()
{
}

//////////////////////////////////////////////////////////////////////////

LString GLSLAtomIntr2Renderer::toString() const
{
  return LString::format("GLSLAtomIntr2Renderer %p", this);
}

bool GLSLAtomIntr2Renderer::isTransp() const
{
  if (isShowLabel())
    return true;
  else
    return super_t::isTransp();
    //return false;
}


//////////////////////////////////////////////////////////////////////////

/// Use ver2 interface, if shader is available
///  (Fall back to legacy impl (AtomIntr2Renderer) if the shader is not available)
bool GLSLAtomIntr2Renderer::isUseVer2Iface() const
{
  if (isShaderAvail())
    return true;
  else
    return false; // --> fall back to legacy impl
}

/// Initialize & setup capabilities (for glsl setup)
bool GLSLAtomIntr2Renderer::init(DisplayContext *pdc)
{
  {
    sysdep::OglShaderSetupHelper<GLSLAtomIntr2Renderer> ssh(this);

    if (!ssh.checkEnvVS()) {
      LOG_DPRINTLN("AtomIntr2> ERROR: GLSL not supported.");
      //MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
      setShaderAvail(false);
      return false;
    }

    if (m_pPO==NULL) {
      m_pPO = ssh.createProgObj("gpu_stpline1",
                                "%%CONFDIR%%/data/shaders/stpline1_vert.glsl",
                                "%%CONFDIR%%/data/shaders/stpline1_frag.glsl");
    }

    if (m_pPO==NULL) {
      LOG_DPRINTLN("AtomIntr2> ERROR: cannot create progobj.");
      setShaderAvail(false);
      return false;
    }

    m_pPO->enable();

    // setup attributes
    m_nPos1Loc = m_pPO->getAttribLocation("a_pos1");
    m_nPos2Loc = m_pPO->getAttribLocation("a_pos2");
    m_nHwidthLoc = m_pPO->getAttribLocation("a_hwidth");
    m_nDirLoc = m_pPO->getAttribLocation("a_dir");

    m_pPO->disable();
  }

  ///////////////////////
  // Setup label rendering

  {
    sysdep::OglShaderSetupHelper<GLSLAtomIntr2Renderer> ssh(this);

    if (!ssh.checkEnvVS()) {
      LOG_DPRINTLN("AtomIntr2> ERROR: GLSL not supported.");
      //MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
      setShaderAvail(false);
      return false;
    }

    if (m_pLabPO==NULL) {
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
    ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif
      m_pLabPO = ssh.createProgObj("gpu_numlabel1",
                                   "%%CONFDIR%%/data/shaders/numlabel1_vert.glsl",
                                   "%%CONFDIR%%/data/shaders/numlabel1_frag.glsl");
    }

    if (m_pLabPO==NULL) {
      LOG_DPRINTLN("AtomIntr2> ERROR: cannot create progobj.");
      setShaderAvail(false);
      return false;
    }
  }

  setShaderAvail(true);
  return true;
}

bool GLSLAtomIntr2Renderer::isCacheAvail() const
{
  return (m_pAttrAry!=NULL) && (m_pLabAttrAry!=NULL);
}

/// Create GLSL data (VBO, texture, etc)
void GLSLAtomIntr2Renderer::createGLSL()
{
  int i;
  
  // XXX: fix this
  //int nlines = m_data.size();
  int nlines = 0;
  for (const AtomIntrData &value: m_data) {
    switch (value.nmode) {
    case 1:
      nlines +=1;
      break;
    case 2:
      nlines +=2;
      break;
    case 3:
      nlines +=3;
      break;
    }
  }

  //
  // Create VBO
  //
  
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  m_pAttrAry = MB_NEW AttrArray();
  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(4);
  attra.setAttrInfo(0, m_nPos1Loc, 3, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, pos1x));
  attra.setAttrInfo(1, m_nPos2Loc, 3, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, pos2x));
  attra.setAttrInfo(2, m_nHwidthLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, hwidth));
  attra.setAttrInfo(3, m_nDirLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, dir));

  attra.alloc(nlines*4);
  attra.allocInd(nlines*6);

  attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

  // Fill the fixed data in Line VBO
  for (i=0; i<nlines; ++i) {
    const int ive = i*4;
    const int ifc = i*6;
    
    // vertex data
    attra.at(ive+0).hwidth = 0.5f;
    attra.at(ive+1).hwidth = -0.5f;
    attra.at(ive+2).hwidth = -0.5f;
    attra.at(ive+3).hwidth = 0.5f;
    
    attra.at(ive+0).dir = 0.0f;
    attra.at(ive+1).dir = 0.0f;
    attra.at(ive+2).dir = 1.0f;
    attra.at(ive+3).dir = 1.0f;

    // face indices
    attra.atind(ifc+0) = ive + 0;
    attra.atind(ifc+1) = ive + 1;
    attra.atind(ifc+2) = ive + 2;
    attra.atind(ifc+3) = ive + 2;
    attra.atind(ifc+4) = ive + 1;
    attra.atind(ifc+5) = ive + 3;
  }

  ////////////////////////////////
  // create label rendering data
  int nlabels = m_data.size();
  
  // Create digit label texture atlas

  if (m_pLabelTex!=NULL)
    delete m_pLabelTex;

  m_pLabelTex = MB_NEW gfx::Texture();
  m_pLabelTex->setLinIntpol(true);
  m_pLabelTex->setup(gfx::Texture::DIM_2DRECT,
                     gfx::Texture::FMT_R,
                     gfx::Texture::TYPE_UINT8_COLOR);

  // Create number data texture
  
  if (m_pNumTex!=NULL)
    delete m_pNumTex;
  m_pNumTex = MB_NEW gfx::Texture();

  m_pNumTex->setup(gfx::Texture::DIM_1D,
                   gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8_COLOR);

  m_numpix.resize(nlabels * m_nDigits);

  // Create VBO
  //
  {
    if (m_pLabAttrAry!=NULL)
      delete m_pLabAttrAry;

    m_pLabAttrAry = MB_NEW LabAttrArray();
    auto pa = m_pLabAttrAry;
    pa->setAttrSize(4);
    pa->setAttrInfo(0, m_pLabPO->getAttribLocation("a_xyz"), 3, qlib::type_consts::QTC_FLOAT32, offsetof(LabAttrElem, x));
    pa->setAttrInfo(1, m_pLabPO->getAttribLocation("a_nxyz"), 3, qlib::type_consts::QTC_FLOAT32, offsetof(LabAttrElem, nx));
    pa->setAttrInfo(2, m_pLabPO->getAttribLocation("a_wh"), 2, qlib::type_consts::QTC_FLOAT32, offsetof(LabAttrElem, w));
    pa->setAttrInfo(3, m_pLabPO->getAttribLocation("a_disp"), 2, qlib::type_consts::QTC_FLOAT32, offsetof(LabAttrElem, dx));
    //pa->setAttrInfo(3, m_pLabPO->getAttribLocation("a_width"), 1, qlib::type_consts::QTC_FLOAT32, offsetof(LabAttrElem, width));
    //pa->setAttrInfo(4, m_pLabPO->getAttribLocation("a_addr"), 1, qlib::type_consts::QTC_FLOAT32, offsetof(LabAttrElem, addr));

    pa->alloc(nlabels*4);
    pa->allocInd(nlabels*6);

    pa->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    //pa->setDrawMode(gfx::AbstDrawElem::DRAW_POINTS);

    // setup face indices
    for (int i=0; i<nlabels; ++i) {
      const int ive = i*4;
      const int ifc = i*6;
      pa->atind(ifc+0) = ive + 0;
      pa->atind(ifc+1) = ive + 1;
      pa->atind(ifc+2) = ive + 2;
      pa->atind(ifc+3) = ive + 2;
      pa->atind(ifc+4) = ive + 1;
      pa->atind(ifc+5) = ive + 3;
    }
  }
}

/// update VBO positions using CrdArray
void GLSLAtomIntr2Renderer::updateDynamicGLSL()
{
  // TO DO: impl
  updateStaticGLSL();
}

void GLSLAtomIntr2Renderer::setLineAttr(int ive, const Vector4D &pos1, const Vector4D &pos2)
{
  AttrArray &attra = *m_pAttrAry;

  attra.at(ive+0).pos1x = float( pos1.x() );
  attra.at(ive+0).pos1y = float( pos1.y() );
  attra.at(ive+0).pos1z = float( pos1.z() );

  attra.at(ive+0).pos2x = float( pos2.x() );
  attra.at(ive+0).pos2y = float( pos2.y() );
  attra.at(ive+0).pos2z = float( pos2.z() );

  attra.at(ive+1).pos1x = float( pos1.x() );
  attra.at(ive+1).pos1y = float( pos1.y() );
  attra.at(ive+1).pos1z = float( pos1.z() );

  attra.at(ive+1).pos2x = float( pos2.x() );
  attra.at(ive+1).pos2y = float( pos2.y() );
  attra.at(ive+1).pos2z = float( pos2.z() );

  attra.at(ive+2).pos1x = float( pos2.x() );
  attra.at(ive+2).pos1y = float( pos2.y() );
  attra.at(ive+2).pos1z = float( pos2.z() );

  attra.at(ive+2).pos2x = float( pos1.x() );
  attra.at(ive+2).pos2y = float( pos1.y() );
  attra.at(ive+2).pos2z = float( pos1.z() );

  attra.at(ive+3).pos1x = float( pos2.x() );
  attra.at(ive+3).pos1y = float( pos2.y() );
  attra.at(ive+3).pos1z = float( pos2.z() );

  attra.at(ive+3).pos2x = float( pos1.x() );
  attra.at(ive+3).pos2y = float( pos1.y() );
  attra.at(ive+3).pos2z = float( pos1.z() );
}

void GLSLAtomIntr2Renderer::setLabelAttr(int ive, const Vector4D &pos1, const Vector4D &pos2)
{
  auto pa = m_pLabAttrAry;

  Vector4D pos = (pos1+pos2).scale(0.5);
  Vector4D dir = pos2-pos1;
  for (int j=0; j<4; ++j) {
    pa->at(ive+j).x = qfloat32( pos.x() );
    pa->at(ive+j).y = qfloat32( pos.y() );
    pa->at(ive+j).z = qfloat32( pos.z() );
    
    pa->at(ive+j).nx = qfloat32( dir.x() );
    pa->at(ive+j).ny = qfloat32( dir.y() );
    pa->at(ive+j).nz = qfloat32( dir.z() );
  }
}

void GLSLAtomIntr2Renderer::setLabelDigits(int ilab, double dist)
{
  int j;

  LString strlab = LString::format("%.2f", dist);
  if (strlab.length()>m_nDigits) {
    // overflow --> show "******"
    for (j=0; j<m_nDigits; ++j)
      m_numpix[ilab*m_nDigits + j] = 11; // '*'
  }
  else {
    if (strlab.length()<m_nDigits)
      strlab = ("     " + strlab).right(m_nDigits);
    for (j=0; j<m_nDigits; ++j) {
      qbyte c = 12; // ' ' (ws)
      if (j<strlab.length()) {
        char cc = strlab.getAt(j);
        if (cc=='.')
          c = 10; // '.'
        else if ('0'<=cc && cc<='9')
          c = cc-'0'; // '0'-'9'
      }
      m_numpix[ilab*m_nDigits + j] = c;
    }
  }
}

/// update VBO positions using getPos
void GLSLAtomIntr2Renderer::updateStaticGLSL()
{
  Vector4D pos1, pos2, pos3, pos4;
  int ilin=0, ilab=0, j;

  AttrArray &attra = *m_pAttrAry;
  auto pa = m_pLabAttrAry;

  for (AtomIntrData &value: m_data) {

    switch (value.nmode) {
    case 1:
      // Distance
      if (evalPos(value.elem0, pos1) &&
          evalPos(value.elem1, pos2)) {
        // vertex data
        setLineAttr(ilin*4, pos1, pos2);
        
        // label vertex data
        setLabelAttr(ilab*4, pos1, pos2);
      
        // label digits
        double dist = (pos1-pos2).length();
        setLabelDigits(ilab, dist);
      }
      ++ilin;
      ++ilab;
      break;

    case 2:
      // Angle
      if (evalPos(value.elem0, pos1) &&
          evalPos(value.elem1, pos2) &&
          evalPos(value.elem2, pos3)) {
        // vertex data
        setLineAttr(ilin*4, pos1, pos2);
        setLineAttr((ilin+1)*4, pos2, pos3);
        
        // label vertex data
        Vector4D p13 = pos3-pos1;
        setLabelAttr(ilab*4, pos2+p13, pos2-p13);
      
        // label digits
        double angl = qlib::toDegree(Vector4D::angle((pos1-pos2), (pos3-pos2)));
        //double angl = 0.456;
        setLabelDigits(ilab, angl);
      }
      ilin += 2;
      ++ilab;
      break;

    case 3:
      // Angle
      if (evalPos(value.elem0, pos1) &&
          evalPos(value.elem1, pos2) &&
          evalPos(value.elem2, pos3) &&
          evalPos(value.elem3, pos4)) {
        // vertex data
        setLineAttr(ilin*4, pos1, pos2);
        setLineAttr((ilin+1)*4, pos2, pos3);
        setLineAttr((ilin+2)*4, pos3, pos4);
        
        // label vertex data
        setLabelAttr(ilab*4, pos2, pos3);
      
        // label digits
        double dihe = qlib::toDegree(Vector4D::torsion(pos1, pos2, pos3, pos4));
        //double dihe = 0.123;
        setLabelDigits(ilab, dihe);
      }
      ilin += 3;
      ++ilab;
      break;
    }

  }  

  attra.setUpdated(true);

  pa->setUpdated(true);

  m_pNumTex->setData(m_numpix.size(), 1, 1, &m_numpix[0]);
}

/// Render to display (using GLSL)
void GLSLAtomIntr2Renderer::renderGLSL(DisplayContext *pdc)
{
  //////////
  // Draw lines

  if (m_pPO==NULL )
    return; // Error, shader program is not available (ignore)

  // setup stipple
  float s0, s1;
  if (m_nTopStipple==0) {
    s0 = 1.0f;
    s1 = 0.0f;
  }
  else if (m_nTopStipple==1) {
    s0 = s1 = m_stipple[0];
  }
  else {
    s0 = m_stipple[0];
    s1 = m_stipple[1];
  }

  // Get label color
  qlib::uid_t nSceneID = getSceneID();
  float fr=0.0f, fg=0.0f, fb=0.0f, fa = pdc->getAlpha();
  if (!getColor().isnull()) {
    quint32 dcc = getColor()->getDevCode(nSceneID);
    fr = gfx::convI2F(gfx::getRCode(dcc));
    fg = gfx::convI2F(gfx::getGCode(dcc));
    fb = gfx::convI2F(gfx::getBCode(dcc));
    fa *= gfx::convI2F(gfx::getACode(dcc));
  }

  // view width/height
  float width = 1.0f, height = 1.0f;
  float sclx = 1.0f, scly = 1.0f;
  qsys::View *pView = pdc->getTargetView();
  if (pView!=NULL) {
    if (pView->useSclFac()) {
      sclx = (float) pView->getSclFacX();
      scly = (float) pView->getSclFacY();
    }
    width = (float) pView->getWidth()*0.5f*sclx;// * 3.0f/4.0f;
    height = (float) pView->getHeight()*0.5f*scly;// * 3.0f/4.0f;
  }

  m_pPO->enable();
  
  m_pPO->setUniformF("u_width", getWidth());
  m_pPO->setUniformF("u_stipple", s0, s1);
  m_pPO->setUniformF("u_color", fr, fg, fb, fa);
  
  m_pPO->setUniformF("u_winsz", width, height);

  pdc->drawElem(*m_pAttrAry);
  m_pPO->disable();

  //////////
  // Draw labels
  
  if (m_pLabPO!=NULL) {
    if (m_pixall.empty())
      createTextureData(pdc, sclx, scly);
    
    // Determine ppa
    float ppa = -1.0f;
    
    // Get label color
    float fr=0.0f, fg=0.0f, fb=0.0f, fa = pdc->getAlpha();
    if (!getColor().isnull()) {
      quint32 dcc = getColor()->getDevCode(nSceneID);
      fr = gfx::convI2F(gfx::getRCode(dcc));
      fg = gfx::convI2F(gfx::getGCode(dcc));
      fb = gfx::convI2F(gfx::getBCode(dcc));
      fa *= gfx::convI2F(gfx::getACode(dcc));
    }
    
    pdc->useTexture(m_pLabelTex, LABEL_TEX_UNIT);
    pdc->useTexture(m_pNumTex, NUM_TEX_UNIT);
    
    m_pLabPO->enable();
    m_pLabPO->setUniform("labelTex", LABEL_TEX_UNIT);
    m_pLabPO->setUniform("numTex", NUM_TEX_UNIT);
    m_pLabPO->setUniformF("u_winsz", width, height);
    m_pLabPO->setUniformF("u_ppa", ppa);
    m_pLabPO->setUniformF("u_color", fr, fg, fb, fa);
    m_pLabPO->setUniformF("u_digitw", float(m_nDigitW));
    //m_pLabPO->setUniformF("u_digitb", float(m_nDigitW*m_nDigitH));
    m_pLabPO->setUniformF("u_ndigit", m_nDigits);
    pdc->drawElem(*m_pLabAttrAry);
    
    m_pLabPO->disable();
    
    pdc->unuseTexture(m_pLabelTex);
    pdc->unuseTexture(m_pNumTex);

  }

}

void GLSLAtomIntr2Renderer::invalidateDisplayCache()
{
  // clean-up internal data
  // clearAllLabelPix();

  if (m_pAttrAry!=NULL) {
    delete m_pAttrAry;
    m_pAttrAry = NULL;
  }

  m_pixall.clear();
  if (m_pLabelTex!=NULL) {
    delete m_pLabelTex;
    m_pLabelTex = NULL;
  }
  if (m_pLabAttrAry!=NULL) {
    delete m_pLabAttrAry;
    m_pLabAttrAry = NULL;
  }

  // clean-up display list (if exists; in compatible mode)
  super_t::invalidateDisplayCache();
}

void GLSLAtomIntr2Renderer::createTextureData(DisplayContext *pdc, float asclx, float scly)
{
  int i,j,k;
  int nlab = m_data.size();
  float sclx = asclx;
  
  const char chars[] = "0123456789.* "; 
  const int NCHARS = sizeof(chars)-1;
  gfx::PixelBuffer *pbuf[NCHARS];

  // Render label pixbuf
  int nMaxW = 0, nMaxH = 0;
  for (i=0; i<NCHARS; ++i) {
    pbuf[i] = createPixBuf(sclx, LString(chars[i]));
    const int width = pbuf[i]->getWidth();
    nMaxW = qlib::max(width, nMaxW);
    const int height = pbuf[i]->getHeight();
    nMaxH = qlib::max(height, nMaxH);
  }
  
  // add padding between digits (2px)
  nMaxW += 2;

  // Calculate pixdata index
  int npix = nMaxH * nMaxW * NCHARS;
  m_nTexW = nMaxW * NCHARS;
  m_nTexH = nMaxH;
  m_nDigitW = nMaxW-2;
  m_nDigitH = nMaxH;
  
  m_pixall.resize(npix);
  
  {
    for (i=0; i<m_pixall.size(); ++i)
      m_pixall[i] = 0;

    for (i=0; i<NCHARS; ++i) {
      const int width = pbuf[i]->getWidth();
      const int height = pbuf[i]->getHeight();
      for (j=0; j<height; ++j) {
        for (k=0; k<width; ++k) {
          const int xx = k + i*nMaxW;
          const int yy = j;
          const int idx = xx + yy*m_nTexW;
          m_pixall[idx] = pbuf[i]->at(j*width + k);
        }
      }
    }
  }

  m_pLabelTex->setData(m_nTexW, m_nTexH, 1, &m_pixall[0]);

  auto pa = m_pLabAttrAry;
  {
    int i=0, j;

    const float width = float(m_nDigitW * m_nDigits);
    const float height = float(m_nDigitH);

    BOOST_FOREACH(AtomIntrData &lab, m_data) {

      const int ive = i*4;
      const int ifc = i*6;
      
      // texture coord
      pa->at(ive+0).w = 0.0f;
      pa->at(ive+0).h = 0.0f;

      pa->at(ive+1).w = width;
      pa->at(ive+1).h = 0.0f;

      pa->at(ive+2).w = 0.0f;
      pa->at(ive+2).h = height;

      pa->at(ive+3).w = width;
      pa->at(ive+3).h = height;

      // Vertex displacement
      pa->at(ive+0).dx = -0.5f * width;
      pa->at(ive+0).dy = 0.0f;

      pa->at(ive+1).dx = 0.5f *width;
      pa->at(ive+1).dy = 0.0f;

      pa->at(ive+2).dx = -0.5f * width;
      pa->at(ive+2).dy = height;

      pa->at(ive+3).dx = 0.5f *width;
      pa->at(ive+3).dy = height;

      ++i;
    }
  }

  for (i=0; i<NCHARS; ++i)
    delete pbuf[i];

  LOG_DPRINTLN("NameLabel2> %d labels (%d pix tex) created", nlab, npix);
}

