// -*-Mode: C++;-*-
//
//  Tube renderer class ver2 GLSL implementation
//

#include <common.h>
#include "molvis.hpp"

#include "GLSLRcTubeRenderer.hpp"

#include <qsys/SceneManager.hpp>
#include <gfx/Texture.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

#include <sysdep/OglProgramObject.hpp>

#ifdef WIN32
#define USE_TBO 1
#define USE_INSTANCED 1
#else
#endif

using namespace molvis;
using namespace molstr;
using qlib::Matrix3D;
using detail::DrawSegment;

GLSLRcTubeRenderer::GLSLRcTubeRenderer()
     : super_t(), m_pPO(NULL), m_nRhoLoc(0)
{
}

GLSLRcTubeRenderer::~GLSLRcTubeRenderer()
{
}

const char *GLSLRcTubeRenderer::getTypeName() const
{
  return "gpu_rctube";
}

bool GLSLRcTubeRenderer::init(DisplayContext *pdc)
{
  sysdep::ShaderSetupHelper<GLSLRcTubeRenderer> ssh(this);
  
  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("GLSLTube2> ERROR: GLSL not supported.");
    m_pPO=NULL;
    setShaderAvail(false);
    return false;
  }

  if (m_pPO==NULL) {
    m_pPO = ssh.createProgObj("gpu_rctube1",
                              "%%CONFDIR%%/data/shaders/rctube_vert.glsl",
                              "%%CONFDIR%%/data/shaders/rctube_frag.glsl");
  }
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GLSLTube2> ERROR: cannot create progobj.");
    setShaderAvail(false);
    return false;
  }

  //m_pPO->dumpSrc();
  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("binormTex", BINORM_TEX_UNIT);
  // m_pPO->setUniform("sectTex", SECT_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);
  // m_pPO->setUniform("puttyTex", PUTTY_TEX_UNIT);

  // setup attributes
  m_nRhoLoc = m_pPO->getAttribLocation("a_rho");

  m_pPO->disable();

  setShaderAvail(true);
  return true;
}

void GLSLRcTubeRenderer::setupGLSL(detail::SplineSegment *pASeg)
{
  GLSLTube2SS *pSeg = static_cast<GLSLTube2SS *>(pASeg);

  if (pSeg->m_pCoefTex!=NULL)
    delete pSeg->m_pCoefTex;
  pSeg->m_pCoefTex = MB_NEW gfx::Texture(); //pdc->createTexture();
#ifdef USE_TBO
  pSeg->m_pCoefTex->setup(1, gfx::Texture::FMT_R,
                          gfx::Texture::TYPE_FLOAT32);
#else
  pSeg->m_pCoefTex->setup(1, gfx::Texture::FMT_RGB,
                          gfx::Texture::TYPE_FLOAT32);
#endif

  if (pSeg->m_pBinormTex!=NULL)
    delete pSeg->m_pBinormTex;
  pSeg->m_pBinormTex = MB_NEW gfx::Texture(); //pdc->createTexture();
#ifdef USE_TBO
  pSeg->m_pBinormTex->setup(1, gfx::Texture::FMT_R,
                            gfx::Texture::TYPE_FLOAT32);
#else
  pSeg->m_pBinormTex->setup(1, gfx::Texture::FMT_RGB,
                            gfx::Texture::TYPE_FLOAT32);
#endif

  if (pSeg->m_pColorTex!=NULL)
    delete pSeg->m_pColorTex;
  pSeg->m_pColorTex = MB_NEW gfx::Texture(); //pdc->createTexture();
  pSeg->m_pColorTex->setup(1, gfx::Texture::FMT_RGBA,
                           gfx::Texture::TYPE_UINT8_COLOR);
  
  const int nDetail = getAxialDetail();
  const float fDetail = float(nDetail);
  const int nSecDiv = getTubeSection()->getSize();

//MB_DPRINTLN("*****1 nDet=%d, nSecDev=%d", nDetail, nSecDiv);

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    GLSLTube2DS &elem = *static_cast<GLSLTube2DS*>(pelem);
    
    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const float fStart = float(elem.m_nStart);

    const int nAxPts = nDetail + 1;

    const int nVA = nAxPts * nSecDiv;
//MB_DPRINTLN("*****2 nVA=%d", nVA);

    if (elem.m_pAttrAry!=NULL)
      delete elem.m_pAttrAry;
    
    elem.m_pAttrAry = MB_NEW GLSLTube2DS::AttrArray();

    GLSLTube2DS::AttrArray &attra = *elem.m_pAttrAry;
    attra.setAttrSize(2);
    attra.setAttrInfo(0, m_nRhoLoc, 2, qlib::type_consts::QTC_FLOAT32,
                      offsetof(GLSLTube2DS::AttrElem, rhoi));
    attra.alloc(nVA);

    attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    //attra.setDrawMode(gfx::AbstDrawElem::DRAW_POINTS);

    int nfaces = (nSecDiv-1) * (nAxPts-1) * 2;
    attra.allocInd(nfaces*3);
    
    // generate indices
    int i, j, ind=0;
    int ij, ijp, ipj, ipjp;
    for (i=0; i<nAxPts-1; ++i) {
      int irow = i*nSecDiv;
      for (j=0; j<nSecDiv-1; ++j) {
        ij = irow + j;
        ipj = ij + nSecDiv;
        //ijp = irow + (j+1)%nSecDiv;
        //ipjp = irow + nSecDiv + (j+1)%nSecDiv;
        ijp = irow + (j+1);
        ipjp = irow + nSecDiv + (j+1);
        attra.atind(ind) = ij;
        ++ind;
        attra.atind(ind) = ijp;
        ++ind;
        attra.atind(ind) = ipjp;
        ++ind;
        attra.atind(ind) = ipjp;
        ++ind;
        attra.atind(ind) = ipj;
        ++ind;
        attra.atind(ind) = ij;
        ++ind;
      }
    }
    
    float par;
    ind = 0;
    for (i=0; i<nAxPts; ++i) {
      par = float(i)/fDetail + fStart;
      for (j=0; j<nSecDiv; ++j) {
        attra.at(ind).rhoi = par;
        attra.at(ind).rhoj = float(j)/float(nSecDiv-1);
        ++ind;
      }
    }
    
#ifdef USE_INSTANCED
    attra.setInstCount(nsplseg);
#endif
    
    LOG_DPRINTLN("Tube2> %d elems AttrArray created", nVA);
  }
}

