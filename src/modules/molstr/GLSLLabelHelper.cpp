// -*-Mode: C++;-*-
//
//  Name label renderer class
//

#include <common.h>

#include "GLSLLabelHelper.hpp"

#include <sysdep/OglShaderSetupHelper.hpp>
#include <gfx/Texture.hpp>
#include <gfx/DisplayContext.hpp>

#ifdef WIN32
#define USE_TBO 1
#else
#endif

using namespace molstr;

bool GLSLLabelHelper::initShader(qsys::Renderer *pRend)
{
  MB_ASSERT(m_pPO == NULL);
  sysdep::OglShaderSetupHelper<qsys::Renderer> ssh(pRend);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("NameLabel2> ERROR: GLSL not supported.");
    //MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    //setShaderAvail(false);
    return false;
  }

  if (m_pPO==NULL) {
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
    ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif

    m_pPO = ssh.createProgObj("gpu_namelabel2",
                              "%%CONFDIR%%/data/shaders/namelabel2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/namelabel2_frag.glsl");
  }

  if (m_pPO==NULL) {
    LOG_DPRINTLN("NameLabel2> ERROR: cannot create progobj.");
    //setShaderAvail(false);
    return false;
  }

  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("labelTex", LABEL_TEX_UNIT);

  // setup attributes
  m_nXyzLoc = m_pPO->getAttribLocation("a_xyz");
  m_nWhLoc = m_pPO->getAttribLocation("a_wh");
  m_nNxyLoc = m_pPO->getAttribLocation("a_nxy");
  m_nWidthLoc = m_pPO->getAttribLocation("a_width");
  m_nAddrLoc = m_pPO->getAttribLocation("a_addr");

  m_pPO->disable();

  return true;
}

/// Allocate Attr VBO/setup Texture
void GLSLLabelHelper::alloc(int nlab)
{
  //
  // Create label texture
  //

  if (m_pLabelTex!=NULL)
    delete m_pLabelTex;

  m_pLabelTex = MB_NEW gfx::Texture();

#ifdef USE_TBO
  m_pLabelTex->setup(gfx::Texture::DIM_DATA,
                     gfx::Texture::FMT_R,
                     gfx::Texture::TYPE_UINT8_COLOR);
#else
  m_pLabelTex->setup(gfx::Texture::DIM_2D,
                     gfx::Texture::FMT_R,
                     gfx::Texture::TYPE_UINT8_COLOR);
#endif

  //
  // Create VBO
  //

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  m_pAttrAry = MB_NEW AttrArray();
  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(5);
  attra.setAttrInfo(0, m_nXyzLoc, 3, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, x));
  attra.setAttrInfo(1, m_nWhLoc, 2, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, w));
  attra.setAttrInfo(2, m_nNxyLoc, 2, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, nx));
  attra.setAttrInfo(3, m_nWidthLoc, 1, qlib::type_consts::QTC_INT32, offsetof(AttrElem, width));
  attra.setAttrInfo(4, m_nAddrLoc, 1, qlib::type_consts::QTC_INT32, offsetof(AttrElem, addr));

  attra.alloc(nlab*4);
  attra.allocInd(nlab*6);

  attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

  // setup face indices
  for (int i=0; i<nlab; ++i) {
    const int ive = i*4;
    const int ifc = i*6;
    attra.atind(ifc+0) = ive + 0;
    attra.atind(ifc+1) = ive + 1;
    attra.atind(ifc+2) = ive + 2;
    attra.atind(ifc+3) = ive + 2;
    attra.atind(ifc+4) = ive + 1;
    attra.atind(ifc+5) = ive + 3;
  }

}

void GLSLLabelHelper::createPixBuf(int npix)
{
#ifdef USE_TBO
  m_pixall.resize(npix);
#else
  int h=0;
  if (npix%TEX2D_WIDTH==0)
    h = npix/TEX2D_WIDTH;
  else
    h = npix/TEX2D_WIDTH + 1;
  m_pixall.resize(h*TEX2D_WIDTH);
  m_nTexW = TEX2D_WIDTH;
  m_nTexH = h;
  LOG_DPRINTLN("GLSLNameLabel2> Label Texture2D size=%d,%d", m_nTexW, m_nTexH);
#endif
}

void GLSLLabelHelper::setTexData()
{
#ifdef USE_TBO
  m_pLabelTex->setData(m_pixall.size(), 1, 1, &m_pixall[0]);
#else
  m_pLabelTex->setData(m_nTexW, m_nTexH, 1, &m_pixall[0]);
#endif
}

void GLSLLabelHelper::draw(gfx::DisplayContext *pdc,
                           float width, float height, float ppa,
                           qlib::uid_t nSceneID)
{
  if (m_pPO==NULL)
    return; // Error, shader program is not available (ignore)

  // Get label color
  float fr=0.0f, fg=0.0f, fb=0.0f, fa = pdc->getAlpha();
  if (!m_pcolor.isnull()) {
    quint32 dcc = m_pcolor->getDevCode(nSceneID);
    fr = gfx::convI2F(gfx::getRCode(dcc));
    fg = gfx::convI2F(gfx::getGCode(dcc));
    fb = gfx::convI2F(gfx::getBCode(dcc));
    fa *= gfx::convI2F(gfx::getACode(dcc));
  }

  pdc->useTexture(m_pLabelTex, LABEL_TEX_UNIT);

  m_pPO->enable();
  m_pPO->setUniformF("u_winsz", width, height);
  m_pPO->setUniformF("u_ppa", ppa);
  m_pPO->setUniformF("u_color", fr, fg, fb, fa);
  pdc->drawElem(*m_pAttrAry);

  m_pPO->disable();

  pdc->unuseTexture(m_pLabelTex);
}

void GLSLLabelHelper::invalidate()
{
  m_pixall.clear();
  if (m_pLabelTex!=NULL) {
    delete m_pLabelTex;
    m_pLabelTex = NULL;
  }
  if (m_pAttrAry!=NULL) {
    delete m_pAttrAry;
    m_pAttrAry = NULL;
  }
}
