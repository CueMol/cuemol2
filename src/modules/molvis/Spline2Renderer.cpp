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

Spline2Renderer::Spline2Renderer()
{
  m_nAxialDetail = 6;
  m_dLineWidth = 1.2;

  //m_bUseGLSL = true;
  m_bUseGLSL = false;

  m_bChkShaderDone = false;
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

void Spline2Renderer::startColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

}
void Spline2Renderer::endColorCalc()
{
  MolCoordPtr pCMol = getClientMol();

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void Spline2Renderer::display(DisplayContext *pdc)
{
  if (m_bUseGLSL) {
    // new rendering routine using GLSL/VBO
    if (!m_bChkShaderDone)
      initShader(pdc);
  }

  // Always use VBO (DrawElem)
  if (m_seglist.empty()) {
    createSegList(pdc);

    startColorCalc();

    BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
      if (elem.getSize()>0) {
        elem.updateColor(this);
        if (isUseAnim())
          elem.updateDynamic(this);
        else
          elem.updateStatic(this);
      }
    }

    endColorCalc();
  }

  preRender(pdc);
  BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
    if (elem.getSize()>0)
      elem.draw(this, pdc);
  }
  postRender(pdc);

}

void Spline2Renderer::invalidateDisplayCache()
{
  if (!m_seglist.empty()) {
    m_seglist.clear();
  }

  super_t::invalidateDisplayCache();
}

void Spline2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("axialdetail")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void Spline2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {

    // OBE_CHANGED && descr=="atomsMoved"

    if (isUseAnim()) {
      BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
        if (elem.getSize()>0) {
          // only update positions
          elem.updateDynamic(this);
        }
      }
      return;
    }

  }

  super_t::objectChanged(ev);
}

void Spline2Renderer::createSegList(DisplayContext *pdc)
{
  MolCoordPtr pCMol = getClientMol();

  // visit all residues
  ResidIterator iter(pCMol);
  
  MolResiduePtr pPrevResid;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      // This resid doesn't has pivot, so we cannot draw backbone!!
      if (!pPrevResid.isnull()) {
        // endSegment(pdl, pPrevResid);
        m_seglist.back().generate(this, pdc);
      }
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    if (isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull()) {
        //endSegment(pdl, pPrevResid);
        m_seglist.back().generate(this, pdc);
      }
      //beginSegment(pdl, pRes);
      m_seglist.push_back(Spline2Seg());
    }

    //rendResid(pdl, pRes);
    m_seglist.back().append(pPiv);
    pPrevResid = pRes;
  }

  if (!pPrevResid.isnull()) {
    //endSegment(pdl, pPrevResid);
    m_seglist.back().generate(this, pdc);
  }
}

//////////////////////////////////////////////////////////////

Spline2Seg::Spline2Seg()
{
  m_pVBO = NULL;
  m_nDetail = 10;
  m_nVA = 0;
//  m_nPoints = 0;

  m_pAttrAry = NULL;
  m_pCoefTex = NULL;
}

Spline2Seg::~Spline2Seg()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
}

void Spline2Seg::append(MolAtomPtr pAtom)
{
  m_aidtmp.push_back(pAtom->getID());
}

void Spline2Seg::generate(Spline2Renderer *pthis, DisplayContext *pdc)
{
  quint32 nsz = m_aidtmp.size();
  if (nsz<2) {
    m_aidtmp.clear();
    return;
  }

  m_aids.resize(nsz);
  m_aids.assign(m_aidtmp.begin(), m_aidtmp.end());
  m_aidtmp.clear();
  //m_nPoints = nsz;
  m_scoeff.setSize(nsz);

  MolCoordPtr pCMol = pthis->getClientMol();

  if (pthis->isUseAnim()) {
    AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
    m_inds.resize(nsz);
    quint32 i;
    for (i=0; i<nsz; ++i) {
      m_inds[i] = pAMol->getCrdArrayInd(m_aids[i]) * 3;
    }
  }

  m_nDetail = pthis->getAxialDetail();

  if (pthis->m_bUseGLSL)
    setupGLSL(pthis, pdc);
  else
    setupVBO(pthis);
}

quint32 Spline2Seg::calcColor(Spline2Renderer *pthis, MolCoordPtr pMol, int ind) const
{
  qlib::uid_t nSceneID = pthis->getSceneID();

  float par = float(ind)/float(m_nDetail);
  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  float rho = par - float(nprev);

  nprev = qlib::clamp<int>(nprev, 0, m_aids.size()-1);
  nnext = qlib::clamp<int>(nnext, 0, m_aids.size() - 1);

  MolResiduePtr pNext = getResid(pMol, nnext);
  MolResiduePtr pPrev = getResid(pMol, nprev);

  ColorPtr pcol = pthis->calcColor(rho, true, pPrev, pNext, false, false);
  return pcol->getDevCode(nSceneID);
}

