// -*-Mode: C++;-*-
//
//  Tube renderer class ver2 GLSL implementation
//

#include <common.h>
#include "molvis.hpp"

#include "Tube2Renderer.hpp"

#include <qsys/SceneManager.hpp>
#include <gfx/Texture.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/AnimMol.hpp>

#include <sysdep/OglProgramObject.hpp>

#ifdef WIN32
#define USE_GL_VBO_INST 1
#else
#endif

using namespace molvis;
using namespace molstr;
using qlib::Matrix3D;


bool Tube2Renderer::initShader(DisplayContext *pdc)
{
  //m_bChkShaderDone = true;
  setShaderCheckDone(true);

  sysdep::ShaderSetupHelper<Tube2Renderer> ssh(this);
  
  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    // MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return false;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_tube2",
                              "%%CONFDIR%%/data/shaders/tube2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/tube2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("Tube2RendGLSL> ERROR: cannot create progobj.");
    return false;
  }


  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("binormTex", BINORM_TEX_UNIT);
  m_pPO->setUniform("sectTex", SECT_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);

  // setup attributes
  m_nRhoLoc = m_pPO->getAttribLocation("a_rho");
  // m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();

  return true;
}

void Tube2Renderer::setupSectGLSL(DisplayContext *pdc)
{
  if (m_pSectTex!=NULL)
    delete m_pSectTex;

  m_pSectTex = pdc->createTexture();

#ifdef USE_TBO
  m_pSectTex->setup(1, gfx::Texture::FMT_R,
                    gfx::Texture::TYPE_FLOAT32);
#else
  m_pSectTex->setup(1, gfx::Texture::FMT_RGBA,
                    gfx::Texture::TYPE_FLOAT32);
#endif

  updateSectGLSL();
}

void Tube2Renderer::setupGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);

  if (pSeg->m_pCoefTex!=NULL)
    delete pSeg->m_pCoefTex;
  pSeg->m_pCoefTex = pdc->createTexture();
#ifdef USE_TBO
  pSeg->m_pCoefTex->setup(1, gfx::Texture::FMT_R,
                          gfx::Texture::TYPE_FLOAT32);
#else
  pSeg->m_pCoefTex->setup(1, gfx::Texture::FMT_RGB,
                          gfx::Texture::TYPE_FLOAT32);
#endif

  if (pSeg->m_pBinormTex!=NULL)
    delete pSeg->m_pBinormTex;
  pSeg->m_pBinormTex = pdc->createTexture();
#ifdef USE_TBO
  pSeg->m_pBinormTex->setup(1, gfx::Texture::FMT_R,
                            gfx::Texture::TYPE_FLOAT32);
#else
  pSeg->m_pBinormTex->setup(1, gfx::Texture::FMT_RGB,
                            gfx::Texture::TYPE_FLOAT32);
#endif

  if (pSeg->m_pColorTex!=NULL)
    delete pSeg->m_pColorTex;
  pSeg->m_pColorTex = pdc->createTexture();
  pSeg->m_pColorTex->setup(1, gfx::Texture::FMT_RGBA,
                           gfx::Texture::TYPE_UINT8);
  
  const int nDetail = getAxialDetail();
  const float fDetail = float(nDetail);
  const int nSecDiv = getTubeSection()->getSize();

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
    
    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const float fStart = float(elem.m_nStart);

#ifdef USE_GL_VBO_INST
    const int nAxPts = nDetail + 1;
#else
    const int nAxPts = nDetail * nsplseg + 1;
