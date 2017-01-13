// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//

#include <common.h>
#include "molvis.hpp"

#include "Spline2RendGLSL.hpp"

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

Spl2GLSLSeg::~Spl2GLSLSeg()
{
}

void Spl2GLSLSeg::generateImpl(int nstart, int nend)
{
  m_draws.push_back(MB_NEW Spl2GLSLDrawSeg(nstart, nend));
}

Spl2GLSLDrawSeg::~Spl2GLSLDrawSeg()
{
}

//////////////////////////////////////////////////////////////

Spline2RendGLSL::Spline2RendGLSL()
     : super_t()
{
  m_pPO = NULL;
}

Spline2RendGLSL::~Spline2RendGLSL()
{
}

// GLSL implementation

SplineSegment *Spline2RendGLSL::createSegment()
{
  return MB_NEW Spl2GLSLSeg();
}

bool Spline2RendGLSL::initShader(DisplayContext *pdc)
{
  setShaderCheckDone(true);

  sysdep::ShaderSetupHelper<Spline2RendGLSL> ssh(this);

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

void Spline2RendGLSL::setupGLSL(detail::SplineSegment *pASeg)
{
  Spl2GLSLSeg *pSeg = static_cast<Spl2GLSLSeg *>(pASeg);

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

  BOOST_FOREACH(Spl2DrawSeg *pelem, pSeg->m_draws) {
    Spl2GLSLDrawSeg &elem = *static_cast<Spl2GLSLDrawSeg*>(pelem);
    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const float fStart = float(elem.m_nStart);

    //const int nVA = nDetail * nsplseg + 1;
    const int nVA = nDetail + 1;

    if (elem.m_pAttrAry!=NULL)
      delete elem.m_pAttrAry;
    
    elem.m_pAttrAry = MB_NEW Spl2GLSLDrawSeg::AttrArray();

    Spl2GLSLDrawSeg::AttrArray &attra = *elem.m_pAttrAry;
    attra.setAttrSize(2);
    attra.setAttrInfo(0, m_nRhoLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(Spl2GLSLDrawSeg::AttrElem, rho));
    //attra.setAttrInfo(1, m_nColLoc, 4, qlib::type_consts::QTC_UINT8, offsetof(Spl2GLSLDrawSeg::AttrElem, r));

    attra.alloc(nVA);
    attra.setDrawMode(gfx::AbstDrawElem::DRAW_LINE_STRIP);

    for (i=0; i<nVA; ++i) {
      par = float(i)/fDetail + fStart;
      attra.at(i).rho = par;
    }
    
#ifdef USE_INSTANCED
    attra.setInstCount(nsplseg);
#endif

    LOG_DPRINTLN("Spl2GLSLDrawSeg> %d elems AttrArray created", nVA);
  }
}

void Spline2RendGLSL::updateCrdGLSL(detail::SplineSegment *pASeg)
{
  Spl2GLSLSeg *pSeg = static_cast<Spl2GLSLSeg *>(pASeg);

  const int nCtlPts = pSeg->m_nCtlPts;
  
#ifdef USE_TBO
  pSeg->m_pCoefTex->setData(nCtlPts * 12, 1, 1, pSeg->m_scoeff.getCoefArray());
#else
  pSeg->m_pCoefTex->setData(nCtlPts * 4, 1, 1, pSeg->m_scoeff.getCoefArray());
#endif

}

void Spline2RendGLSL::updateColorGLSL(detail::SplineSegment *pASeg)
{
  Spl2GLSLSeg *pSeg = static_cast<Spl2GLSLSeg *>(pASeg);
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

  BOOST_FOREACH (Spl2GLSLDrawSeg &elem, pSeg->m_draws) {

    const float fStart = float(elem.m_nStart);
    Spl2GLSLDrawSeg::AttrArray &attra = *elem.m_pAttrAry;
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

void Spline2RendGLSL::drawGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Spl2GLSLSeg *pSeg = static_cast<Spl2GLSLSeg *>(pASeg);

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

  BOOST_FOREACH (Spl2DrawSeg *pelem, pSeg->m_draws) {
    Spl2GLSLDrawSeg &elem = *static_cast<Spl2GLSLDrawSeg*>(pelem);
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

void Spline2RendGLSL::objectChanged(qsys::ObjectEvent &ev)
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