void Spline2Seg::updateColor(Spline2Renderer *pthis)
{
  if (pthis->m_bUseGLSL)
    updateGLSLColor(pthis);
  else
    updateVBOColor(pthis);
}

void Spline2Seg::updateDynamic(Spline2Renderer *pthis) {
  if (pthis->m_bUseGLSL)
    updateDynamicGLSL(pthis);
  else
    updateDynamicVBO(pthis);
}

void Spline2Seg::updateStatic(Spline2Renderer *pthis) {
  if (pthis->m_bUseGLSL)
    updateStaticGLSL(pthis);
  else
    updateStaticVBO(pthis);
}

void Spline2Seg::draw(Spline2Renderer *pthis, DisplayContext *pdc) {
  if (pthis->m_bUseGLSL)
    drawGLSL(pthis, pdc);
  else
    drawVBO(pthis, pdc);
}

//////////////////
// VBO implementation

void Spline2Seg::setupVBO(Spline2Renderer *pthis)
{
  m_nVA = m_nDetail * (m_scoeff.getSize() - 1) + 1;

  if (m_pVBO!=NULL)
    delete m_pVBO;
    
  m_pVBO = MB_NEW gfx::DrawElemVC();
  m_pVBO->alloc(m_nVA);
  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_LINE_STRIP);
  LOG_DPRINTLN("Spline2Seg> %d elems VBO created", m_nVA);
}

void Spline2Seg::updateVBO()
{
	int i;
	float par;
  Vector3F pos;
  
  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail);
    m_scoeff.interpolate(par, &pos);
    m_pVBO->vertex3f(i, pos);
  }

  m_pVBO->setUpdated(true);
}

void Spline2Seg::updateScoeffDynamic(Spline2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());

  qfloat32 *crd = pAMol->getAtomCrdArray();

  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;
  const int nsz = m_scoeff.getSize();
  for (i=0; i<nsz; ++i) {
    //m_pos[i] = Vector3F(&crd[m_inds[i]]);
	  m_scoeff.setPoint(i, Vector3F(&crd[m_inds[i]]));
  }
  m_scoeff.generate();
}

void Spline2Seg::updateScoeffStatic(Spline2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();
  MolAtomPtr pAtom;
  Vector4D pos4d;
  int i;
  const int nsz = m_scoeff.getSize();
  for (i=0; i<nsz; ++i) {
    pAtom = pCMol->getAtom(m_aids[i]);
    pos4d = pAtom->getPos();
    //m_pos[i] = Vector3F(pos4d.x(), pos4d.y(), pos4d.z());
    m_scoeff.setPoint(i, Vector3F(float(pos4d.x()), float(pos4d.y()), float(pos4d.z())));
  }

  m_scoeff.generate();
}

void Spline2Seg::updateDynamicVBO(Spline2Renderer *pthis)
{
  updateScoeffDynamic(pthis);
  updateVBO();
}

void Spline2Seg::updateStaticVBO(Spline2Renderer *pthis)
{
  updateScoeffStatic(pthis);
  updateVBO();
}

void Spline2Seg::updateVBOColor(Spline2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();


  int i;
  for (i=0; i<m_nVA; ++i) {
    m_pVBO->color(i, calcColor(pthis, pCMol, i));
  }
}

void Spline2Seg::drawVBO(Spline2Renderer *pthis, DisplayContext *pdc)
{
  const double lw = pthis->getLineWidth();
  m_pVBO->setLineWidth(lw);
  pdc->drawElem(*m_pVBO);
}

///////////////////////////////////////////////
// GLSL implementation

void Spline2Renderer::initShader(DisplayContext *pdc)
{
  m_bChkShaderDone = true;

  sysdep::ShaderSetupHelper<Spline2Renderer> ssh(this);
  
  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("SimpleRendGLSL> ERROR: GLSL not supported.");
    MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_spline2",
                              "%%CONFDIR%%/data/shaders/spline2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/spline2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("Spline2RendGLSL> ERROR: cannot create progobj.");
    return;
  }

  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("coefTex", 0);

  // setup attributes
  m_nRhoLoc = m_pPO->getAttribLocation("a_rho");
  m_nColLoc = m_pPO->getAttribLocation("a_color");

  m_pPO->disable();
}

