// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//

#include <common.h>
#include "molvis.hpp"

#include "Spline2Renderer.hpp"

#include <qsys/SceneManager.hpp>
#include <gfx/Texture.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

#include <sysdep/OglProgramObject.hpp>

using namespace molvis;
using namespace molstr;
using namespace molvis::detail;
using qlib::Matrix3D;

Spline2Seg::~Spline2Seg()
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
  if (m_pColorTex!=NULL)
    delete m_pColorTex;
}

void Spline2Seg::generateImpl(int nstart, int nend)
{
  m_draws.push_back(Spl2DrawSeg(nstart, nend));
}

Spl2DrawSeg::~Spl2DrawSeg()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;
}

//////////////////////////////////////////////////////////////

Spline2Renderer::Spline2Renderer()
     : super_t()
{
  m_dLineWidth = 1.2;
  m_pPO = NULL;
}

Spline2Renderer::~Spline2Renderer()
{
}

const char *Spline2Renderer::getTypeName() const
{
  return "spline2";
}

void Spline2Renderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

SplineSegment *Spline2Renderer::createSegment()
{
  return MB_NEW Spline2Seg();
}

void Spline2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (isVisible() &&
      ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC &&
      ev.getDescr().equals("atomsMoved")) {
    // OBE_CHANGED_DYNAMIC && descr=="atomsMoved"
    if (isUseAnim()) {
      // GLSL mode
      if (!isUseGLSL()) {
        // invalidateDisplayCache();
        setUseGLSL(true);
      }
      if (!isCacheAvail()) {
        createCacheData();
      }
      // only update positions
      updateCrdDynamic();
      return;
    }
  }
  else if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED_FIXDYN) {
    MB_DPRINTLN("Spline2Rend (%p) > OBE_CHANGED_FIXDYN called!!", this);

    setUseGLSL(false);
    return;
  }

  super_t::objectChanged(ev);
}

//////////////////////////////////////////////////////////////
// VBO implementation

void Spline2Renderer::setupVBO(detail::SplineSegment *pASeg)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);
  const int nDetail = getAxialDetail();

  BOOST_FOREACH (Spl2DrawSeg &elem, pSeg->m_draws) {
    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const int nVA = nDetail * nsplseg + 1;

    Spl2DrawSeg::VertArray *pVBO = elem.m_pVBO;
    if (pVBO!=NULL)
      delete pVBO;
    
    elem.m_pVBO = pVBO = MB_NEW Spl2DrawSeg::VertArray();
    pVBO->alloc(nVA);

    pVBO->setDrawMode(gfx::DrawElem::DRAW_LINE_STRIP);
    LOG_DPRINTLN("Spline2VBO> %d elems VBO created", nVA);
  }
}

void Spline2Renderer::updateCrdVBO(detail::SplineSegment *pASeg)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);
  CubicSpline *pAxInt = pSeg->getAxisIntpol();

  int i, j;
  float par, fStart;
  Vector3F pos;
  const float fDetail = float(getAxialDetail());

  Spl2DrawSeg::VertArray *pVBO;

  BOOST_FOREACH (Spl2DrawSeg &elem, pSeg->m_draws) {
  
    pVBO = elem.m_pVBO;
    fStart = float(elem.m_nStart);
    const int nVA = pVBO->getSize();

    for (i=0; i<nVA; ++i) {
      par = float(i)/fDetail + fStart;
      pAxInt->interpolate(par, &pos);
      pVBO->vertex3f(i, pos);
    }
    
    pVBO->setUpdated(true);
  }
}

void Spline2Renderer::updateColorVBO(detail::SplineSegment *pASeg)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);
  MolCoordPtr pCMol = getClientMol();

  int i;
  float par;
  float fDetail = float(getAxialDetail());

  Spl2DrawSeg::VertArray *pVBO;

  BOOST_FOREACH (Spl2DrawSeg &elem, pSeg->m_draws) {

    pVBO = elem.m_pVBO;
    float fStart = float(elem.m_nStart);
    const int nVA = pVBO->getSize();

    for (i=0; i<nVA; ++i) {
      par = float(i)/fDetail + fStart;
      pVBO->color(i, pSeg->calcColor(this, pCMol, par));
    }
  }
}

void Spline2Renderer::drawVBO(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  const float lw = float( getLineWidth() );
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);

  BOOST_FOREACH (Spl2DrawSeg &elem, pSeg->m_draws) {
    elem.m_pVBO->setLineWidth(lw);
    pdc->drawElem(*elem.m_pVBO);
  }
}

//////////////////////////////////////////////////////////////
// GLSL implementation

bool Spline2Renderer::initShader(DisplayContext *pdc)
{
  setShaderCheckDone(true);

  sysdep::ShaderSetupHelper<Spline2Renderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    // MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return false;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_spline2",
                              "%%CONFDIR%%/data/shaders/spline2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/spline2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("Spline2RendGLSL> ERROR: cannot create progobj.");
    return false;
  }

  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);

  // setup attributes
  m_nRhoLoc = m_pPO->getAttribLocation("a_rho");
  //m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();

  return true;
}

void Spline2Renderer::setupGLSL(detail::SplineSegment *pASeg)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);

  if (pSeg->m_pCoefTex != NULL)
    delete pSeg->m_pCoefTex;

  pSeg->m_pCoefTex = MB_NEW gfx::Texture(); //pdc->createTexture();
#ifdef USE_TBO
  pSeg->m_pCoefTex->setup(1, gfx::Texture::FMT_R,
                    gfx::Texture::TYPE_FLOAT32);
