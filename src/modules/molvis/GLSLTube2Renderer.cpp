// -*-Mode: C++;-*-
//
//  Tube renderer class ver2 GLSL implementation
//

#include <common.h>
#include "molvis.hpp"

#include "GLSLTube2Renderer.hpp"

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

detail::DrawSegment *GLSLTube2SS::createDrawSeg(int nstart, int nend)
{
  return (MB_NEW GLSLTube2DS(nstart, nend));
}

GLSLTube2SS::~GLSLTube2SS()
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
  if (m_pBinormTex!=NULL)
    delete m_pBinormTex;
  if (m_pColorTex!=NULL)
    delete m_pColorTex;
}

//////////

GLSLTube2DS::~GLSLTube2DS()
{
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;
}

//////////////////////////////////////////////////////////////

GLSLTube2Renderer::GLSLTube2Renderer()
     : super_t(), m_pPO(NULL), m_nRhoLoc(0), m_pSectTex(NULL)
{
}

GLSLTube2Renderer::~GLSLTube2Renderer()
{
}

/*
void GLSLTube2Renderer::createSegList()
{
  super_t::createSegList();

}
*/

SplineSegment *GLSLTube2Renderer::createSegment()
{
  return MB_NEW GLSLTube2SS();
}

bool GLSLTube2Renderer::initShader(DisplayContext *pdc)
{
  //m_bChkShaderDone = true;
  setShaderCheckDone(true);

  sysdep::ShaderSetupHelper<GLSLTube2Renderer> ssh(this);
  
  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("GLSLTube2> ERROR: GLSL not supported.");
    m_pPO=NULL;
    return false;
  }

  if (m_pPO==NULL) {
    /*m_pPO = ssh.createProgObj("gpu_tube2",
                              "%%CONFDIR%%/data/shaders/tube2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/tube2_frag.glsl");*/
    m_pPO = ssh.createProgObj("gpu_tube2",
                              "%%CONFDIR%%/data/shaders/tube21_vert.glsl",
                              "%%CONFDIR%%/data/shaders/tube21_frag.glsl");
  }
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GLSLTube2> ERROR: cannot create progobj.");
    return false;
  }

  //m_pPO->dumpSrc();
  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("binormTex", BINORM_TEX_UNIT);
  m_pPO->setUniform("sectTex", SECT_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);
  m_pPO->setUniform("puttyTex", PUTTY_TEX_UNIT);

  // setup attributes
  m_nRhoLoc = m_pPO->getAttribLocation("a_rho");
  // m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();

  return true;
}

void GLSLTube2Renderer::setupSectGLSL()
{
  if (m_pSectTex!=NULL)
    delete m_pSectTex;

  m_pSectTex = MB_NEW gfx::Texture(); //pdc->createTexture();

#ifdef USE_TBO
  m_pSectTex->setup(1, gfx::Texture::FMT_R,
                    gfx::Texture::TYPE_FLOAT32);
#else
  m_pSectTex->setup(1, gfx::Texture::FMT_RGBA,
                    gfx::Texture::TYPE_FLOAT32);
#endif

  updateSectGLSL();
}

void GLSLTube2Renderer::setupGLSL(detail::SplineSegment *pASeg)
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
  
  if (pSeg->m_pPuttyTex!=NULL)
    delete pSeg->m_pPuttyTex;
  if (getPuttyMode()!=TBR_PUTTY_OFF) {
    pSeg->m_pPuttyTex = MB_NEW gfx::Texture();
#ifdef USE_TBO
    pSeg->m_pPuttyTex->setup(1, gfx::Texture::FMT_R,
                             gfx::Texture::TYPE_FLOAT32);
#else
    pSeg->m_pPuttyTex->setup(1, gfx::Texture::FMT_R,
                             gfx::Texture::TYPE_FLOAT32);
#endif
  }

  const int nDetail = getAxialDetail() * m_nAxDetScl;
  const float fDetail = float(nDetail);
  const int nSecDiv = getTubeSection()->getSize();