void Spline2Seg::setupGLSL(Spline2Renderer *pthis, DisplayContext *pdc)
{
  if (m_pCoefTex!=NULL)
    delete m_pCoefTex;
  //m_pCoefTex = pdc->createTexture2D();
  m_pCoefTex = pdc->createTexture1D();
  //m_pCoefTex->setup(gfx::AbstTexture::FMT_RGB,
  //gfx::AbstTexture::TYPE_FLOAT32);
  m_pCoefTex->setup(gfx::AbstTexture::FMT_R,
                     gfx::AbstTexture::TYPE_FLOAT32);

  const int nsz = m_scoeff.getSize();
  m_coefbuf.resize(nsz * 12);

  m_nVA = m_nDetail * (nsz - 1) + 1;

  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;
    
  m_pAttrAry = MB_NEW AttrArray();

  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(2);
  attra.setAttrInfo(0, pthis->m_nRhoLoc, 1, qlib::type_consts::QTC_FLOAT32,  offsetof(AttrElem, rho));
  attra.setAttrInfo(1, pthis->m_nColLoc, 4, qlib::type_consts::QTC_UINT8, offsetof(AttrElem, r));

  attra.alloc(m_nVA);
  attra.setDrawMode(gfx::AbstDrawElem::DRAW_LINE_STRIP);

  float par;
  int i;
  for (i=0; i<m_nVA; ++i) {
    par = float(i)/float(m_nDetail);
    attra.at(i).rho = par;
    /*
    attra.at(i).r = 0xFF;
    attra.at(i).g = 0xFF;
    attra.at(i).b = 0xFF;
    attra.at(i).a = 0xFF;*/
  }

  LOG_DPRINTLN("Spline2Seg> %d elems AttrArray created", m_nVA);
}

void Spline2Seg::updateCoefTex()
{
/*
  for (i=0; i<m_nPoints; ++i) {
    m_coefbuf[i*12+0] = m_coeff0[i].x();
    m_coefbuf[i*12+1] = m_coeff0[i].y();
    m_coefbuf[i*12+2] = m_coeff0[i].z();

    m_coefbuf[i*12+3] = m_coeff1[i].x();
    m_coefbuf[i*12+4] = m_coeff1[i].y();
    m_coefbuf[i*12+5] = m_coeff1[i].z();

    m_coefbuf[i*12+6] = m_coeff2[i].x();
    m_coefbuf[i*12+7] = m_coeff2[i].y();
    m_coefbuf[i*12+8] = m_coeff2[i].z();

    m_coefbuf[i*12+9] = m_coeff3[i].x();
    m_coefbuf[i*12+10] = m_coeff3[i].y();
    m_coefbuf[i*12+11] = m_coeff3[i].z();
  }
*/
  
  m_pCoefTex->setData(m_scoeff.getPoints() * 12, m_scoeff.getCoefArray());
}

/// update coord texture for GLSL rendering
void Spline2Seg::updateDynamicGLSL(Spline2Renderer *pthis)
{
  updateScoeffDynamic(pthis);
  updateCoefTex();
}

void Spline2Seg::updateStaticGLSL(Spline2Renderer *pthis)
{
  updateScoeffStatic(pthis);
  updateCoefTex();
}

/// Initialize shaders/texture
void Spline2Seg::updateGLSLColor(Spline2Renderer *pthis)
{
  MolCoordPtr pCMol = pthis->getClientMol();

  qlib::uid_t nSceneID = pthis->getSceneID();

  MolAtomPtr pA;
  ColorPtr pcol;
  quint32 dcc;
  int i;
  float par;

  AttrArray &attra = *m_pAttrAry;

  for (i=0; i<m_nVA; ++i) {
    dcc = calcColor(pthis, pCMol, i);

    attra.at(i).r = (qbyte) gfx::getRCode(dcc);
    attra.at(i).g = (qbyte) gfx::getGCode(dcc);
    attra.at(i).b = (qbyte) gfx::getBCode(dcc);
    attra.at(i).a = (qbyte) gfx::getACode(dcc);
  }
}

/// display() for GLSL version
void Spline2Seg::drawGLSL(Spline2Renderer *pthis, DisplayContext *pdc)
{
  const double lw = pthis->getLineWidth();
  //m_pVBO->setLineWidth(lw);
  //pdc->drawElem(*m_pVBO);

  pdc->setLineWidth(lw);

  m_pCoefTex->use(0);

  pthis->m_pPO->enable();

  // Setup uniforms
  pthis->m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  pthis->m_pPO->setUniform("coefTex", 0);
  pthis->m_pPO->setUniform("u_npoints", m_scoeff.getSize());

  pdc->drawElem(*m_pAttrAry);

  pthis->m_pPO->disable();
  m_pCoefTex->unuse();
}

///////////////////////////////////////////////
// Spline routines