#endif

  // TO DO: multiple vertex generation for discontinuous color point

    const int nVA = nAxPts * nSecDiv;

    if (elem.m_pAttrAry!=NULL)
      delete elem.m_pAttrAry;
    
    elem.m_pAttrAry = MB_NEW Tub2DrawSeg::AttrArray();

    Tub2DrawSeg::AttrArray &attra = *elem.m_pAttrAry;
    attra.setAttrSize(2);
    attra.setAttrInfo(0, m_nRhoLoc, 2, qlib::type_consts::QTC_FLOAT32,
                      offsetof(Tub2DrawSeg::AttrElem, rhoi));
    attra.alloc(nVA);

    // generate indices
    int nfaces = nSecDiv * (nAxPts-1) * 2;
    attra.allocInd(nfaces*3);
    int i, j, ind=0;
    int ij, ijp, ipj, ipjp;
    for (i=0; i<nAxPts-1; ++i) {
      int irow = i*nSecDiv;
      for (j=0; j<nSecDiv; ++j) {
        ij = irow + j;
        ipj = ij + nSecDiv;
        ijp = irow + (j+1)%nSecDiv;
        ipjp = irow + nSecDiv + (j+1)%nSecDiv;
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
    
    attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);

    float par;
    ind = 0;
    for (i=0; i<nAxPts; ++i) {
      par = float(i)/fDetail + fStart;
      for (j=0; j<nSecDiv; ++j) {
        attra.at(ind).rhoi = par;
        attra.at(ind).rhoj = j;
        ++ind;
      }
    }
    
#ifdef USE_GL_VBO_INST
    attra.setInstCount(nsplseg);
#endif
    
    LOG_DPRINTLN("Tub2DrawSeg> %d elems AttrArray created", nVA);
  }
}

void Tube2Renderer::updateCrdGLSL(detail::SplineSegment *pASeg)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);

  const int nCtlPts = pSeg->m_nCtlPts;
  
#ifdef USE_TBO
  pSeg->m_pCoefTex->setData(nCtlPts * 12, 1, 1, pSeg->m_scoeff.getCoefArray());
  // m_pBinormTex->setData(nCtlPts * 12, m_bnormInt.getCoefArray());
  pSeg->m_pBinormTex->setData(nCtlPts * 3, 1, 1, &pSeg->m_linBnInt[0]);
#else
  pSeg->m_pCoefTex->setData(nCtlPts * 4, 1, 1, pSeg->m_scoeff.getCoefArray());
  pSeg->m_pBinormTex->setData(nCtlPts, 1, 1, &pSeg->m_linBnInt[0]);
#endif
  
}

void Tube2Renderer::updateColorGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);

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

//////////
/// Update section table texture
void Tube2Renderer::updateSectGLSL()
{

  std::vector<float> &stab = m_secttab;
  TubeSectionPtr pTS = getTubeSection();
  int i, nsec = pTS->getSize();
  stab.resize(nsec*4);
  for (i=0; i<nsec; ++i) {
    Vector4D val = pTS->getSectTab(i);
    stab[i*4+0] = float( val.x() );
    stab[i*4+1] = float( val.y() );
    stab[i*4+2] = float( val.z() );
    stab[i*4+3] = float( val.w() );
  }

#ifdef USE_TBO
  m_pSectTex->setData(nsec * 4, 1, 1, &stab[0]);
#else
  m_pSectTex->setData(nsec, 1, 1, &stab[0]);
#endif
}

void Tube2Renderer::drawGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  Tube2Seg *pSeg = static_cast<Tube2Seg *>(pASeg);

  const int nCtlPts = pSeg->m_scoeff.getSize();

  pSeg->m_pCoefTex->use(Tube2Renderer::COEF_TEX_UNIT);
  pSeg->m_pBinormTex->use(Tube2Renderer::BINORM_TEX_UNIT);
  m_pSectTex->use(Tube2Renderer::SECT_TEX_UNIT);
  pSeg->m_pColorTex->use(Tube2Renderer::COLOR_TEX_UNIT);

  m_pPO->enable();

  // Setup uniforms
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  m_pPO->setUniform("u_npoints", nCtlPts);
  m_pPO->setUniform("coefTex", Tube2Renderer::COEF_TEX_UNIT);
  m_pPO->setUniform("binormTex", Tube2Renderer::BINORM_TEX_UNIT);
  m_pPO->setUniform("sectTex", Tube2Renderer::SECT_TEX_UNIT);
  m_pPO->setUniform("colorTex", Tube2Renderer::COLOR_TEX_UNIT);

  BOOST_FOREACH (Tub2DrawSeg &elem, pSeg->m_draws) {
    pdc->drawElem(*elem.m_pAttrAry);
  }

  m_pPO->disable();

  pSeg->m_pCoefTex->unuse();
  pSeg->m_pBinormTex->unuse();
  m_pSectTex->unuse();
  pSeg->m_pColorTex->unuse();
}