void GLSLRcTubeRenderer::updateColorGLSL(detail::SplineSegment *pASeg)
{
  GLSLTube2SS *pSeg = static_cast<GLSLTube2SS *>(pASeg);

  int i, j, ind;
  const int nCtlPts = pSeg->m_nCtlPts;
  const int nSecDiv = getTubeSection()->getSize();

  quint32 dcc;

  MolCoordPtr pCMol = getClientMol();

  pSeg->m_colorTexData.resize(nCtlPts*4);
  for (i=0; i<nCtlPts; ++i) {
    dcc = pSeg->calcColor(this, pCMol, float(i));
    pSeg->m_colorTexData[i*4+0] = (qbyte) gfx::getRCode(dcc);
    pSeg->m_colorTexData[i*4+1] = (qbyte) gfx::getGCode(dcc);
    pSeg->m_colorTexData[i*4+2] = (qbyte) gfx::getBCode(dcc);
    pSeg->m_colorTexData[i*4+3] = (qbyte) gfx::getACode(dcc);
  }

  pSeg->m_pColorTex->setData(nCtlPts, 1, 1, &pSeg->m_colorTexData[0]);

}

void GLSLRcTubeRenderer::drawGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  GLSLTube2SS *pSeg = static_cast<GLSLTube2SS *>(pASeg);

  const int nCtlPts = pSeg->m_scoeff.getSize();
  //const bool bPutty = getPuttyMode()!=TBR_PUTTY_OFF;

  pdc->setLineWidth(3.0);

  pdc->useTexture(pSeg->m_pCoefTex, COEF_TEX_UNIT);
  pdc->useTexture(pSeg->m_pBinormTex, BINORM_TEX_UNIT);
  //pdc->useTexture(m_pSectTex, SECT_TEX_UNIT);
  pdc->useTexture(pSeg->m_pColorTex, COLOR_TEX_UNIT);
  //if (bPutty)
  //pdc->useTexture(pSeg->m_pPuttyTex, PUTTY_TEX_UNIT);

  m_pPO->enable();

  // Setup uniforms
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  m_pPO->setUniform("u_npoints", nCtlPts);
  m_pPO->setUniform("u_bsmocol", isSmoothColor());
  //m_pPO->setUniform("u_bputty", bPutty);
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("binormTex", BINORM_TEX_UNIT);
  //m_pPO->setUniform("sectTex", SECT_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);
  //m_pPO->setUniform("puttyTex", PUTTY_TEX_UNIT);

  TubeSectionPtr pTS = getTubeSection();
  m_pPO->setUniformF("u_width", (float) pTS->getWidth());
  m_pPO->setUniformF("u_tuber", (float) pTS->getTuber());

  m_pPO->setUniformF("u_efac", 1.0f);

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    GLSLTube2DS &elem = *static_cast<GLSLTube2DS*>(pelem);

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

  m_pPO->setUniformF("u_efac", 1.5f);

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    GLSLTube2DS &elem = *static_cast<GLSLTube2DS*>(pelem);

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

  pdc->unuseTexture(pSeg->m_pCoefTex);
  pdc->unuseTexture(pSeg->m_pBinormTex);
  //pdc->unuseTexture(m_pSectTex);
  pdc->unuseTexture(pSeg->m_pColorTex);
  //if (bPutty)
  //pdc->unuseTexture(pSeg->m_pPuttyTex);
}