#else
  pSeg->m_pCoefTex->setup(1, gfx::Texture::FMT_RGB,
                    gfx::Texture::TYPE_FLOAT32);
#endif
  
  if (pSeg->m_pColorTex!=NULL)
    delete pSeg->m_pColorTex;
  pSeg->m_pColorTex = MB_NEW gfx::Texture(); //pdc->createTexture();
  pSeg->m_pColorTex->setup(1, gfx::Texture::FMT_RGBA,
                           gfx::Texture::TYPE_UINT8_COLOR);
  
  const int nDetail = getAxialDetail() * 10;
  const float fDetail = float(nDetail);
  float par;
  int i;

  BOOST_FOREACH(Spl2DrawSeg &elem, pSeg->m_draws) {

    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const float fStart = float(elem.m_nStart);

    //const int nVA = nDetail * nsplseg + 1;
    const int nVA = nDetail + 1;

    if (elem.m_pAttrAry!=NULL)
      delete elem.m_pAttrAry;
    
    elem.m_pAttrAry = MB_NEW Spl2DrawSeg::AttrArray();

    Spl2DrawSeg::AttrArray &attra = *elem.m_pAttrAry;
    attra.setAttrSize(2);
    attra.setAttrInfo(0, m_nRhoLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(Spl2DrawSeg::AttrElem, rho));
    //attra.setAttrInfo(1, m_nColLoc, 4, qlib::type_consts::QTC_UINT8, offsetof(Spl2DrawSeg::AttrElem, r));

    attra.alloc(nVA);
    attra.setDrawMode(gfx::AbstDrawElem::DRAW_LINE_STRIP);

    for (i=0; i<nVA; ++i) {
      par = float(i)/fDetail + fStart;
      attra.at(i).rho = par;
    }
    
#ifdef USE_INSTANCED
    attra.setInstCount(nsplseg);
#endif

    LOG_DPRINTLN("Spl2DrawSeg> %d elems AttrArray created", nVA);
  }
}

void Spline2Renderer::updateCrdGLSL(detail::SplineSegment *pASeg)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);

  const int nCtlPts = pSeg->m_nCtlPts;
  
#ifdef USE_TBO
  pSeg->m_pCoefTex->setData(nCtlPts * 12, 1, 1, pSeg->m_scoeff.getCoefArray());
#else
  pSeg->m_pCoefTex->setData(nCtlPts * 4, 1, 1, pSeg->m_scoeff.getCoefArray());
#endif

}

void Spline2Renderer::updateColorGLSL(detail::SplineSegment *pASeg)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);
  MolCoordPtr pCMol = getClientMol();

  int i;
  const int nCtlPts = pSeg->m_nCtlPts;
  quint32 dcc;

  pSeg->m_colorTexData.resize(nCtlPts*4);
  for (i=0; i<nCtlPts; ++i) {
    dcc = pSeg->calcColor(this, pCMol, float(i));
    pSeg->m_colorTexData[i*4+0] = (qbyte) gfx::getRCode(dcc);
    pSeg->m_colorTexData[i*4+1] = (qbyte) gfx::getGCode(dcc);
    pSeg->m_colorTexData[i*4+2] = (qbyte) gfx::getBCode(dcc);
    pSeg->m_colorTexData[i*4+3] = (qbyte) gfx::getACode(dcc);
  }

  pSeg->m_pColorTex->setData(nCtlPts, 1, 1, &pSeg->m_colorTexData[0]);


/*
  const float fDetail = float(getAxialDetail());
  float par;

  BOOST_FOREACH (Spl2DrawSeg &elem, pSeg->m_draws) {

    const float fStart = float(elem.m_nStart);
    Spl2DrawSeg::AttrArray &attra = *elem.m_pAttrAry;
	const int nVA = attra.getSize();

    for (i=0; i<nVA; ++i) {
      par = float(i)/fDetail + fStart;
      dcc = pSeg->calcColor(this, pCMol, par);
      
      attra.at(i).r = (qbyte) gfx::getRCode(dcc);
      attra.at(i).g = (qbyte) gfx::getGCode(dcc);
      attra.at(i).b = (qbyte) gfx::getBCode(dcc);
      attra.at(i).a = (qbyte) gfx::getACode(dcc);
    }
  }*/
}

void Spline2Renderer::drawGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Spline2Seg *pSeg = static_cast<Spline2Seg *>(pASeg);

  const double lw = getLineWidth();

  pdc->setLineWidth(lw);

  //pSeg->m_pCoefTex->use(COEF_TEX_UNIT);
  //pSeg->m_pColorTex->use(COLOR_TEX_UNIT);
  pdc->useTexture(pSeg->m_pCoefTex, COEF_TEX_UNIT);
  pdc->useTexture(pSeg->m_pColorTex, COLOR_TEX_UNIT);

  m_pPO->enable();

  // Setup uniforms
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);
  m_pPO->setUniform("u_npoints", pSeg->m_scoeff.getSize());

  BOOST_FOREACH (Spl2DrawSeg &elem, pSeg->m_draws) {
#ifdef USE_INSTANCED
    pdc->drawElem(*elem.m_pAttrAry);
#else
    const int nspl = elem.m_nEnd - elem.m_nStart;
    for (int i=0; i<nspl; ++i) {
      m_pPO->setUniform("u_InstanceID", i);
      pdc->drawElem(*elem.m_pAttrAry);
    }
#endif
  }

  m_pPO->disable();
  //pSeg->m_pCoefTex->unuse();
  //pSeg->m_pColorTex->unuse();
  pdc->unuseTexture(pSeg->m_pCoefTex);
  pdc->unuseTexture(pSeg->m_pColorTex);
}