//MB_DPRINTLN("*****1 nDet=%d, nSecDev=%d", nDetail, nSecDiv);

  BOOST_FOREACH (DrawSegment *pelem, pSeg->m_draws) {
    GLSLTube2DS &elem = *static_cast<GLSLTube2DS*>(pelem);
    
    const int nsplseg = elem.m_nEnd - elem.m_nStart;
    const float fStart = float(elem.m_nStart);

    const int nAxPts = nDetail + 1;

  // TO DO: multiple vertex generation for discontinuous color point

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
    
#ifdef USE_INSTANCED
    attra.setInstCount(nsplseg);
#endif
    
    LOG_DPRINTLN("Tube2> %d elems AttrArray created", nVA);
  }

  // create tube section texture
  setupSectGLSL();
}

void GLSLTube2Renderer::updateCrdGLSL(detail::SplineSegment *pASeg)
{
  GLSLTube2SS *pSeg = static_cast<GLSLTube2SS *>(pASeg);

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

void GLSLTube2Renderer::updateColorGLSL(detail::SplineSegment *pASeg)
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

  if (getPuttyMode()!=TBR_PUTTY_OFF) {
    MolCoordPtr pCMol = getClientMol();
    Vector2D escl;
	pSeg->m_puttyTexData.resize(nCtlPts);
    for (i=0; i<nCtlPts; ++i) {
      escl = getEScl(pCMol, pSeg, float(i));
      pSeg->m_puttyTexData[i] = escl.x();
    }
    pSeg->m_pPuttyTex->setData(nCtlPts, 1, 1, &pSeg->m_puttyTexData[0]);
  }
}

//////////
/// Update section table texture
void GLSLTube2Renderer::updateSectGLSL()
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

void GLSLTube2Renderer::drawGLSL(detail::SplineSegment *pASeg, DisplayContext *pdc)
{
  GLSLTube2SS *pSeg = static_cast<GLSLTube2SS *>(pASeg);

  const int nCtlPts = pSeg->m_scoeff.getSize();
  const bool bPutty = getPuttyMode()!=TBR_PUTTY_OFF;

  pdc->setLineWidth(3.0);

  pdc->useTexture(pSeg->m_pCoefTex, COEF_TEX_UNIT);
  pdc->useTexture(pSeg->m_pBinormTex, BINORM_TEX_UNIT);
  pdc->useTexture(m_pSectTex, SECT_TEX_UNIT);
  pdc->useTexture(pSeg->m_pColorTex, COLOR_TEX_UNIT);
  if (bPutty)
    pdc->useTexture(pSeg->m_pPuttyTex, PUTTY_TEX_UNIT);

  m_pPO->enable();

  // Setup uniforms
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  m_pPO->setUniform("u_npoints", nCtlPts);
  m_pPO->setUniform("u_bsmocol", isSmoothColor());
  m_pPO->setUniform("u_bputty", bPutty);
  m_pPO->setUniform("coefTex", COEF_TEX_UNIT);
  m_pPO->setUniform("binormTex", BINORM_TEX_UNIT);
  m_pPO->setUniform("sectTex", SECT_TEX_UNIT);
  m_pPO->setUniform("colorTex", COLOR_TEX_UNIT);
  m_pPO->setUniform("puttyTex", PUTTY_TEX_UNIT);

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
  pdc->unuseTexture(m_pSectTex);
  pdc->unuseTexture(pSeg->m_pColorTex);
  if (bPutty)
    pdc->unuseTexture(pSeg->m_pPuttyTex);
}

//////////

void GLSLTube2Renderer::objectChanged(qsys::ObjectEvent &ev)
{

  if (isVisible() &&
      ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC &&
      ev.getDescr().equals("atomsMoved")) {
    // OBE_CHANGED_DYNAMIC && descr=="atomsMoved"
    if (isUseAnim()) {
      // If shader is available
      // --> Enter the GLSL mode
      if (isShaderAvail() && !isShaderEnabled()) {
        //invalidateDisplayCache();
        setShaderEnable(true);
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

    if (!isForceGLSL())
      setShaderEnable(false); // reset to VBO mode
    return;
  }

  super_t::objectChanged(ev);
}