#if 0
void Spline2Seg::generateNaturalSpline()
{
  int i;

  if (m_nPoints==2) {
    // Degenerated case (line)
    const Vector3F &p0 = m_pos[0];
    const Vector3F &p1 = m_pos[1];

    m_coeff3[0] = Vector3F();
    m_coeff2[0] = Vector3F();
    m_coeff1[0] = p1-p0;
    m_coeff0[0] = p0;
    return;
  }

  ///////////////////////////////////////////////////
  // calculate natural spline coeffs

  int intNo = m_nPoints - 1;  // number of intervals
  int equNo = intNo - 1;  // number of equations

  // interval sizes
  std::vector<float> h(intNo), ih(intNo);

  // diagonal of tridiagonal matrix
  std::vector<float> a(equNo);
  // constant part of linear equations
  VecArray dvec(equNo);
  
  // LR decomposition of tridiagonal matrix
  std::vector<float> m(equNo), l(equNo - 1);
  // ??
  VecArray yvec(equNo), xvec(equNo);

  Vector3F d0, d1;

  const VecArray &invec = m_pos;
  
  // calculate interval sizes as distance between points
  for (i = 0; i < intNo; i++) {
    //h[i] = Vec3DiffAbs(invec[i], invec[i + 1]);
    h[i] = (invec[i]-invec[i+1]).length();
    ih[i] = 1.0f / h[i];
  }

  // calculate diagonal of tridiagonal matrix
  for (i = 0; i < equNo; i++)
    a[i] = 2.0f * (h[i] + h[i + 1]);

  // calculate LR decomposition of tridiagonal matrix
  m[0] = a[0];
  for (i = 0; i < equNo - 1; i++) {
    l[i] = h[i + 1] / m[i];
    m[i + 1] = a[i + 1] - l[i] * h[i + 1];
  }

  // interpolation is done separately for all 3 coordinates

  for (i = 0; i < equNo; i++) {
    // dvec[i] = 6.0*(ih[i]*(invec[i+1] - invec[i]) - ih[i+1]*(invec[i+2] - invec[i+1]));
    Vector3F dif1 = invec[i+1] - invec[i];
    Vector3F dif2 = invec[i+2] - invec[i+1];
    dvec[i] = dif1.scale(ih[i]) - dif2.scale(ih[i+1]);
    dvec[i] = dvec[i].scale(6.0f);
  }

  // forward elimination
  yvec[0] = dvec[0];
  for (i = 1; i < equNo; i++)
    yvec[i] = dvec[i] - yvec[i-1].scale(l[i-1]);

  // back substitution
  xvec[equNo-1] = yvec[equNo-1].scale(-1.0f/m[equNo-1]);
  for (i = equNo - 2; i >= 0; i--) {
    xvec[i] = yvec[i] + xvec[i+1].scale(h[i+1]);
    xvec[i] = xvec[i].scale(-1.0f/m[i]);
  }
  
  // calculate spline points
  for (i = 0; i < intNo; i++) {
    // calculate polynom coefficients
    if (i == 0)
      d0 = Vector3F(); // zero vector
    else
      d0 = xvec[i-1];
    
    if (i == intNo-1)
      d1 = Vector3F(); // zero vector
    else
      d1 = xvec[i];
    
    float hsq = h[i]*h[i];
    m_coeff3[i] = (d1 - d0).scale(hsq/6.0f);
    m_coeff2[i] = d0.scale(0.5f*hsq);
    m_coeff1[i] = invec[i+1] - invec[i] - (d1 + d0.scale(2.0f)).scale(hsq/6.0f);
    m_coeff0[i] = invec[i];
  }
}

void Spline2Seg::interpolate(float par, Vector3F *vec,
                             Vector3F *dvec /*= NULL*/,
                             Vector3F *ddvec /*= NULL*/)
{
  // check parameter value f
  int ncoeff = int(::floor(par));
  if (ncoeff<0)
    ncoeff = 0;
  if (ncoeff>=(m_nPoints-1))
    ncoeff = m_nPoints-2;

  const Vector3F &coeff0 = m_coeff0[ncoeff];
  const Vector3F &coeff1 = m_coeff1[ncoeff];
  const Vector3F &coeff2 = m_coeff2[ncoeff];
  const Vector3F &coeff3 = m_coeff3[ncoeff];

  float f = par - float(ncoeff);

  Vector3F tmp;
  tmp = coeff3.scale(f) + coeff2;
  tmp = tmp.scale(f) + coeff1;
  tmp = tmp.scale(f) + coeff0;
  *vec = tmp;

  if (dvec != NULL) {
    // calculate tangential vector
    tmp = coeff3.scale(3.0f*f) + coeff2.scale(2.0f);
    tmp = tmp.scale(f) + coeff1;
    *dvec = tmp;
  }

  if (ddvec != NULL) {
    // calculate curvature vector
    tmp = coeff3.scale(6.0f*f) + coeff2.scale(2.0f);
    *ddvec = tmp;
  }
}
#endif

